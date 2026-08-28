// What a crosswalk mapping contributes to a framework figure.
//
// This is the only place that decides. The crosswalk is raw material: a vendor
// mapping states how a control relates to a requirement, not whether the
// requirement is met. Turning one into the other is a GRC judgement, and the
// vendor has confirmed there is no official SCF guidance designating which
// relationship types satisfy a requirement for audit purposes as opposed to
// merely relate to it. So this judgement is ours, and it is recorded as ours.
//
// Three properties are deliberate:
//
//   Pure. No I/O, no configuration read at runtime. A policy an environment
//   variable can change is a policy no score can cite.
//
//   Versioned. CURATION_POLICY_VERSION is stamped onto every figure produced
//   from it, so any number traces back to the rule that made it.
//
//   Owned. A named person, not a standard. Presenting our judgement as derived
//   from ISO or SCF would be the same class of dishonesty as the 25,589
//   fabricated mapping rows quarantined in migration 20260825000002.
//
// Spec: docs/superpowers/specs/2026-08-27-control-first-design.md §5

import { RELATIONSHIP_TYPES, type Relationship } from '@/lib/standard-api/sync/crosswalk';

/**
 * Bump on ANY change to the rules below. Format `YYYY-MM-DD.N`.
 *
 * A stored score naming an older version is not wrong — it is a score produced
 * under a rule that has since changed, and saying so is the whole point.
 */
export const CURATION_POLICY_VERSION = '2026-08-27.1';

/** Who answers for the rules below. Not a standards body — a person. */
export const CURATION_POLICY_OWNER = 'resper@ionic.health';

export type Contribution =
  /** The control covers the requirement. Counts toward coverage. */
  | 'satisfies'
  /** The vendor recorded no relationship. Not ambiguity — absence. */
  | 'unrecorded'
  /** Real but incomplete coverage. Its own state; never rolls up into satisfies. */
  | 'partial'
  /** A human must look. Never counted either way. */
  | 'needs_review'
  /** Not coverage at all. Not in the denominator either. */
  | 'excluded';

export interface MappingFacts {
  /** Null where the vendor has not recorded the relationship. Not `intersects`. */
  relationship_type: Relationship | null;
  relationship_strength: number | null;
  is_official: boolean;
}

/**
 * The vendor's operator names are **requirement-relative**: read each as
 * `requirement <operator> control`. Confirmed 2026-08-27 in answer to our Q7,
 * after our first draft assumed the opposite.
 *
 *   equal     requirement = control   exact coverage
 *   subset    requirement ⊂ control   the requirement fits inside the control
 *   superset  requirement ⊃ control   the control covers only part of it
 *   intersects requirement ∩ control  they overlap
 *
 * Nobody could have read this off the document: the convention was written down
 * nowhere, and the vendor's own weight table printed `⊂` beside the annotation
 * "SCF broader than req" — the symbol control-relative, the words
 * requirement-relative.
 */
const BY_RELATIONSHIP: Record<Relationship, Contribution> = {
  // The requirement and the control say the same thing.
  equal: 'satisfies',

  // requirement ⊂ control — implementing the control covers the whole
  // requirement and then some. Full coverage.
  subset: 'satisfies',

  // requirement ⊃ control — the requirement is broader than the control, so the
  // control alone cannot meet it. Partial, and no strength value rescues that:
  // it is a statement about scope, not about confidence. Product owner,
  // 2026-08-27: "parcial é parcial."
  superset: 'partial',

  // They overlap, and the mapping does not say how much of the requirement the
  // overlap accounts for. Counting this automatically is exactly how a number
  // stops being defensible, so it goes to a person.
  intersects: 'needs_review',

  // Stated non-relation. Not coverage, and not a gap either — it does not
  // belong in this framework's denominator at all.
  no_relation: 'excluded',
};

/**
 * What this mapping contributes. Throws for a relationship type with no rule —
 * the same contract the sync and the migration's CHECK constraint enforce, so a
 * sixth vendor value fails loudly at every layer instead of being guessed at one.
 *
 * `relationship_strength` is accepted and deliberately unused. Every value the
 * API serves today is `0.500`: the vendor's importer enum-ises the source's
 * numeric strength before storage, and seeding then ran
 * `(parseFloat("strong") || 0.5)`. Reading the field would be reading a
 * constant. If a future seed makes it meaningful, using it is a policy version
 * bump — not a silent change in what a score means.
 */
export function contributionOf(facts: MappingFacts): Contribution {
  // Absence of a recorded relationship is its own answer, and it is reported
  // separately from `needs_review`. Both keep a requirement out of the score,
  // but they call for different work: `needs_review` is a judgement a person can
  // make from the mapping in front of them, while `unrecorded` means the mapping
  // does not say enough for anyone to judge and the vendor has to supply it.
  // Folding them together would hide which of those a framework is waiting on.
  if (facts.relationship_type === null) return 'unrecorded';

  const rule = BY_RELATIONSHIP[facts.relationship_type];
  if (rule === undefined || !RELATIONSHIP_TYPES.includes(facts.relationship_type)) {
    throw new Error(
      `no rule for relationship_type "${String(facts.relationship_type)}" ` +
        `in curation policy ${CURATION_POLICY_VERSION}`,
    );
  }

  // A stated non-relation is a fact about the standards, not an assertion about
  // this organisation, so it is excluded whoever recorded it.
  if (rule === 'excluded') return 'excluded';

  // Everything else is a claim that a control bears on a requirement. An
  // unofficial claim may be someone's synthetic guess, and does not move a
  // customer-facing number without a human agreeing.
  if (!facts.is_official) return 'needs_review';

  return rule;
}

/** What a score should record about the rule that produced it. */
export function policyStamp(): { version: string; owner: string } {
  return { version: CURATION_POLICY_VERSION, owner: CURATION_POLICY_OWNER };
}
