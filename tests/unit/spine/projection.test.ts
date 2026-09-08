import { describe, it, expect } from 'vitest';
import { computeProjection, type ProjectionInput } from '@/lib/assessment/projection';
import { CURATION_POLICY_VERSION } from '@/lib/assessment/curation/policy';

const mapping = (over: Partial<ProjectionInput['mappings'][number]> = {}) => ({
  requirement_code: 'r1',
  control_code: 'GOV-01',
  relationship_type: 'subset' as const,
  relationship_strength: null,
  is_official: true,
  ...over,
});

describe('a framework score is a projection that can explain itself', () => {
  it('counts a requirement satisfied only when a conforming control fully covers it', () => {
    const p = computeProjection({
      mappings: [
        mapping({ requirement_code: 'r1', control_code: 'GOV-01' }),
        mapping({ requirement_code: 'r2', control_code: 'GOV-02' }),
      ],
      verdicts: new Map([
        ['GOV-01', 'conforming'],
        ['GOV-02', 'gap'],
      ]),
    });

    expect(p.requirementsTotal).toBe(2);
    expect(p.requirementsSatisfied).toBe(1);
    expect(p.score).toBeCloseTo(0.5);
  });

  it('reports requirements needing review separately, never folded into the score', () => {
    const p = computeProjection({
      mappings: [
        mapping({ requirement_code: 'r1', relationship_type: 'subset' }),
        mapping({ requirement_code: 'r2', relationship_type: 'intersects', control_code: 'GOV-02' }),
      ],
      verdicts: new Map([
        ['GOV-01', 'conforming'],
        ['GOV-02', 'conforming'],
      ]),
    });

    expect(p.requirementsTotal).toBe(2);
    expect(p.requirementsSatisfied).toBe(1);
    expect(p.requirementsNeedingReview).toBe(1);
    // The figure a customer sees must not silently absorb the ambiguous one.
    expect(p.score).toBeCloseTo(0.5);
  });

  it('keeps a superset mapping out of satisfied, however conforming the control', () => {
    // requirement ⊃ control: the control covers only part of the requirement.
    // "Parcial é parcial" — it is reported, and it is not coverage.
    const p = computeProjection({
      mappings: [mapping({ relationship_type: 'superset' })],
      verdicts: new Map([['GOV-01', 'conforming']]),
    });

    expect(p.requirementsSatisfied).toBe(0);
    expect(p.requirementsPartial).toBe(1);
    expect(p.score).toBe(0);
  });

  it('lets one satisfying mapping carry a requirement that also has weaker ones', () => {
    // A requirement mapped by three controls is met if any conforming control
    // covers it whole. The weaker mappings are not evidence against it.
    const p = computeProjection({
      mappings: [
        mapping({ requirement_code: 'r1', control_code: 'GOV-01', relationship_type: 'superset' }),
        mapping({ requirement_code: 'r1', control_code: 'GOV-02', relationship_type: 'intersects' }),
        mapping({ requirement_code: 'r1', control_code: 'GOV-03', relationship_type: 'subset' }),
      ],
      verdicts: new Map([
        ['GOV-01', 'conforming'],
        ['GOV-02', 'conforming'],
        ['GOV-03', 'conforming'],
      ]),
    });

    expect(p.requirementsTotal).toBe(1);
    expect(p.requirementsSatisfied).toBe(1);
    expect(p.requirementsNeedingReview).toBe(0);
    expect(p.score).toBe(1);
  });

  it('excludes no_relation mappings from the denominator entirely', () => {
    const p = computeProjection({
      mappings: [
        mapping({ requirement_code: 'r1' }),
        mapping({ requirement_code: 'r2', relationship_type: 'no_relation' }),
      ],
      verdicts: new Map([['GOV-01', 'conforming']]),
    });

    expect(p.requirementsTotal).toBe(1);
    expect(p.score).toBe(1);
  });

  it('refuses to produce a score when the denominator is zero', () => {
    const p = computeProjection({ mappings: [], verdicts: new Map() });
    expect(p.score).toBeNull();
    expect(p.reason).toBe('no_requirements_mapped');
    expect(p.requirementsTotal).toBe(0);
  });

  it('refuses a score when requirements are known but none was settled', () => {
    // Found by running this against real data. The vendor's crosswalk is 99.99%
    // `intersects`, the policy sends every `intersects` to human review, so even
    // with every control conforming the result was 148 requirements, 0 satisfied,
    // 148 in review — and this returned `score: 0`.
    //
    // A 0 there is indistinguishable on a dashboard from a genuine 0% and
    // arrives with more authority, because a policy version is stamped on it.
    // "We know what this framework asks and settled none of it" is not zero
    // per cent.
    const p = computeProjection({
      mappings: [
        mapping({ requirement_code: 'r1', relationship_type: 'intersects' }),
        mapping({ requirement_code: 'r2', relationship_type: 'intersects', control_code: 'GOV-02' }),
      ],
      verdicts: new Map([
        ['GOV-01', 'conforming'],
        ['GOV-02', 'conforming'],
      ]),
    });

    expect(p.requirementsTotal).toBe(2);
    expect(p.requirementsNeedingReview).toBe(2);
    expect(p.score).toBeNull();
    expect(p.reason).toBe('nothing_assessable');
  });

  it('scores over ALL requirements once any is settled, not only the settled ones', () => {
    // One satisfied out of three is 33%, not 100%. Dividing by the settled
    // subset would report full compliance while two requirements went unlooked-at.
    const p = computeProjection({
      mappings: [
        mapping({ requirement_code: 'r1', control_code: 'GOV-01' }),
        mapping({ requirement_code: 'r2', control_code: 'GOV-02', relationship_type: 'intersects' }),
        mapping({ requirement_code: 'r3', control_code: 'GOV-03', relationship_type: 'intersects' }),
      ],
      verdicts: new Map([
        ['GOV-01', 'conforming'],
        ['GOV-02', 'conforming'],
        ['GOV-03', 'conforming'],
      ]),
    });

    expect(p.requirementsTotal).toBe(3);
    expect(p.requirementsSatisfied).toBe(1);
    expect(p.requirementsNeedingReview).toBe(2);
    expect(p.score).toBeCloseTo(1 / 3);
  });

  it('reports a control with no evaluated verdict rather than assuming a gap', () => {
    // An unevaluated control is not a failing control. Conflating the two is how
    // three nightly runs recorded scores against zero evaluated controls.
    const p = computeProjection({
      mappings: [mapping({ control_code: 'GOV-99' })],
      verdicts: new Map(),
    });

    expect(p.requirementsSatisfied).toBe(0);
    expect(p.requirementsUnevaluated).toBe(1);
    expect(p.score).toBeCloseTo(0);
  });

  it('stamps the policy version and owner onto the result', () => {
    const p = computeProjection({ mappings: [], verdicts: new Map() });
    expect(p.policyVersion).toBe(CURATION_POLICY_VERSION);
    expect(p.policyOwner).toContain('@');
  });
});

