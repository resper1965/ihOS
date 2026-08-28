import { describe, it, expect } from 'vitest';
import {
  contributionOf,
  CURATION_POLICY_VERSION,
  CURATION_POLICY_OWNER,
} from '@/lib/assessment/curation/policy';

const official = { is_official: true, relationship_strength: null as number | null };

describe('the curation policy is explicit about what counts', () => {
  it('counts equal and subset as satisfying, because subset means the requirement fits inside the control', () => {
    // Vendor-answered 2026-08-27 (Q7): the operator names are
    // requirement-relative — read `requirement <operator> control`. So
    // `subset` is requirement ⊂ control: the control covers the whole
    // requirement. Our first draft had this and `superset` reversed.
    expect(contributionOf({ ...official, relationship_type: 'equal' })).toBe('satisfies');
    expect(contributionOf({ ...official, relationship_type: 'subset' })).toBe('satisfies');
  });

  it('treats superset as partial, never as conforming', () => {
    // requirement ⊃ control: the control covers only part of the requirement,
    // and cannot reach full coverage without work on the requirement side. The
    // vendor caps it at 0.5 for the same reason.
    //
    // Product owner, 2026-08-27: "parcial é parcial."
    expect(contributionOf({ ...official, relationship_type: 'superset' })).toBe('partial');
    // Strength must not rescue it. Even a 1.0 superset is partial coverage.
    expect(contributionOf({ ...official, relationship_type: 'superset', relationship_strength: 1 }))
      .toBe('partial');
  });

  it('never lets intersects satisfy a requirement, at any strength', () => {
    for (const s of [null, 0, 0.1, 0.5, 0.9, 0.99, 1]) {
      expect(contributionOf({ ...official, relationship_type: 'intersects', relationship_strength: s }))
        .toBe('needs_review');
    }
  });

  it('excludes no_relation', () => {
    expect(contributionOf({ ...official, relationship_type: 'no_relation' })).toBe('excluded');
  });

  it('routes an unofficial mapping to review however strong it looks', () => {
    // An unofficial mapping may be someone's synthetic guess. It does not get to
    // move a customer-facing number without a human saying so — and this is the
    // guard that would have caught the 25,589 fabricated rows had they arrived
    // through this path.
    for (const t of ['equal', 'subset', 'superset', 'intersects'] as const) {
      expect(contributionOf({ relationship_type: t, relationship_strength: 1, is_official: false }))
        .toBe('needs_review');
    }
    // …except no_relation, which is excluded regardless of who asserted it.
    expect(contributionOf({ relationship_type: 'no_relation', relationship_strength: 1, is_official: false }))
      .toBe('excluded');
  });

  it('ignores relationship_strength entirely, because the vendor never populated it', () => {
    // Every strength the API serves is 0.500: their importer enum-ised the
    // source value, then seeding ran (parseFloat("strong") || 0.5). A policy
    // that read this field would be reading a constant. If a future seed makes
    // it meaningful, that is a policy version bump, not a silent behaviour change.
    const forStrength = (s: number | null) =>
      contributionOf({ relationship_type: 'subset', relationship_strength: s, is_official: true });
    expect(new Set([0, 0.5, 1, null].map(forStrength)).size).toBe(1);
  });

  it('carries a version and a named owner, so a score can cite what produced it', () => {
    expect(CURATION_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    // The vendor confirmed no official SCF guidance designates which
    // relationship types satisfy a requirement for audit purposes. This is our
    // judgement, so it is recorded as ours rather than presented as derived.
    expect(CURATION_POLICY_OWNER).toBeTruthy();
    expect(CURATION_POLICY_OWNER).toContain('@');
  });

  it('reports an unrecorded relationship as its own state, never as intersects', () => {
    // The vendor is replacing the hardcoded `intersects` from xlsx-importer.ts:353
    // with values from their STRM bundle, which covers 5,008 of 79,133 mappings.
    // So ~94% will arrive with nothing recorded, and calling that `intersects`
    // would keep the fabrication alive under a new name — `intersects` asserts
    // partial overlap, null asserts nothing.
    //
    // It is also kept apart from `needs_review`, because the two wait on
    // different people: review is a judgement someone can make from the mapping
    // in hand; unrecorded means nobody can until the vendor supplies it.
    expect(contributionOf({ ...official, relationship_type: null })).toBe('unrecorded');
    expect(contributionOf({ ...official, relationship_type: null, relationship_strength: 1 }))
      .toBe('unrecorded');
    expect(contributionOf({ relationship_type: null, relationship_strength: null, is_official: false }))
      .toBe('unrecorded');
  });

  it('has a rule for every relationship type the vendor defines', () => {
    // If the vendor adds a sixth type, this fails — which is the point. The
    // sync throws on an unknown type and the migration's CHECK refuses it, but
    // this asserts the policy side of the same contract.
    for (const t of ['equal', 'subset', 'intersects', 'superset', 'no_relation'] as const) {
      expect(() => contributionOf({ ...official, relationship_type: t })).not.toThrow();
    }
    expect(() =>
      contributionOf({ ...official, relationship_type: 'something_new' as never }),
    ).toThrow(/no rule/i);
  });
});
