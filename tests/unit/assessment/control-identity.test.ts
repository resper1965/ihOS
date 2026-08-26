// tests/unit/assessment/control-identity.test.ts
// The Standard API returns each control with BOTH a UUID (control_id) and a
// human code (control_code). Everything ihOS joins on — scf_framework_mappings,
// control_evaluation_cache, evidence_evaluations — keys on the code. Reading
// control_id therefore produced a UUID-versus-code comparison that was never
// true: framework filtering matched nothing (assessments evaluated 0 controls
// for three consecutive nightly runs), applicability exclusion was inert, and
// the evaluation cache never hit. See CONTRACT_AUDIT.md finding A9.

import { describe, it, expect } from 'vitest';
import { controlIdentity } from '@/lib/assessment/engine';

// Exactly the shape the live API returns (sampled 2026-08-26).
const apiControl = {
  control_id: '653a70ef-16fd-4d53-a637-ff61cd998729',
  control_code: 'AAT-01',
  control_title: 'Artificial Intelligence (AI) & Autonomous Technologies Governance',
  scf_version_id: '8260df81-979f-4eab-a525-26550ad95d79',
};

describe('controlIdentity', () => {
  it('prefers control_code over the control_id UUID', () => {
    expect(controlIdentity(apiControl)).toBe('AAT-01');
  });

  it('matches what scf_framework_mappings keys on', () => {
    // Real codes read from the live mapping table.
    const mapped = new Set(['AST-22', 'AST-01.4', 'END-14', 'AAT-01']);
    expect(mapped.has(controlIdentity(apiControl))).toBe(true);
  });

  it('never returns a UUID when a code is present', () => {
    const id = controlIdentity(apiControl);
    expect(id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('falls back to the local-fallback shape, which uses code-like control_id', () => {
    // tryLocalFallback fabricates controls as { control_id: "A.5.1" } — code
    // shaped, not a UUID — so control_id remains the right second choice.
    expect(controlIdentity({ control_id: 'A.5.1' })).toBe('A.5.1');
  });

  it('accepts the alternate `code` and `id` spellings', () => {
    expect(controlIdentity({ code: 'GOV-01' })).toBe('GOV-01');
    expect(controlIdentity({ id: 'GOV-02' })).toBe('GOV-02');
  });

  it('uses the indexed placeholder only when nothing identifies the control', () => {
    expect(controlIdentity({}, 7)).toBe('CTRL-7');
  });
});

describe('framework filtering with real shapes', () => {
  // Reproduces the A9 defect at the level that actually broke: a set built
  // from mapping-table codes, tested against API-shaped control objects.
  const mappingCodes = new Set(['AAT-01', 'AST-22', 'END-14']);
  const apiControls = [
    { control_id: '653a70ef-16fd-4d53-a637-ff61cd998729', control_code: 'AAT-01' },
    { control_id: '15573f52-e1b6-4703-99b9-ca48e7130d1f', control_code: 'AST-22' },
    { control_id: '9f2b1a44-0000-4000-8000-000000000000', control_code: 'ZZZ-99' },
  ];

  it('keeps exactly the controls the framework maps to', () => {
    const kept = apiControls.filter((c) => mappingCodes.has(controlIdentity(c)));
    expect(kept.map((c) => c.control_code)).toEqual(['AAT-01', 'AST-22']);
  });

  it('would have kept nothing under the old control_id comparison', () => {
    // The regression this pins: comparing the UUID against code-keyed mappings.
    const kept = apiControls.filter((c) => mappingCodes.has(c.control_id));
    expect(kept).toHaveLength(0);
  });
});
