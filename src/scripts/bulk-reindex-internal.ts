import 'dotenv/config';
// Polyfill for WebSocket to avoid Supabase errors in Node 18
if (!global.WebSocket) {
  (global as any).WebSocket = class {};
}

import { createAdminClient } from '../lib/supabase/admin';
import { chunkComplianceDocument } from '../lib/chat/chunker';
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
      const arrayBuffer = await fileData.arrayBuffer();
      const mimeType = doc.file_format === 'pdf' ? 'application/pdf' : 'text/plain';
      const file = new File([arrayBuffer], doc.filename, { type: mimeType });
      const text = await extractText(file, doc.file_format || 'txt');

      // 4. Limpeza (Proveniência Antiga + Cache)
      await deleteControlProvenance(admin, doc.id);
      if (doc.product_version_id) {
        await (admin as any).from('control_evaluation_cache').delete().eq('product_version_id', doc.product_version_id);
      }
      await admin.from('document_chunks').delete().eq('document_id', doc.id);

      // 5. Chunking & Embeddings
      const chunks = chunkComplianceDocument(text);
      const embeddings = await generateEmbeddings(chunks.map(c => c.content));

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
