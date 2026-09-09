// What the spine asserts about itself.
//
// On 2026-09-08 the vendor changed framework_code from a human phrase to a
// slug. All eight curated identities silently stopped matching, and nothing
// noticed for eleven days — because a curation row that matches nothing is
// indistinguishable, from the outside, from a framework nobody has assessed.
//
// This is the difference between "it worked when we tested it" and "we know it
// works". It asserts the one property that break violated: a framework the
// product OFFERS must resolve, through curation, to at least one mapping row in
// the current catalogue version.

import { FRAMEWORK_REGISTRY } from '@/lib/assessment/framework-registry';
import { resolveVendorFrameworkCode } from '@/lib/assessment/curation/identity';

export interface InvariantFailure {
  framework: string;
  reason: string;
}

/**
 * Frameworks offered without a curated identity, on purpose.
 *
 * Listed rather than implied, so that this set shrinking is a deliberate act.
 * Both are blocked on the vendor, not on a decision anyone here is avoiding —
 * see VENDOR_QUESTIONS Q14.
 */
export const KNOWN_UNCURATED = new Set(['fedramp', 'IEC-62304']);

export async function checkOfferedFrameworksResolve(
  client: unknown,
  scfVersionId: string,
  exempt: Set<string> = KNOWN_UNCURATED,
): Promise<InvariantFailure[]> {
  const failures: InvariantFailure[] = [];

  for (const fw of FRAMEWORK_REGISTRY) {
    if (exempt.has(fw.id)) continue;

    let slug: string;
    try {
      slug = await resolveVendorFrameworkCode(fw.id, client as never);
    } catch (err) {
      failures.push({
        framework: fw.id,
        reason: `no curated vendor identity: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const { count, error } = await (client as {
      from: (t: string) => {
        select: (c: string, o: { count: 'exact'; head: true }) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => Promise<{ count: number | null; error: { message: string } | null }>;
          };
        };
      };
    })
      .from('scf_control_mappings')
      .select('*', { count: 'exact', head: true })
      .eq('scf_version_id', scfVersionId)
      .eq('framework_code', slug);

    if (error) {
      failures.push({ framework: fw.id, reason: `mapping count failed: ${error.message}` });
      continue;
    }

    if ((count ?? 0) === 0) {
      failures.push({
        framework: fw.id,
        reason:
          `curated to "${slug}", which has zero mapping rows in version ${scfVersionId}. ` +
          `Either the slug is stale or the catalogue moved.`,
      });
    }
  }

  return failures;
}
