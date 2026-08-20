// src/lib/posture/persistence.ts
// The only file in the posture module that writes. Row shaping is exported
// separately so it can be tested without a client.

import type { EvidenceLink, ProvenanceRow } from './types';

export const PERSIST_BATCH_SIZE = 200;

type WriteResult = Promise<{ error: { message: string } | null }>;

/** The narrow slice of a Supabase client this module needs. */
export interface PostgrestLike {
  from(table: string): {
    upsert(values: unknown[], opts?: { onConflict?: string }): WriteResult;
    insert(values: unknown[]): WriteResult;
    delete(): {
      eq(column: string, value: string): WriteResult;
      is(column: string, value: null): WriteResult;
    };
  };
}

export function toProvenanceRecords(
  rows: readonly ProvenanceRow[],
): Array<Record<string, unknown>> {
  return rows.map((r) => ({
    document_id: r.documentId,
    chunk_id: r.chunkId,
    scf_control_code: r.scfControlCode,
    method: r.method,
    score: r.score,
    snippet: r.snippet,
    justification: r.justification,
  }));
}

export function toEvidenceRecords(
  links: readonly EvidenceLink[],
): Array<Record<string, unknown>> {
  return links.map((l) => ({
    scf_control_code: l.scfControlCode,
    product_version_id: l.productVersionId,
    chunk_id: l.chunkId,
    document_id: l.documentId,
    role: l.role,
    score: l.score,
    snippet: l.snippet,
  }));
}

async function upsertInBatches(
  client: PostgrestLike,
  table: string,
  records: Array<Record<string, unknown>>,
  onConflict: string,
): Promise<number> {
  let written = 0;
  for (let i = 0; i < records.length; i += PERSIST_BATCH_SIZE) {
    const batch = records.slice(i, i + PERSIST_BATCH_SIZE);
    const { error } = await client.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(error.message);
    written += batch.length;
  }
  return written;
}

export function persistProvenance(
  client: PostgrestLike,
  rows: readonly ProvenanceRow[],
): Promise<number> {
  return upsertInBatches(
    client,
    'evidence_provenance',
    toProvenanceRecords(rows),
    'chunk_id,scf_control_code',
  );
}

/**
 * Replaces all evidence for one scope: delete, then insert.
 *
 * Not an upsert. Every backfilled row has a NULL product_version_id, and
 * Postgres treats NULLs as distinct in a conflict target — so ON CONFLICT
 * would never match an existing row and a re-run would duplicate instead of
 * update. Delete-then-insert is idempotent without a conflict target, and it
 * also lets a chunk's role change between runs (which a role-keyed upsert
 * could not express).
 */
export async function replaceEvidenceForScope(
  client: PostgrestLike,
  productVersionId: string | null,
  links: readonly EvidenceLink[],
): Promise<number> {
  const scope = client.from('control_evidence').delete();
  const { error: deleteError } =
    productVersionId === null
      ? await scope.is('product_version_id', null)
      : await scope.eq('product_version_id', productVersionId);
  if (deleteError) throw new Error(deleteError.message);

  const records = toEvidenceRecords(links);
  let written = 0;
  for (let i = 0; i < records.length; i += PERSIST_BATCH_SIZE) {
    const batch = records.slice(i, i + PERSIST_BATCH_SIZE);
    const { error } = await client.from('control_evidence').insert(batch);
    if (error) throw new Error(error.message);
    written += batch.length;
  }
  return written;
}
