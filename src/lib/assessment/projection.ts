// A framework figure, computed as a projection.
//
// It replaces the call to POST /intelligence/compliance-score that engine.ts
// made at Phase 3. That endpoint returned 403, and the catch beneath it wrote
// `score: 0, totalRequired: 0` for every framework on every run — which is why
// the product produced zeros from real evaluation work.
//
// The arithmetic here is deliberately dull. Every interesting decision lives in
// src/lib/assessment/curation/policy.ts, and every figure this produces names
// the version of that policy, so a number can always be traced to the rule that
// made it.
//
// Spec: docs/superpowers/specs/2026-08-27-control-first-design.md §4-§5

import {
  contributionOf,
  policyStamp,
  type Contribution,
} from '@/lib/assessment/curation/policy';
import type { Relationship } from '@/lib/standard-api/sync/crosswalk';

/** The three states a control's evidence can be in. Nothing else is a verdict. */
export type ControlVerdict = 'conforming' | 'partial' | 'gap';

export interface ProjectionInput {
  /** Rows from scf_control_mappings, already filtered to one framework. */
  mappings: Array<{
    requirement_code: string;
    control_code: string;
    relationship_type: Relationship;
    relationship_strength: number | null;
    is_official: boolean;
  }>;
  /** Evidence verdicts by control code. A control absent here is UNEVALUATED. */
  verdicts: Map<string, ControlVerdict>;
}

export interface FrameworkProjection {
  /**
   * A RATIO in [0, 1] — satisfied requirements over projectable ones. Null when
   * there is nothing to divide by; never 0 as a stand-in.
   *
   * Note the scale. Everything downstream of engine.ts — the stored snapshots,
   * the dashboard thresholds at 70 and 40, the cron's score comparisons — works
   * in 0-100. engine.ts multiplies at the boundary. Returning a ratio here and
   * converting once is deliberate: a percentage that is sometimes 0.62 and
   * sometimes 62 is a 100× bug waiting for whoever reads it next.
   */
  score: number | null;
  reason: 'no_requirements_mapped' | 'nothing_assessable' | null;

  requirementsTotal: number;
  requirementsSatisfied: number;
  requirementsPartial: number;
  requirementsNeedingReview: number;
  requirementsUnevaluated: number;
  requirementsGap: number;

  policyVersion: string;
  policyOwner: string;
}

/**
 * How a single requirement stands, given every mapping that touches it.
 *
 * A requirement is satisfied if ANY conforming control covers it whole. The
 * other mappings are not evidence against it — a requirement met by one control
 * is met, regardless of how partially three others also relate to it. This is
 * why the resolution is a precedence order rather than a sum.
 */
type RequirementState = 'satisfied' | 'partial' | 'needs_review' | 'unevaluated' | 'gap';

function resolveRequirement(
  rows: ProjectionInput['mappings'],
  verdicts: Map<string, ControlVerdict>,
): RequirementState | 'excluded' {
  let sawPartial = false;
  let sawReview = false;
  let sawUnevaluated = false;
  let sawAnyIncluded = false;

  for (const row of rows) {
    const contribution: Contribution = contributionOf({
      relationship_type: row.relationship_type,
      relationship_strength: row.relationship_strength,
      is_official: row.is_official,
    });

    if (contribution === 'excluded') continue;
    sawAnyIncluded = true;

    const verdict = verdicts.get(row.control_code);

    if (verdict === undefined) {
      // Unevaluated is not a gap. Conflating them is how three consecutive
      // nightly runs recorded scores against zero evaluated controls.
      sawUnevaluated = true;
      continue;
    }

    if (contribution === 'needs_review') {
      sawReview = true;
      continue;
    }

    if (contribution === 'partial') {
      if (verdict === 'conforming' || verdict === 'partial') sawPartial = true;
      continue;
    }

    // contribution === 'satisfies'
    if (verdict === 'conforming') return 'satisfied';
    if (verdict === 'partial') sawPartial = true;
  }

  if (!sawAnyIncluded) return 'excluded';
  if (sawPartial) return 'partial';
  if (sawReview) return 'needs_review';
  if (sawUnevaluated) return 'unevaluated';
  return 'gap';
}

// ── Reading the pieces out of the database ──────────────────────────────────

/**
 * Translate an assessment's control evaluations into verdicts by control code.
 *
 * `combinedStatus` carries four values, and 'informal' is the interesting one:
 * evidence exists but not in a form that counts. It maps to 'partial' rather
 * than 'conforming', because informal evidence is real and is not compliance.
 * A control with no status at all is omitted, so it reads as unevaluated rather
 * than as a gap.
 */
export function verdictsFromEvaluations(
  evaluations: Array<{
    controlId: string;
    combinedStatus?: 'conforming' | 'partial' | 'informal' | 'gap';
    isCompliant?: boolean;
  }>,
): Map<string, ControlVerdict> {
  const out = new Map<string, ControlVerdict>();
  for (const e of evaluations) {
    if (e.combinedStatus === undefined) continue;
    if (e.combinedStatus === 'conforming') out.set(e.controlId, 'conforming');
    else if (e.combinedStatus === 'partial' || e.combinedStatus === 'informal') {
      out.set(e.controlId, 'partial');
    } else out.set(e.controlId, 'gap');
  }
  return out;
}

