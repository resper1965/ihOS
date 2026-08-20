// tests/unit/posture/verdict.test.ts
// Pure verdict derivation — the 4-state logic, with no database.

import { describe, it, expect } from 'vitest';
import { deriveVerdict, isCompliant, verdictConfidence } from '@/lib/posture/verdict';
import type { EvidenceLink } from '@/lib/posture/types';

function link(role: EvidenceLink['role'], score = 0.8, chunkId = 1): EvidenceLink {
  return {
    scfControlCode: 'GOV-01',
    productVersionId: null,
    chunkId,
    documentId: 10,
    role,
    score,
    snippet: 'snippet',
  };
}

describe('deriveVerdict', () => {
  it('is conforming when both roles are present', () => {
    expect(deriveVerdict([link('policy'), link('operational', 0.8, 2)])).toBe('conforming');
  });

  it('is partial when only policy evidence is present', () => {
    expect(deriveVerdict([link('policy')])).toBe('partial');
  });

  it('is informal when only operational evidence is present', () => {
    expect(deriveVerdict([link('operational')])).toBe('informal');
  });

  it('is gap when there is no evidence at all', () => {
    expect(deriveVerdict([])).toBe('gap');
  });

  it('does not become conforming from many policy links alone', () => {
    const many = [link('policy', 0.9, 1), link('policy', 0.95, 2), link('policy', 0.99, 3)];
    expect(deriveVerdict(many)).toBe('partial');
  });
});

describe('isCompliant', () => {
  it('treats only conforming as compliant', () => {
    expect(isCompliant('conforming')).toBe(true);
    expect(isCompliant('partial')).toBe(false);
    expect(isCompliant('informal')).toBe(false);
    expect(isCompliant('gap')).toBe(false);
  });
});

describe('verdictConfidence', () => {
  it('is zero with no evidence', () => {
    expect(verdictConfidence([])).toBe(0);
  });

  it('averages the best score of each role, counting a missing role as zero', () => {
    // policy best 0.8, operational absent -> (0.8 + 0) / 2 = 0.4
    expect(verdictConfidence([link('policy', 0.8)])).toBe(40);
  });

  it('uses the best score per role, not the first', () => {
    const links = [link('policy', 0.4, 1), link('policy', 0.9, 2), link('operational', 0.5, 3)];
    // policy best 0.9, operational best 0.5 -> (0.9 + 0.5) / 2 = 0.7
    expect(verdictConfidence(links)).toBe(70);
  });
});
