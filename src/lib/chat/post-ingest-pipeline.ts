// src/lib/chat/post-ingest-pipeline.ts
// Post-ingest pipeline: SCF auto-tagging + control provenance persistence.
// Shared by upload and reindex routes to avoid duplication (DRY).

import { logger } from '@/lib/logger';
import { tagChunksWithScf } from './scf-tagger';
import { persistControlProvenance } from './control-provenance';
import type { SupabaseClient } from '@supabase/supabase-js';

interface IngestChunk {
  content: string;
  chunk_index: number;
  embedding: string; // JSON stringified
}

/**
 * Runs the post-ingest pipeline after chunks have been inserted into document_chunks:
 * 1. Fetches the real chunk IDs from the database
 * 2. Runs 2-stage SCF auto-tagging (cosine + LLM confirmation)
 * 3. Updates chunks with scf_controls[]
 * 4. Persists control provenance chain
 */
export async function runPostIngestPipeline(
  admin: SupabaseClient,
  documentId: number,
  productVersionId: string | null,
  chunks: IngestChunk[],
): Promise<{ tagged: number; provenance: number }> {
  // 1. Fetch real chunk IDs from the database
  const { data: dbChunks, error: fetchError } = await (admin as any)
    .from('document_chunks')
    .select('id, chunk_index')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true });

  if (fetchError || !dbChunks || dbChunks.length === 0) {
    logger.warn('Could not fetch chunk IDs for SCF tagging', {
      context: 'post-ingest',
      meta: { document_id: documentId, error: fetchError?.message },
    });
    return { tagged: 0, provenance: 0 };
  }

  // Map DB IDs back to chunk data
  const chunkMap = new Map<number, IngestChunk>();
  chunks.forEach((c) => chunkMap.set(c.chunk_index, c));

  const chunksWithIds = (dbChunks as Array<{ id: number; chunk_index: number }>)
    .map((db) => {
      const original = chunkMap.get(db.chunk_index);
      if (!original) return null;
      return {
        chunk_id: db.id,
        chunk_index: db.chunk_index,
        content: original.content,
        embedding: original.embedding,
      };
    })
    .filter(Boolean) as Array<{
      chunk_id: number;
      chunk_index: number;
      content: string;
      embedding: string;
    }>;

  if (chunksWithIds.length === 0) {
    return { tagged: 0, provenance: 0 };
  }

  // 2. Run 2-stage SCF auto-tagging
  const taggedChunks = await tagChunksWithScf(admin, chunksWithIds);

  // 3. Update chunks with scf_controls in the database
  let tagged = 0;
  for (const tc of taggedChunks) {
    if (tc.scf_controls.length > 0) {
      const { error: updateError } = await (admin as any)
        .from('document_chunks')
        .update({ scf_controls: tc.scf_controls })
        .eq('id', tc.chunk_id);

      if (!updateError) tagged++;
    }
  }

  // 4. Persist control provenance chain
  const { inserted } = await persistControlProvenance(
    admin,
    documentId,
    productVersionId,
    taggedChunks,
  );

  logger.info('Post-ingest pipeline complete', {
    context: 'post-ingest',
    meta: {
      document_id: documentId,
      chunks_processed: chunksWithIds.length,
      chunks_tagged: tagged,
      provenance_records: inserted,
    },
  });

  return { tagged, provenance: inserted };
}