// The spine tables are not in types.generated.ts yet, so the generated client
// cannot type `.from('scf_control_mappings')`. This names the minimal chainable
// shape the two reads below use, and is also what a test can substitute.
interface Filterable extends PromiseLike<QueryResult> {
  eq(col: string, v: string): Filterable;
  maybeSingle(): Promise<{
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  }>;
}
interface QueryResult {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
}
export interface ReadableClient {
  from(table: string): { select(cols: string): Filterable };
}

/**
 * Project one framework from persisted data.
 *
 * Deliberately throws rather than returning a zero when the framework has no
 * curated identity. Our local codes address nothing on the vendor's side — the
 * join lives in `framework_identity_curation`, populated by a person. A missing
 * row means nobody has decided yet, and inventing the answer here is precisely
 * how 25,589 fabricated mapping rows came to exist.
 */
export async function projectFrameworkFromCrosswalk(
  localFrameworkCode: string,
  evaluations: Array<{
    controlId: string;
    combinedStatus?: 'conforming' | 'partial' | 'informal' | 'gap';
  }>,
  deps?: { client?: ReadableClient },
): Promise<FrameworkProjection> {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const client = deps?.client ?? (createAdminClient() as unknown as ReadableClient);

  const { data: curated, error: curationError } = await client
    .from('framework_identity_curation')
    .select('vendor_framework_code, confidence')
    .eq('local_code', localFrameworkCode)
    .maybeSingle();
  if (curationError) throw new Error(`framework_identity_curation: ${curationError.message}`);

  const vendorCode = curated?.vendor_framework_code;
  if (typeof vendorCode !== 'string' || vendorCode.length === 0) {
    throw new Error(
      `no curated vendor framework for "${localFrameworkCode}" ` +
        `(confidence: ${String(curated?.confidence ?? 'no row')}). ` +
        `A person must decide which of the vendor's frameworks this means.`,
    );
  }

  const { data: rows, error: mappingError } = await client
    .from('scf_control_mappings')
    .select('requirement_code, control_code, relationship_type, relationship_strength, is_official')
    .eq('framework_code', vendorCode);
  if (mappingError) throw new Error(`scf_control_mappings: ${mappingError.message}`);

  return computeProjection({
    mappings: (rows ?? []) as unknown as ProjectionInput['mappings'],
    verdicts: verdictsFromEvaluations(evaluations),
  });
}

export function computeProjection(input: ProjectionInput): FrameworkProjection {
  const byRequirement = new Map<string, ProjectionInput['mappings']>();
  for (const row of input.mappings) {
    const list = byRequirement.get(row.requirement_code);
    if (list === undefined) byRequirement.set(row.requirement_code, [row]);
    else list.push(row);
  }

  const stamp = policyStamp();
  const counts: Record<RequirementState, number> = {
    satisfied: 0,
    partial: 0,
    needs_review: 0,
    unevaluated: 0,
    gap: 0,
  };
  let total = 0;

  for (const rows of byRequirement.values()) {
    const state = resolveRequirement(rows, input.verdicts);
    if (state === 'excluded') continue;
    total++;
    counts[state]++;
  }

  // A requirement is DECIDABLE when the evidence settled it either way:
  // satisfied, partially covered, or a gap. One sitting in human review, or
  // whose controls were never evaluated, was not assessed at all.
  const decidable = counts.satisfied + counts.partial + counts.gap;

  // Two different kinds of "no score", and they are not the same statement.
  //
  //   no_requirements_mapped — this framework has no crosswalk. We do not know
  //   what it asks for.
  //
  //   nothing_assessable — we know all 148 requirements and settled none of
  //   them. Found by running this against real data: the vendor's crosswalk is
  //   99.99% `intersects`, our policy sends every `intersects` to human review,
  //   so even with all 1,473 controls conforming the result was
  //   satisfied 0 / review 148 — and this function returned `score: 0`.
  //
  // That zero was the defect this codebase has spent a week removing, rebuilt
  // one layer up: a 0 standing in for "we cannot say", indistinguishable on a
  // dashboard from a genuine 0% and arriving with more authority because a
  // policy version was stamped on it.
  //
  // Note the denominator stays `total`, not `decidable`. Scoring over decidable
  // requirements only would report 100% for one satisfied requirement out of
  // 148 while 147 went unlooked-at — flattering, and worse than saying nothing.
  const score = total === 0 || decidable === 0 ? null : counts.satisfied / total;

  return {
    score,
    reason:
      total === 0 ? 'no_requirements_mapped' : decidable === 0 ? 'nothing_assessable' : null,

    requirementsTotal: total,
    requirementsSatisfied: counts.satisfied,
    requirementsPartial: counts.partial,
    requirementsNeedingReview: counts.needs_review,
    requirementsUnevaluated: counts.unevaluated,
    requirementsGap: counts.gap,

    policyVersion: stamp.version,
    policyOwner: stamp.owner,
  };
}
