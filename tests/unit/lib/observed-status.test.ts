// tests/unit/lib/observed-status.test.ts
// Unit tests for the analytical posture axis derivation
// (src/lib/posture/observed-status.ts)

import { describe, it, expect } from 'vitest';
import {
  deriveObservedStatus,
  summarizeSignals,
  type RuntimeSignal,
} from '@/lib/posture/observed-status';

function signal(overrides: Partial<RuntimeSignal> = {}): RuntimeSignal {
  return {
    scf_control_code: 'VPM-01',
    severity: 'High',
    active: true,
    risk_accepted: false,
    is_mitigated: false,
    ...overrides,
  };
}

describe('deriveObservedStatus', () => {
  it('returns clean when there are no signals', () => {
    expect(deriveObservedStatus([])).toBe('clean');
  });

  it('returns violated for a live Critical/High signal', () => {
    expect(deriveObservedStatus([signal({ severity: 'Critical' })])).toBe('violated');
    expect(deriveObservedStatus([signal({ severity: 'High' })])).toBe('violated');
  });

  it('returns degraded for live Medium/Low signals', () => {
    expect(deriveObservedStatus([signal({ severity: 'Medium' })])).toBe('degraded');
    expect(deriveObservedStatus([signal({ severity: 'Low' })])).toBe('degraded');
  });

  it('ignores mitigated and inactive signals entirely', () => {
    expect(deriveObservedStatus([
      signal({ severity: 'Critical', is_mitigated: true }),
      signal({ severity: 'Critical', active: false }),
    ])).toBe('clean');
  });

  it('treats risk-accepted Critical/High as degraded, not violated', () => {
    expect(deriveObservedStatus([signal({ severity: 'Critical', risk_accepted: true })])).toBe('degraded');
  });

  it('treats risk-accepted Medium as clean (governed, low exposure)', () => {
    expect(deriveObservedStatus([signal({ severity: 'Medium', risk_accepted: true })])).toBe('clean');
  });

  it('does not degrade on Info-only signals', () => {
    expect(deriveObservedStatus([signal({ severity: 'Info' })])).toBe('clean');
  });

  it('violated wins over degraded when both are present', () => {
    expect(deriveObservedStatus([
      signal({ severity: 'Low' }),
      signal({ severity: 'High' }),
    ])).toBe('violated');
  });
});

describe('summarizeSignals', () => {
  it('groups signals per control and separates violated from degraded', () => {
    const rows = [
      signal({ scf_control_code: 'IAC-01', severity: 'Critical' }),
      signal({ scf_control_code: 'IAC-01', severity: 'Low' }),
      signal({ scf_control_code: 'CRY-05', severity: 'Medium' }),
      signal({ scf_control_code: 'NET-03', severity: 'High', is_mitigated: true }),
    ];

    const summary = summarizeSignals(rows);

    expect(summary.violated.map((v) => v.scfControlCode)).toEqual(['IAC-01']);
    expect(summary.degraded.map((d) => d.scfControlCode)).toEqual(['CRY-05']);
    expect(summary.totalSignals).toBe(4);

    const iac = summary.violated[0];
    expect(iac.activeSignals).toBe(2);
    expect(iac.criticalOrHigh).toBe(1);
  });

  it('sorts violated controls by Critical/High count descending', () => {
    const rows = [
      signal({ scf_control_code: 'AAA-01', severity: 'High' }),
      signal({ scf_control_code: 'BBB-02', severity: 'Critical' }),
      signal({ scf_control_code: 'BBB-02', severity: 'High' }),
    ];

    const summary = summarizeSignals(rows);
    expect(summary.violated.map((v) => v.scfControlCode)).toEqual(['BBB-02', 'AAA-01']);
  });

  it('tracks the most recent synced_at across rows', () => {
    const rows = [
      { ...signal(), synced_at: '2026-07-01T00:00:00Z' },
      { ...signal({ scf_control_code: 'CRY-01' }), synced_at: '2026-07-06T12:00:00Z' },
    ];

    const summary = summarizeSignals(rows);
    expect(summary.lastSyncedAt).toBe('2026-07-06T12:00:00Z');
  });
});
