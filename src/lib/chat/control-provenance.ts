// src/lib/chat/control-provenance.ts
// Persists the document → chunk → SCF control provenance chain.

import { logger } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TaggedChunk } from './scf-tagger';

/**
 * Persist control provenance records for tagged chunks.
 * Each chunk may map to multiple SCF controls.
 * Uses upsert to handle re-indexing gracefully.
 */
export async function persistControlProvenance(
  admin: SupabaseClient,
  documentId: number,
  productVersionId: string | null,
  taggedChunks: TaggedChunk[],
): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;

  const rows = taggedChunks.flatMap((chunk) =>
    chunk.scf_tag_results
      .filter(r => r.llm_status === 'implements' || r.llm_status === 'mentions')
      .map((result) => ({
        document_id: documentId,
        chunk_id: chunk.chunk_id,
        scf_control_code: result.control_code,
        similarity: result.similarity,
        llm_status: result.llm_status,
        extraction_method: 'llm_confirmed',
        evidence_snippet: chunk.content.slice(0, 300),
        llm_justification: result.justification,
        product_version_id: productVersionId,
      })),
  );

  if (rows.length === 0) {
    logger.info('No control provenance to persist', { context: 'control-provenance' });
    return { inserted: 0, errors: 0 };
  }

  // Batch insert in groups of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await (admin as any)
      .from('document_control_provenance')
      .upsert(batch, { onConflict: 'chunk_id,scf_control_code' });

    if (error) {
      logger.warn('Provenance batch insert failed', {
        context: 'control-provenance',
        meta: { error: error.message, batch_start: i },
      });
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  logger.info('Control provenance persisted', {
    context: 'control-provenance',
    meta: { document_id: documentId, inserted, errors, total_rows: rows.length },
  });

  return { inserted, errors };
}

/**
 * Delete all provenance records for a document.
 * Called before re-indexing to ensure clean slate.
 */
export async function deleteControlProvenance(
  admin: SupabaseClient,
  documentId: number,
): Promise<void> {
  const { error } = await (admin as any)
    .from('document_control_provenance')
    .delete()
    .eq('document_id', documentId);

  if (error) {
    logger.warn('Failed to delete provenance', {
      context: 'control-provenance',
      meta: { error: error.message, document_id: documentId },
    });
  }
}
