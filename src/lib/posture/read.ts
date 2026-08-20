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
