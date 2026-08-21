// src/lib/posture/bind-evidence.ts
// Provenance says "this chunk is about this control". Binding decides whether
// that claim is strong enough to count, and in which role.
//
// The role comes from the document type, which is a function — so a chunk
// cannot be emitted in two roles for the same control. That is the structural
// fix for the old engine, where the two phases were two fields on one object
// and the second could be assigned a copy of the first.

import { roleForDocType } from './evidence-role';
import type { EvidenceLink, ProvenanceRow } from './types';

/**
 * Upper bound of the reciprocal-rank-fusion score returned by
 * match_documents_hybrid, which aliases `combined_score` as `similarity`
 * (see supabase/migrations/20260701000002_add_clarity_to_rpc.sql:104).
 * It is NOT a cosine similarity — see local-engine.ts:27-29.
 */
export const RRF_CEILING = 0.033;

/**
 * Minimum normalised relevance for a chunk to count as evidence. At the
 * ceiling above, 0.65 corresponds to a raw RRF of ~0.0215 — just under the
 * 0.025 the previous engine treated as strong evidence.
 */
export const MIN_EVIDENCE_SCORE = 0.65;

/** Maps a raw RRF score onto 0..1 so thresholds mean what they look like. */
export function normalizeRrf(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(1, raw / RRF_CEILING);
}

export function buildEvidenceLinks(
  provenance: readonly ProvenanceRow[],
  docTypeByDocumentId: ReadonlyMap<number, string | null>,
  opts: { minScore?: number; productVersionId: string | null },
): EvidenceLink[] {
  const minScore = opts.minScore ?? MIN_EVIDENCE_SCORE;
  // Keyed by control + chunk, so one chunk holds at most one role per control.
  const best = new Map<string, EvidenceLink>();

  for (const row of provenance) {
    if (row.score < minScore) continue;

    // A document absent from the map is unknown, not assumed. Fail closed.
    if (!docTypeByDocumentId.has(row.documentId)) continue;

    const role = roleForDocType(docTypeByDocumentId.get(row.documentId));
    if (role === null) continue;

    const key = `${row.scfControlCode}:${row.chunkId}`;
    const existing = best.get(key);
    if (existing && existing.score >= row.score) continue;

    best.set(key, {
      scfControlCode: row.scfControlCode,
      productVersionId: opts.productVersionId,
      chunkId: row.chunkId,
      documentId: row.documentId,
      role,
      score: row.score,
      snippet: row.snippet,
    });
  }

  return [...best.values()];
}
