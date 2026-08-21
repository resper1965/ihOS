// src/lib/posture/verdict.ts
// The verdict is derived, never stored. It counts evidence by role, so it can
// never drift from the evidence that justifies it.
//
// This is the 4-state logic from src/lib/assessment/local-engine.ts:173-179,
// promoted to be the only logic and made a total function over rows.

import type { EvidenceLink, EvidenceRole, Verdict } from './types';

function bestScore(links: readonly EvidenceLink[], role: EvidenceRole): number {
  let best = 0;
  for (const l of links) {
    if (l.role === role && l.score > best) best = l.score;
  }
  return best;
}

function hasRole(links: readonly EvidenceLink[], role: EvidenceRole): boolean {
  return links.some((l) => l.role === role);
}

export function deriveVerdict(links: readonly EvidenceLink[]): Verdict {
  const policy = hasRole(links, 'policy');
  const operational = hasRole(links, 'operational');

  if (policy && operational) return 'conforming';
  if (policy) return 'partial';
  if (operational) return 'informal';
  return 'gap';
}

export function isCompliant(verdict: Verdict): boolean {
  return verdict === 'conforming';
}

/**
 * Mean of the best score in each role, as 0..100. A missing role counts as
 * zero, so a policy-only control cannot report high confidence.
 */
export function verdictConfidence(links: readonly EvidenceLink[]): number {
  if (links.length === 0) return 0;
  const policy = bestScore(links, 'policy');
  const operational = bestScore(links, 'operational');
  return Math.round(((policy + operational) / 2) * 100);
}
