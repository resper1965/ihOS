// src/scripts/test-hardened-vectorization.ts
// Script de teste para validar o novo pipeline de vetorização endurecido (Stage 2 LLM).

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createAdminClient } from '../lib/supabase/admin';
import { chunkComplianceDocument } from '../lib/chat/chunker';
import { generateEmbeddings } from '../lib/chat/embeddings';
import { runPostIngestPipeline } from '../lib/chat/post-ingest-pipeline';
import { logger } from '../lib/logger';

async function runTest() {
  const admin = createAdminClient();
  const testFile = path.resolve(process.cwd(), 'scratch/test_isms_policy.md');
  const text = fs.readFileSync(testFile, 'utf8');

  console.log('--- TEST START: Hardened Vectorization Pipeline ---');
  console.log(`Document: ${testFile}`);

  // 1. Create Document Record
  const { data: doc, error: docError } = await admin
    .from('compliance_documents')
    .insert({
      title: 'TEST_ISMS_POLICY_MD',
      category: 'ISMS_CORE',
      status: 'published',
      language: 'pt',
      total_chunks: 0,
      version: '1.0.0',
      year: 2024
    } as any)
    .select('id')
    .single();

  if (docError || !doc) {
    console.error('Failed to create test document', docError);
    return;
  }

  const documentId = (doc as any).id;
  console.log(`Step 1: Document created with ID: ${documentId}`);

  // 2. Chunk (Compliance Chunker)
  const chunks = chunkComplianceDocument(text);
  console.log(`Step 2: Compliance Chunker produced ${chunks.length} chunks.`);

  // 3. Embed
  const embeddings = await generateEmbeddings(chunks.map(c => c.content));
  console.log(`Step 3: Generated ${embeddings.length} embeddings.`);

  // 4. Insert Chunks
  const chunkRows = chunks.map((c, i) => ({
    document_id: documentId,
    content: c.content,
    chunk_index: i,
    embedding: embeddings[i],
    metadata: c.metadata,
  }));

  const { error: chunkError } = await admin.from('document_chunks').insert(chunkRows as any);
  if (chunkError) {
    console.error('Failed to insert chunks', chunkError);
    return;
  }
  console.log(`Step 4: Inserted ${chunkRows.length} chunks into document_chunks.`);

  // 5. Run Post-Ingest Pipeline (The Hardened Stage)
  console.log('Step 5: Running Post-Ingest Pipeline (SCF Auto-tagging Stage 1 + Stage 2)...');
  
  const ingestChunks = chunks.map((chunk, idx) => ({
    content: chunk.content,
    chunk_index: idx,
    embedding: JSON.stringify(embeddings[idx]),
  }));

  const result = await runPostIngestPipeline(
    admin,
    documentId,
    null, // No version for test
    ingestChunks
  );

  console.log(`--- PIPELINE RESULT ---`);
  console.log(`Chunks Tagged: ${result.tagged}`);
  console.log(`Provenance Records Created: ${result.provenance}`);

  // 6. Verify Provenance Table
  const { data: prov, error: provError } = await (admin as any)
    .from('document_control_provenance')
    .select('scf_control_code, llm_status, similarity, llm_justification')
    .eq('document_id', documentId);

  if (provError) {
    console.error('Failed to verify provenance', provError);
  } else {
    console.log(`--- VERIFICATION: document_control_provenance ---`);
    console.table(prov);
  }

  console.log('--- TEST END ---');
}

runTest().catch(console.error);
