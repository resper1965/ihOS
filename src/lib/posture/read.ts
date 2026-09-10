// src/lib/posture/read.ts
// Turns evidence rows into per-control posture. Pure: the caller fetches the
// rows and the control list, this file decides what they mean.

import { deriveVerdict, verdictConfidence } from './verdict';
import type { EvidenceLink, Verdict } from './types';

export interface ControlPosture {
  scfControlCode: string;
  verdict: Verdict;
  confidence: number;
  policy: EvidenceLink[];
  operational: EvidenceLink[];
}

export interface ControlCodeSelection {
  /** The codes to actually query, capped at `max`. */
  codes: string[];
  /** The true distinct count, computed before capping — never the post-slice length. */
  totalDistinct: number;
  /** True only when the distinct count exceeds `max`, never on an exact match. */
  truncated: boolean;
}

/**
 * Distinct control codes carrying evidence, sorted and capped.
 *
 * Extracted so the subtitle and the truncation notice can both be driven by
 * the pre-slice count: computing them after `.slice()` states a truncated
 * number as the whole, and firing "more exist" on `length === max` is wrong
 * exactly when the corpus has precisely `max` codes and nothing was dropped.
 */
export function selectControlCodes(
  rows: readonly Record<string, unknown>[],
  max: number,
): ControlCodeSelection {
  const distinct = [...new Set(rows.map((r) => String(r.scf_control_code)))].sort();
  return {
    codes: distinct.slice(0, max),
    totalDistinct: distinct.length,
    truncated: distinct.length > max,
  };
}

export function rowsToLinks(rows: readonly Record<string, unknown>[]): EvidenceLink[] {
  return rows.map((r) => ({
    scfControlCode: String(r.scf_control_code),
    productVersionId: r.product_version_id == null ? null : String(r.product_version_id),
    chunkId: Number(r.chunk_id),
    documentId: Number(r.document_id),
    role: r.role === 'operational' ? 'operational' : 'policy',
    score: Number(r.score),
    snippet: String(r.snippet ?? ''),
  }));
}

/**
 * Every requested control gets a row. A control with no evidence is reported
 * as `gap`, never omitted — an absent control must not read as a pass.
 */
export function groupPosture(
  controlCodes: readonly string[],
  links: readonly EvidenceLink[],
): ControlPosture[] {
  const byControl = new Map<string, EvidenceLink[]>();
  for (const code of controlCodes) byControl.set(code, []);
  for (const l of links) {
    const bucket = byControl.get(l.scfControlCode);
    if (bucket) bucket.push(l);
  }

  const byScoreDesc = (a: EvidenceLink, b: EvidenceLink) => b.score - a.score;

  return controlCodes.map((code) => {
    const own = byControl.get(code) ?? [];
    return {
      scfControlCode: code,
      verdict: deriveVerdict(own),
      confidence: verdictConfidence(own),
      policy: own.filter((l) => l.role === 'policy').sort(byScoreDesc),
      operational: own.filter((l) => l.role === 'operational').sort(byScoreDesc),
    };
  });
}

export function summarise(postures: readonly ControlPosture[]): Record<Verdict, number> {
  const out: Record<Verdict, number> = { conforming: 0, partial: 0, informal: 0, gap: 0 };
  for (const p of postures) out[p.verdict] += 1;
  return out;
}