describe('projecting from the crosswalk reads exactly one catalogue version', () => {
  // On 2026-09-08 the vendor re-imported the STRM bundle and minted a NEW
  // scf_version_id (826a1f05…). The old rows (8260df81…) stayed in
  // scf_control_mappings, and they are the ones carrying the fabricated
  // `intersects` that the re-import removed. A read that does not name a
  // version therefore mixes corrected rows with the exact rows the correction
  // was for — and produces a number nobody can explain, which is the one thing
  // this projection exists to prevent.
  function clientRecording(calls: Array<[string, string]>, mappings: unknown[]) {
    const filterable = (rows: unknown[]) => {
      const self = {
        eq(col: string, v: string) {
          calls.push([col, v]);
          return self;
        },
        maybeSingle: async () => ({
          data: { vendor_framework_code: 'general-iso-27001-2022', confidence: 'exact' },
          error: null,
        }),
        then: (resolve: (r: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: rows, error: null }),
      };
      return self;
    };
    return {
      from(table: string) {
        return {
          select: () => filterable(table === 'scf_control_mappings' ? mappings : []),
        };
      },
    };
  }

  it('filters scf_control_mappings by scf_version_id', async () => {
    const { projectFrameworkFromCrosswalk } = await import('@/lib/assessment/projection');
    const calls: Array<[string, string]> = [];
    await projectFrameworkFromCrosswalk(
      'iso27001',
      [{ controlId: 'GOV-01', combinedStatus: 'conforming' }],
      {
        client: clientRecording(calls, [
          {
            requirement_code: 'A.5.1',
            control_code: 'GOV-01',
            relationship_type: 'equal',
            relationship_strength: null,
            is_official: true,
          },
        ]) as never,
        scfVersionId: '826a1f05-f065-4feb-9f44-ced8019a6701',
      },
    ).catch(() => undefined);

    expect(calls).toContainEqual([
      'scf_version_id',
      '826a1f05-f065-4feb-9f44-ced8019a6701',
    ]);
  });
});
