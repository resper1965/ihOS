import 'dotenv/config';
// Polyfill for WebSocket to avoid Supabase errors in Node 18
if (!global.WebSocket) {
  (global as any).WebSocket = class {};
}

import { createAdminClient } from '../lib/supabase/admin';
import { chunkByFormat } from '../lib/chat/chunker';
import { generateEmbeddings } from '../lib/chat/embeddings';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Polyfill for File to avoid errors in Node 18
if (!global.File) {
  const { File } = require('node:buffer');
  (global as any).File = File;
}

import { extractText } from '../lib/chat/document-extractor';
import { deleteControlProvenance } from '../lib/chat/control-provenance';
import { runPostIngestPipeline } from '../lib/chat/post-ingest-pipeline';

/**
 * O mime do formato que o documento realmente tem.
 *
 * Um formato ausente ou desconhecido nao vira 'text/plain' aqui: devolver algo
 * generico e o que fazia resolveFileType aceitar uma planilha como texto. O
 * extrator recusa o que nao sabe ler, e este mapa nao tenta ajuda-lo a enganar.
 */
function mimeFor(format: string | null | undefined): string {
  switch (format) {
    case 'pdf': return 'application/pdf';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'txt': return 'text/plain';
    case 'md': return 'text/markdown';
    case 'csv': return 'text/csv';
    default: return 'application/octet-stream';
  }
}

async function runBulkReindexInternal() {
  const admin = createAdminClient();
  
  // 1. Pegar documentos (exceto o de teste)
  const { data: docs, error } = await admin
    .from('compliance_documents')
    .select('*')
    .neq('title', 'TEST_ISMS_POLICY_MD')
    .order('id', { ascending: true });

  if (error || !docs) {
    console.error('Error fetching documents:', error);
    return;
  }

  console.log(`\n🚀 Starting Bulk Reindex for ${docs.length} documents...`);

  for (const doc of docs) {
    console.log(`\n--- [${doc.id}] ${doc.title} ---`);
    
    try {
      // 2. Download de Storage
      const { data: fileData, error: downloadError } = await admin.storage
        .from('compliance_documents')
        .download(doc.filepath);

      if (downloadError || !fileData) {
        console.error(`  ❌ Download failed: ${downloadError?.message}`);
        continue;
      }

      // 3. Extrair Texto
      //
      // O mime vem do formato real, nao de um "text/plain" para tudo que nao e
      // PDF. Aquela heuristica fazia resolveFileType responder 'txt' para uma
      // planilha, e o extrator lia o zip como UTF-8: 22 documentos entraram
      // assim, com contagem de chunks para texto que nunca foi texto.
      const arrayBuffer = await fileData.arrayBuffer();
      // Mesmo quirk de tipagem do resto do arquivo: o .select('*') com .neq()
      // colapsa o tipo da linha e toda leitura de coluna e rejeitada.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const format = (doc as any).file_format as string | null;
      const file = new File([arrayBuffer], doc.filename, { type: mimeFor(format) });
      const text = await extractText(file, format || 'txt');

      // 4. Limpeza (Proveniência Antiga + Cache)
      await deleteControlProvenance(admin, doc.id);
      if (doc.product_version_id) {
        // The strict postgrest query-builder typing collapses this
        // .delete().eq() chain into a SelectQueryError type and rejects
        // 'product_version_id' as an .eq() key even though it's a real
        // control_evaluation_cache column (a known chained-query-typing
        // quirk); cast until that's resolved.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from('control_evaluation_cache').delete().eq('product_version_id', doc.product_version_id);
      }
      // 5. Chunking & Embeddings
      //
      // Antes do delete, de proposito. Este script apagava os chunks aqui e so
      // depois tentava produzir os novos; quando a extracao ou o embedding
      // falhava, o catch la embaixo engolia o erro, o laco seguia, e o
      // documento ficava sem nenhum chunk enquanto total_chunks continuava
      // dizendo o numero da ultima ingestao boa. Produzir primeiro e apagar
      // depois torna esse estado impossivel.
      const chunks = chunkByFormat(text, format);
      if (chunks.length === 0) {
        console.error(`  ❌ Extracao devolveu texto sem nenhum chunk — pulando, chunks antigos intactos.`);
        continue;
      }
      const embeddings = await generateEmbeddings(chunks.map(c => c.content));

      await admin.from('document_chunks').delete().eq('document_id', doc.id);

      // 6. Insert Chunks
      const chunkRows = chunks.map((c, i) => ({
        document_id: doc.id,
        content: c.content,
        embedding: JSON.stringify(embeddings[i]),
        chunk_index: i,
        char_count: c.content.length,
        section_title: c.metadata.sectionTitle || null
      }));

      const { error: insertError } = await admin.from('document_chunks').insert(chunkRows as any);
      if (insertError) throw insertError;

      // total_chunks so e escrito aqui, depois de o insert ter dado certo.
      // Este script nunca tocava nesse campo, entao um documento reindexado
      // ficava com a contagem da ingestao anterior — que e como 22 linhas
      // passaram a anunciar 834 chunks que nao existiam.
      // Mesmo quirk de tipagem ja documentado acima no delete de
      // control_evaluation_cache: a cadeia .update().eq() colapsa para
      // SelectQueryError e o 'id' e rejeitado apesar de ser coluna real.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from('compliance_documents')
        .update({ total_chunks: chunkRows.length })
        .eq('id', doc.id);

      // 7. Post-Ingest Pipeline (O Novo Cérebro GRC)
      console.log(`  🧠 Running Post-Ingest (SCF Stage 1 + Stage 2)...`);
      const ingestChunks = chunks.map((c, i) => ({
        content: c.content,
        chunk_index: i,
        embedding: JSON.stringify(embeddings[i])
      }));

      const result = await runPostIngestPipeline(
        admin,
        doc.id,
        doc.product_version_id || null,
        ingestChunks
      );

      console.log(`  ✅ Done: ${result.tagged} chunks tagged, ${result.provenance} provenance records.`);

    } catch (err) {
      console.error(`  ❌ Error processing document ${doc.id}:`, err);
    }
  }

  console.log('\n✨ Bulk Reindex Completed.');
}

runBulkReindexInternal().catch(console.error);
