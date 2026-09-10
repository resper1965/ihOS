// tests/unit/assessment/scorecard-backing.test.ts
// A score with nothing behind it must not be written. On 2026-08-26 an
// assessment that evaluated zero controls (finding A9) caused syncScorecard to
// delete the existing rows and write 0.0 for two frameworks, so the dashboard
// showed 0% for frameworks it had never measured. 0% is a real finding —
// "evaluated, nothing compliant" — and must stay distinguishable from
// "not evaluated", and from "could not compute".

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseAdmin } from '../../setup';
import {
  isScoreBacked,
  syncScorecard,
  stampedFrameworkEntries,
} from '@/lib/assessment/assessment-to-scorecard';
import type { AssessmentResult, FrameworkScore } from '@/lib/assessment/engine';

describe('isScoreBacked', () => {
  it('accepts a framework where controls were actually required and evaluated', () => {
    expect(isScoreBacked({ totalRequired: 582, implementedCount: 341, score: 58.6 })).toBe(true);
  });

  it('accepts a genuine zero — required controls, none implemented', () => {
    // This is a measurement, not an absence. It must still be written.
    expect(isScoreBacked({ totalRequired: 582, implementedCount: 0, score: 0 })).toBe(true);
  });

  it('rejects a framework where nothing was required, so nothing was measured', () => {
    expect(isScoreBacked({ totalRequired: 0, implementedCount: 0, score: null })).toBe(false);
  });

  it('rejects the incoherent case rather than guessing which field to trust', () => {
    // totalRequired 0 with a positive implementedCount cannot both be true;
    // refusing is safer than picking one.
    expect(isScoreBacked({ totalRequired: 0, implementedCount: 5, score: 0 })).toBe(false);
  });

  it('rejects "cannot compute" even when requirements exist', () => {
    // The projection returns null when no requirement is decidable. This
    // writer used to recompute implemented/total and write 0% — "cannot
    // compute" turned into "0% compliant" (spec 2026-09-10 §3.6).
    expect(isScoreBacked({ totalRequired: 148, implementedCount: 0, score: null })).toBe(false);
  });
});

describe('syncScorecard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const stamped: FrameworkScore = {
    frameworkId: 'iso27001',
    score: 22.97,
    implementedCount: 34,
    totalRequired: 148,
    missingControls: [],
    policyVersion: '2026-08-27.1',
    policyOwner: 'GRC lead',
  };

  function run(frameworkScores: FrameworkScore[]): AssessmentResult {
    return {
      config: { mode: 'deep' },
      frameworkScores,
      completedAt: '2026-09-11T02:10:00Z',
      totalControlsEvaluated: 80,
      totalControlsCompliant: 30,
    } as unknown as AssessmentResult;
  }

  function inserted(code: string) {
    return mockSupabaseAdmin.insert.mock.calls
      .map((c: unknown[]) => c[0] as { framework_code: string; score: unknown; snapshot_data: Record<string, unknown> })
      .find((row: { framework_code: string }) => row.framework_code === code);
  }

  it('writes the projection score with its policy stamp', async () => {
    await syncScorecard('a1', run([stamped]));
    const row = inserted('iso27001');
    expect(row?.score).toBe(23);
    expect(row?.snapshot_data.policy_version).toBe('2026-08-27.1');
    expect(row?.snapshot_data.policy_owner).toBe('GRC lead');
  });

  it("keeps frameworks[] in the 'all' row, and no cross-framework score", async () => {
    await syncScorecard('a1', run([stamped]));
    const all = inserted('all');
    expect(all?.score).toBeNull();
    expect(all?.snapshot_data).not.toHaveProperty('overall_score');
    const entries = all?.snapshot_data.frameworks as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      code: 'iso27001',
      score: 23,
      implemented: 34,
      total_required: 148,
      policy_version: '2026-08-27.1',
      policy_owner: 'GRC lead',
    });
  });

  it('writes nothing for a framework the projection could not score', async () => {
    await syncScorecard('a1', run([{ ...stamped, score: null }]));
    expect(mockSupabaseAdmin.insert).not.toHaveBeenCalled();
  });
});

describe('stampedFrameworkEntries', () => {
  it("returns the stamped entries of an 'all' row, mapped for display", () => {
    expect(
      stampedFrameworkEntries({
        frameworks: [
          {
            code: 'iso27001',
            name: 'ISO 27001',
            score: 23,
            implemented: 34,
            total_required: 148,
            policy_version: '2026-08-27.1',
            policy_owner: 'GRC lead',
          },
        ],
      }),
    ).toEqual([
      {
        code: 'iso27001',
        name: 'ISO 27001',
        score: 23,
        satisfied: 34,
        total: 148,
        policyVersion: '2026-08-27.1',
        policyOwner: 'GRC lead',
      },
    ]);
  });

  it('drops an entry with no policy stamp — the legacy cron wrote those', () => {
    expect(
      stampedFrameworkEntries({
        frameworks: [{ code: 'iso27001', name: 'ISO 27001', score: 61, implemented: 355, total_required: 582 }],
      }),
    ).toEqual([]);
  });

  it('drops an entry with no score or no requirements, and keeps a real zero', () => {
    const out = stampedFrameworkEntries({
      frameworks: [
        { code: 'a', score: null, implemented: 0, total_required: 148, policy_version: 'p' },
        { code: 'b', score: 0, implemented: 0, total_required: 0, policy_version: 'p' },
        { code: 'c', score: 0, implemented: 0, total_required: 148, policy_version: 'p' },
      ],
    });
    expect(out.map((e) => e.code)).toEqual(['c']);
  });

  it('returns nothing for a missing or malformed row', () => {
    expect(stampedFrameworkEntries(null)).toEqual([]);
    expect(stampedFrameworkEntries(undefined)).toEqual([]);
    expect(stampedFrameworkEntries({ score: 85 })).toEqual([]);
  });
});
