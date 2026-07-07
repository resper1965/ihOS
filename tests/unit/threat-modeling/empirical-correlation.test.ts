// tests/unit/threat-modeling/empirical-correlation.test.ts
// Unit tests for the STRIDE ↔ runtime-finding correlation
// (src/lib/threat-modeling/empirical-correlation.ts)

import { describe, it, expect } from 'vitest';
import {
  annotateEmpiricalConfirmation,
  STRIDE_BY_CWE,
  type EmpiricalFinding,
} from '@/lib/threat-modeling/empirical-correlation';

function finding(overrides: Partial<EmpiricalFinding> = {}): EmpiricalFinding {
  return {
    dd_finding_id: 101,
    title: 'SQL injection in /api/search',
    severity: 'Critical',
    cwe: 89,
    ...overrides,
  };
}

function modelWith(threats: Array<Record<string, unknown>>) {
  return {
    threat_model: { threats },
    metadata: { product_version: 'v2.5.0' },
  };
}

describe('STRIDE_BY_CWE', () => {
  it('covers the same top-20 CWE set as the DefectDojo mapper', () => {
    // Spot-check well-known classifications.
    expect(STRIDE_BY_CWE[89]).toContain('tampering');
    expect(STRIDE_BY_CWE[287]).toContain('spoofing');
    expect(STRIDE_BY_CWE[200]).toEqual(['information_disclosure']);
    expect(STRIDE_BY_CWE[532]).toContain('repudiation');
    expect(STRIDE_BY_CWE[862]).toContain('elevation_of_privilege');
    expect(Object.keys(STRIDE_BY_CWE)).toHaveLength(20);
  });
});

describe('annotateEmpiricalConfirmation', () => {
  it('flags a threat whose STRIDE category is hit by an active finding CWE', () => {
    const model = modelWith([
      { id: 'T1', stride_category: 'tampering', title: 'Payload tampering' },
      { id: 'T2', stride_category: 'denial_of_service', title: 'Queue exhaustion' },
    ]);

    const { data, observedThreatCount, correlatedFindingCount } =
      annotateEmpiricalConfirmation(model, [finding()]); // CWE-89 → tampering

    const [t1, t2] = data.threat_model.threats;
    expect(t1.empirically_observed).toBe(true);
    expect(t1.empirical_findings).toEqual([
      { dd_finding_id: 101, title: 'SQL injection in /api/search', severity: 'Critical', cwe: 89 },
    ]);
    expect(t2.empirically_observed).toBe(false);
    expect(t2.empirical_findings).toBeUndefined();
    expect(observedThreatCount).toBe(1);
    expect(correlatedFindingCount).toBe(1);
  });

  it('does not correlate findings without a mapped CWE', () => {
    const model = modelWith([{ id: 'T1', stride_category: 'tampering' }]);
    const { observedThreatCount } = annotateEmpiricalConfirmation(model, [
      finding({ cwe: null }),
      finding({ cwe: 99999 }),
    ]);
    expect(observedThreatCount).toBe(0);
  });

  it('sorts refs by severity and caps them at 5 per threat', () => {
    const findings = [
      finding({ dd_finding_id: 1, severity: 'Low', cwe: 89 }),
      finding({ dd_finding_id: 2, severity: 'Critical', cwe: 79 }),
      finding({ dd_finding_id: 3, severity: 'Medium', cwe: 89 }),
      finding({ dd_finding_id: 4, severity: 'High', cwe: 22 }),
      finding({ dd_finding_id: 5, severity: 'Info', cwe: 89 }),
      finding({ dd_finding_id: 6, severity: 'High', cwe: 79 }),
    ];
    const model = modelWith([{ id: 'T1', stride_category: 'tampering' }]);

    const { data } = annotateEmpiricalConfirmation(model, findings);
    const refs = data.threat_model.threats[0].empirical_findings;

    expect(refs).toHaveLength(5);
    expect(refs[0].severity).toBe('Critical');
    expect(refs.map((r: { dd_finding_id: number }) => r.dd_finding_id)).not.toContain(5);
  });

  it('counts each finding once even when it hits several threats', () => {
    const model = modelWith([
      { id: 'T1', stride_category: 'tampering' },
      { id: 'T2', stride_category: 'information_disclosure' },
    ]);

    // CWE-89 maps to both categories.
    const { observedThreatCount, correlatedFindingCount } =
      annotateEmpiricalConfirmation(model, [finding()]);

    expect(observedThreatCount).toBe(2);
    expect(correlatedFindingCount).toBe(1);
  });

  it('clears stale annotations from a previous correlation pass', () => {
    const model = modelWith([
      {
        id: 'T1',
        stride_category: 'spoofing',
        empirically_observed: true,
        empirical_findings: [{ dd_finding_id: 999, title: 'old', severity: 'High', cwe: 287 }],
      },
    ]);

    // The finding that used to confirm this threat was fixed — no findings now.
    const { data, observedThreatCount } = annotateEmpiricalConfirmation(model, []);
    const t1 = data.threat_model.threats[0];

    expect(observedThreatCount).toBe(0);
    expect(t1.empirically_observed).toBe(false);
    expect(t1.empirical_findings).toBeUndefined();
  });

  it('stamps summary metadata without touching the rest of the model', () => {
    const model = modelWith([{ id: 'T1', stride_category: 'tampering' }]);
    const { data } = annotateEmpiricalConfirmation(model, [finding()]);

    expect(data.metadata.product_version).toBe('v2.5.0');
    expect(data.metadata.empirical_correlation).toMatchObject({
      correlated_finding_count: 1,
      observed_threat_count: 1,
      total_active_findings: 1,
      correlation_level: 'stride-category',
    });
  });

  it('handles a model with no threats array gracefully', () => {
    const { data, observedThreatCount } = annotateEmpiricalConfirmation(
      { metadata: {} },
      [finding()],
    );
    expect(observedThreatCount).toBe(0);
    expect(data.threat_model.threats).toEqual([]);
  });
});
