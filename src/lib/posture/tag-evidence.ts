// src/lib/posture/tag-evidence.ts
// A second evidence source, alongside retrieval.
//
// `document_chunks.scf_controls[]` is not a topical hint. src/lib/chat/scf-tagger.ts
// runs cosine similarity against the SCF catalogue, then an LLM confirmation pass,
// and line 146 filters to `llm_status === 'implements'` before writing — with a
// prompt that says "Be strict. If in doubt, classify as 'mentions'." So each code
// in that array is a conservative, confirmed assertion that the chunk evidences
// the control being actively implemented.
//
// Retrieval scores a chunk against the control's *description*, which is written
// in policy language. An SBOM, a Sonar report or an audit log contains almost no
// prose resembling it, which is why operational chunks are retrieved at half the
// rate their corpus mass predicts. These tags find what that similarity cannot.

import type { ProvenanceRow } from './types';

/**
 * Score given to tag-derived provenance.
 *
 * This is an assertion, not a measurement. A tag carries no similarity score —
 * the tagger's own scores went to `document_control_provenance`, which does not
 * exist in this database. The value is floor-plus-epsilon: just above
 * MIN_EVIDENCE_SCORE (0.65), so a confirmed tag always clears the evidence
 * floor, and nothing more. It deliberately does NOT encode a claim that an
 * LLM-confirmed `implements` outranks a prose match — a higher constant would
 * always win `dedupeProvenance`'s score-based tie-break (discarding a real
 * measured retrieval score for a constant), would sort ahead of every
 * retrieval-derived row in `groupPosture`'s "top evidence" (making the
 * auditor-facing ranking an arbitrary tie-break), and would re-base
 * `verdictConfidence` to ~95 for any tag-backed control — a metric this work
 * declares out of scope. Consequence to keep in mind: tag-derived evidence
 * still cannot be ranked against itself, because every row carries the same
 * score, and a strong retrieval measurement can now legitimately outrank a
 * tag for the same pair.
 */
export const TAG_CONFIDENCE = 0.7;

const SNIPPET_LIMIT = 300;

export interface TaggedChunk {
  chunkId: number;
  documentId: number;
  snippet: string;
  controlCodes: string[];
}

export function rowsToTaggedChunks(
  rows: readonly Record<string, unknown>[],
): TaggedChunk[] {
  const out: TaggedChunk[] = [];
  for (const r of rows) {
    if (!Array.isArray(r.scf_controls)) continue;
    // A repeated code in one LLM response would otherwise yield two identical
    // provenance rows for the same (chunk, control) — an independent trigger
    // for the ON CONFLICT DO UPDATE failure dedupeProvenance exists to avoid.
    const controlCodes = [
      ...new Set(r.scf_controls.map((c) => String(c).trim()).filter((c) => c.length > 0)),
    ];
    if (controlCodes.length === 0) continue;

    // document_chunks.document_id is nullable (no NOT NULL — see
    // supabase/migrations/003_core_tables.sql:98), and Number(null) is 0, not
    // NaN, so a naive Number.isInteger check would let a null document_id
    // through disguised as document 0. A row with a null document_id (or a
    // malformed id) would otherwise take an FK violation against
    // evidence_provenance.document_id. Reject null explicitly, then require
    // both ids to be integers. Drop rather than admit.
    if (r.id == null || r.document_id == null) continue;
    const chunkId = Number(r.id);
    const documentId = Number(r.document_id);
    if (!Number.isInteger(chunkId) || !Number.isInteger(documentId)) continue;

    out.push({
      chunkId,
      documentId,
      snippet: String(r.content ?? '').slice(0, SNIPPET_LIMIT),
      controlCodes,
    });
  }
  return out;
}

/** Inverts chunks-to-codes into codes-to-chunks, so one read serves every control. */
export function indexByControl(
  chunks: readonly TaggedChunk[],
): Map<string, TaggedChunk[]> {
  const index = new Map<string, TaggedChunk[]>();
  for (const chunk of chunks) {
    for (const code of chunk.controlCodes) {
      const bucket = index.get(code);
      if (bucket) bucket.push(chunk);
      else index.set(code, [chunk]);
    }
  }
  return index;
}

export function tagProvenanceFor(
  index: ReadonlyMap<string, TaggedChunk[]>,
  controlCode: string,
): ProvenanceRow[] {
  const chunks = index.get(controlCode);
  if (!chunks) return [];
  return chunks.map((c) => ({
    documentId: c.documentId,
    chunkId: c.chunkId,
    scfControlCode: controlCode,
    method: 'llm_confirmed' as const,
    score: TAG_CONFIDENCE,
    snippet: c.snippet,
    justification: 'SCF tag confirmed as `implements` by scf-tagger',
  }));
}
