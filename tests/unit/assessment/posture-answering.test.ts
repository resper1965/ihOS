// tests/unit/assessment/posture-answering.test.ts
// Unit tests for posture-grounded answering primitives (F3 / Onda 2)
// (src/lib/assessment/posture-answering.ts)

import { describe, it, expect } from 'vitest';
import {
  rankScope,
  selectBestVerdicts,
  buildPostureGrounding,
  type MappedControl,
  type ControlVerdict,
} from '@/lib/assessment/posture-answering';

const FP = 'fp-current';

function cacheRow(overrides: Partial<{
  control_code: string;
  mode: 'quick' | 'deep';
  scope_key: string;
  corpus_fingerprint: string;
  evaluation: Record<string, unknown>;
  evaluated_at: string;
}> = {}) {
  return {
    control_code: 'IAC-01',
    mode: 'deep' as const,
    scope_key: 'v1:B2B_GEHC',
    corpus_fingerprint: FP,
    evaluation: { combinedStatus: 'conforming', confidenceScore: 88 },
    evaluated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('rankScope', () => {
  const wanted = { versionPart: 'v1', channelPart: 'B2B_GEHC' };

  it('ranks exact version+channel highest', () => {
    expect(rankScope('v1:B2B_GEHC', wanted)).toBe(3);
    expect(rankScope('v1:all', wanted)).toBe(2);
    expect(rankScope('global:B2B_GEHC', wanted)).toBe(1);
    expect(rankScope('global:all', wanted)).toBe(0);
  });

  it('rejects other versions and channels (isolation)', () => {
    expect(rankScope('v2:B2B_GEHC', wanted)).toBe(-1);
    expect(rankScope('v1:B2B_DIRECT', wanted)).toBe(-1);
  });
});

describe('selectBestVerdicts', () => {
  const wanted = { versionPart: 'v1', channelPart: 'B2B_GEHC' };

  it('prefers the most specific in-scope row and drops out-of-scope rows', () => {
    const rows = [
      cacheRow({ scope_key: 'global:all', evaluation: { combinedStatus: 'partial', confidenceScore: 50 } }),
      cacheRow({ scope_key: 'v1:B2B_GEHC', evaluation: { combinedStatus: 'conforming', confidenceScore: 90 } }),
      cacheRow({ scope_key: 'v1:B2B_DIRECT', evaluation: { combinedStatus: 'gap', confidenceScore: 10 } }),
    ];

    const verdicts = selectBestVerdicts(rows, wanted, FP);
    expect(verdicts.size).toBe(1);
    expect(verdicts.get('IAC-01')?.combinedStatus).toBe('conforming');
    expect(verdicts.get('IAC-01')?.scopeKey).toBe('v1:B2B_GEHC');
  });

  it('prefers deep mode over quick at the same scope rank', () => {
    const rows = [
      cacheRow({ mode: 'quick', evaluation: { combinedStatus: 'partial', confidenceScore: 60 } }),
      cacheRow({ mode: 'deep', evaluation: { combinedStatus: 'conforming', confidenceScore: 85 } }),
    ];
    const verdicts = selectBestVerdicts(rows, wanted, FP);
    expect(verdicts.get('IAC-01')?.mode).toBe('deep');
  });

  it('flags verdicts whose corpus fingerprint no longer matches as stale', () => {
    const rows = [cacheRow({ corpus_fingerprint: 'fp-old' })];
    const verdicts = selectBestVerdicts(rows, wanted, FP);
    expect(verdicts.get('IAC-01')?.stale).toBe(true);
  });

  it('carries the estimated flag from the evaluation payload', () => {
    const rows = [cacheRow({ evaluation: { combinedStatus: 'partial', confidenceScore: 40, isEstimated: true } })];
    const verdicts = selectBestVerdicts(rows, wanted, FP);
    expect(verdicts.get('IAC-01')?.isEstimated).toBe(true);
  });
});

describe('buildPostureGrounding', () => {
  const mapped: MappedControl[] = [
    { control_code: 'IAC-01', control_name: 'Identity & Access Mgmt', domain_code: 'IAC', similarity: 0.82 },
    { control_code: 'CRY-01', control_name: 'Use of Cryptography', domain_code: 'CRY', similarity: 0.74 },
  ];

  function verdict(overrides: Partial<ControlVerdict> = {}): ControlVerdict {
    return {
      controlCode: 'IAC-01',
      combinedStatus: 'conforming',
      confidenceScore: 88,
      evaluatedAt: '2026-07-01T00:00:00Z',
      scopeKey: 'v1:B2B_GEHC',
      mode: 'deep',
      stale: false,
      isEstimated: false,
      ...overrides,
    };
  }

  it('composes the context block from grounded controls only', () => {
    const verdicts = new Map([['IAC-01', verdict()]]);
    const g = buildPostureGrounding(mapped, verdicts);

    expect(g.hasVerdicts).toBe(true);
    expect(g.contextBlock).toContain('IAC-01');
    expect(g.contextBlock).toContain('CONFORMING');
    expect(g.contextBlock).not.toContain('CRY-01');
    expect(g.mappedControls).toHaveLength(2);
    expect(g.mappedControls[0].status).toBe('conforming');
    expect(g.mappedControls[1].status).toBeUndefined();
  });

  it('surfaces staleness and estimation flags in the block', () => {
    const verdicts = new Map([['IAC-01', verdict({ stale: true, isEstimated: true })]]);
    const g = buildPostureGrounding(mapped, verdicts);

    expect(g.hasStaleVerdict).toBe(true);
    expect(g.contextBlock).toContain('STALE');
    expect(g.contextBlock).toContain('ESTIMATED');
  });

  it('flags a weak mapping when no control clears the confident threshold', () => {
    const weak = mapped.map((m) => ({ ...m, similarity: 0.62 }));
    const g = buildPostureGrounding(weak, new Map());
    expect(g.weakMapping).toBe(true);
    expect(g.hasVerdicts).toBe(false);
    expect(g.contextBlock).toBe('');
  });

  it('flags a weak mapping when nothing mapped at all', () => {
    const g = buildPostureGrounding([], new Map());
    expect(g.weakMapping).toBe(true);
    expect(g.mappedControls).toEqual([]);
  });
});
