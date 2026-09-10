// src/lib/compliance/coverage.ts
// What each offered framework requires, and how much of it our crosswalk maps.
//
// This is the COVER question, and it is deliberately not the ANSWER question.
// Coverage needs only the crosswalk; conformance needs evidence verdicts, and
// those live in an assessment. Calling the projection with an empty evaluations
// list answers coverage completely: every requirement lands in Total,
// Unrecorded or Unevaluated, and `score` comes back null with reason
// `nothing_assessable`. That null is the correct answer, not a failure.
//
// Extracted so the same loop can be shared by the API route and the Server
// Component that renders it — two copies of the "undecided" vs. "covers
// nothing" distinction could drift apart silently.
//
// Spec: docs/superpowers/specs/2026-09-09-ui-information-architecture-design.md §5

import { FRAMEWORK_REGISTRY } from '@/lib/assessment/framework-registry';
import { projectFrameworkFromCrosswalk } from '@/lib/assessment/projection';
import { logger } from '@/lib/logger';

export interface FrameworkCoverage {
  localCode: string;
  name: string;
  /**
   * 'undecided' — nobody has curated which vendor framework this local code
   * means. 'error' — a read failed; this says nothing about curation and must
   * never render as if it did. 'projected' — curation resolved; requirement
   * counts follow (see `reason` for whether the crosswalk itself has rows).
   */
  status: 'projected' | 'undecided' | 'error';
  requirementsTotal: number | null;
  requirementsUnrecorded: number | null;
  requirementsUnevaluated: number | null;
  score: number | null;
  reason: string | null;
  policyVersion: string | null;
  policyOwner: string | null;
  note: string | null;
}

export async function collectCoverage(scfVersionId: string): Promise<FrameworkCoverage[]> {
  return Promise.all(
    FRAMEWORK_REGISTRY.map(async (fw) => {
      try {
        const p = await projectFrameworkFromCrosswalk(fw.id, [], { scfVersionId });
        return {
          localCode: fw.id,
          name: fw.name,
          status: 'projected' as const,
          requirementsTotal: p.requirementsTotal,
          requirementsUnrecorded: p.requirementsUnrecorded,
          requirementsUnevaluated: p.requirementsUnevaluated,
          score: p.score,
          reason: p.reason,
          policyVersion: p.policyVersion,
          policyOwner: p.policyOwner,
          note: null,
        };
      } catch (err) {
        // The projection throws rather than returning zero when no person has
        // decided which vendor framework a local code means. Surfacing that as
        // its own state keeps "undecided" from being read as "covers nothing".
        //
        // But a genuinely missing identity is not the only thing that throws
        // here: resolveVendorFrameworkCode also throws on a read failure
        // against framework_identity_curation, and the mapping read below it
        // throws on a scf_control_mappings failure. Neither of those is a
        // statement about curation, and rendering them as "undecided" tells
        // the operator that nobody decided when the truth is the database
        // could not be read. Only the identity resolver's own "no curated
        // vendor framework for" message names a real curation gap; every
        // other message here is an error, not a decision.
        const message = err instanceof Error ? err.message : String(err);
        const isGenuinelyUncurated = /no curated vendor framework for/.test(message);

        if (!isGenuinelyUncurated) {
          logger.error('coverage: framework read failed', {
            context: 'api/compliance/coverage',
            meta: { framework: fw.id, message },
          });
          return {
            localCode: fw.id,
            name: fw.name,
            status: 'error' as const,
            requirementsTotal: null,
            requirementsUnrecorded: null,
            requirementsUnevaluated: null,
            score: null,
            reason: null,
            policyVersion: null,
            policyOwner: null,
            note: message,
          };
        }

        logger.warn('coverage: framework not projectable', {
          context: 'api/compliance/coverage',
          meta: { framework: fw.id, message },
        });
        return {
          localCode: fw.id,
          name: fw.name,
          status: 'undecided' as const,
          requirementsTotal: null,
          requirementsUnrecorded: null,
          requirementsUnevaluated: null,
          score: null,
          reason: null,
          policyVersion: null,
          policyOwner: null,
          note: message,
        };
      }
    }),
  );
}
