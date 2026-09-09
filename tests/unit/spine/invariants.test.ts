import { describe, it, expect } from 'vitest';
import {
  checkOfferedFrameworksResolve,
  checkCurationVersionCurrent,
  checkMappingCountsStable,
  KNOWN_UNCURATED,
} from '@/lib/spine/invariants';
import { FRAMEWORK_REGISTRY } from '@/lib/assessment/framework-registry';
import { CATALOGUE_BASELINE } from '@/lib/spine/baseline';

/**
 * `counts` maps a vendor slug to how many mapping rows it has.
 * `slugs` maps a local code to its curated slug, or null for uncurated.
 */
function client(slugs: Record<string, string | null>, counts: Record<string, number>) {
  return {
    from: (table: string) => ({
      select: (_c: string, _o?: unknown) => ({
        eq: (_col: string, v1: string) => {
          if (table === 'framework_identity_curation') {
            return {
              maybeSingle: async () => ({
                data: { vendor_framework_code: slugs[v1] ?? null, confidence: 'exact' },
                error: null,
              }),
            };
          }
          return {
            eq: async (_c2: string, slug: string) => ({
              count: counts[slug] ?? 0,
              error: null,
            }),
          };
        },
      }),
    }),
  };
}

describe('every offered framework resolves to real mappings', () => {
  it('passes when each offered framework has a curated slug with rows', async () => {
    const failures = await checkOfferedFrameworksResolve(
      client({ iso27001: 'general-iso-27001-2022' }, { 'general-iso-27001-2022': 316 }),
      'v1',
      new Set(['iso27701', 'BR-LGPD', 'EU-GDPR', 'EU-DORA', 'soc2', 'nist_800_53', 'TX-LEVEL-2', 'fedramp', 'IEC-62304']),
    );
    expect(failures).toEqual([]);
  });

  it('fails a framework whose curated slug matches zero rows', async () => {
    // This is the 2026-09-08 break, reproduced: the slug was valid yesterday
    // and names nothing today. A projection over it sums an empty set and
    // reports no score, which looks exactly like a framework nobody assessed.
    const failures = await checkOfferedFrameworksResolve(
      client({ iso27001: 'ISO 27001 2022' }, {}),
      'v1',
      new Set(['iso27701', 'BR-LGPD', 'EU-GDPR', 'EU-DORA', 'soc2', 'nist_800_53', 'TX-LEVEL-2', 'fedramp', 'IEC-62304']),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].framework).toBe('iso27001');
    expect(failures[0].reason).toMatch(/zero mapping rows/i);
  });

  it('fails a framework offered without any curated identity', async () => {
    const failures = await checkOfferedFrameworksResolve(
      client({ iso27001: null }, {}),
      'v1',
      new Set(['iso27701', 'BR-LGPD', 'EU-GDPR', 'EU-DORA', 'soc2', 'nist_800_53', 'TX-LEVEL-2', 'fedramp', 'IEC-62304']),
    );
    expect(failures[0].reason).toMatch(/no curated/i);
  });

  it('honours the exemption set, so a known gap is not noise', async () => {
    // Everything except fedramp/IEC-62304 has a real curated slug with rows,
    // so those 8 frameworks pass on their own merits. fedramp is exempted
    // despite having no curated identity — the exemption must suppress it.
    // IEC-62304 is left un-exempt with the same missing identity, so if the
    // exemption set did nothing (the loop body simply never ran), this would
    // still show zero failures and the test would not catch it.
    const curatedIds = ['iso27001', 'iso27701', 'TX-LEVEL-2', 'BR-LGPD', 'EU-GDPR', 'EU-DORA', 'soc2', 'nist_800_53'];
    const slugs = Object.fromEntries(curatedIds.map((id) => [id, `${id}-slug`]));
    const counts = Object.fromEntries(curatedIds.map((id) => [`${id}-slug`, 5]));

    const failures = await checkOfferedFrameworksResolve(
      client(slugs, counts),
      'v1',
      new Set(['fedramp']),
    );

    expect(failures).toHaveLength(1);
    expect(failures[0].framework).toBe('IEC-62304');
    expect(failures.some((f) => f.framework === 'fedramp')).toBe(false);
  });

  it('defaults to KNOWN_UNCURATED when no exempt set is given', async () => {
    // fedramp/IEC-62304 have no curated identity here either, but are left
    // out of the call entirely — relying on the function's own default.
    // nist_800_53 is deliberately broken and NOT in KNOWN_UNCURATED, so it
    // must still be reported: proof the default is the real constant, not
    // an accidental "exempt everything".
    expect(KNOWN_UNCURATED).toEqual(new Set(['fedramp', 'IEC-62304']));

    const curatedIds = ['iso27001', 'iso27701', 'TX-LEVEL-2', 'BR-LGPD', 'EU-GDPR', 'EU-DORA', 'soc2'];
    const slugs = Object.fromEntries(curatedIds.map((id) => [id, `${id}-slug`]));
    const counts = Object.fromEntries(curatedIds.map((id) => [`${id}-slug`, 5]));

    const failures = await checkOfferedFrameworksResolve(client(slugs, counts), 'v1');

    expect(failures).toHaveLength(1);
    expect(failures[0].framework).toBe('nist_800_53');
  });
});

/** A client whose framework_identity_curation table holds exactly `rows`. */
function curationClient(
  rows: Array<{ local_code: string; decided_against_version: string; confidence: string }>,
  error: { message: string } | null = null,
) {
  return {
    from: (_table: string) => ({
      select: async (_cols: string) => ({ data: error ? null : rows, error }),
    }),
  };
}

describe('a curated identity decided against an older catalogue', () => {
  it('passes when every identity was decided against the current version', async () => {
    const failures = await checkCurationVersionCurrent(
      curationClient([
        { local_code: 'iso27001', decided_against_version: 'v-current', confidence: 'exact' },
        { local_code: 'soc2', decided_against_version: 'v-current', confidence: 'exact' },
      ]),
      'v-current',
    );
    expect(failures).toEqual([]);
  });

  it('fails one row per identity decided against an older catalogue', async () => {
    // This is 2026-09-08: the catalogue moved and eight decisions kept being
    // trusted because nothing compared them against the version in force.
    const failures = await checkCurationVersionCurrent(
      curationClient([
        { local_code: 'iso27001', decided_against_version: 'v-old', confidence: 'exact' },
        { local_code: 'soc2', decided_against_version: 'v-current', confidence: 'exact' },
        { local_code: 'iso27701', decided_against_version: 'v-old', confidence: 'probable' },
      ]),
      'v-current',
    );
    expect(failures.map((f) => f.framework).sort()).toEqual(['iso27001', 'iso27701']);
  });

  it('names both versions and the confidence, because a probable row costs more to reconfirm', async () => {
    const failures = await checkCurationVersionCurrent(
      curationClient([
        { local_code: 'iso27701', decided_against_version: 'v-old', confidence: 'probable' },
      ]),
      'v-current',
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toContain('v-old');
    expect(failures[0].reason).toContain('v-current');
    expect(failures[0].reason).toContain('probable');
  });

  it('turns a query error into one failure instead of throwing', async () => {
    // The cron awaits every check with no try/catch. A throw here would discard
    // the results the other checks have already computed.
    const failures = await checkCurationVersionCurrent(
      curationClient([], { message: 'relation does not exist' }),
      'v-current',
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toContain('relation does not exist');
  });
});

/**
 * A client for the count check. `slugs` maps local_code to curated slug;
 * `counts` maps a slug to its exact row count. The version total is the sum
 * unless `total` is given.
 */
function countingClient(
  slugs: Record<string, string>,
  counts: Record<string, number>,
  total?: number,
) {
  return {
    from: (table: string) => ({
      select: (_cols: string, _opts?: unknown) => ({
        eq: (_col: string, v1: string) => {
          if (table === 'framework_identity_curation') {
            return {
              maybeSingle: async () => ({
                data: { vendor_framework_code: slugs[v1] ?? null, confidence: 'exact' },
                error: null,
              }),
            };
          }
          // scf_control_mappings: .eq(version).eq(framework_code) counts one
          // framework; .eq(version) awaited directly counts the whole version.
          const versionOnly = {
            count: total ?? Object.values(counts).reduce((a, b) => a + b, 0),
            error: null as { message: string } | null,
          };
          return {
            eq: async (_c2: string, slug: string) => ({
              count: counts[slug] ?? 0,
              error: null,
            }),
            then: (resolve: (v: typeof versionOnly) => unknown) => resolve(versionOnly),
          };
        },
      }),
    }),
  };
}

const BASE = {
  scfVersionId: 'v-current',
  totalMappings: 396,
  byFramework: { iso27001: 316, soc2: 80 } as Record<string, number>,
};

describe('a mapping count that moves without reaching zero', () => {
  it('passes when every count matches the baseline', async () => {
    const failures = await checkMappingCountsStable(
      countingClient(
        { iso27001: 'general-iso-27001-2022', soc2: 'general-aicpa-tsc-2017' },
        { 'general-iso-27001-2022': 316, 'general-aicpa-tsc-2017': 80 },
      ),
      'v-current',
      BASE,
    );
    expect(failures).toEqual([]);
  });

  it('fails a framework whose count moved, naming both numbers', async () => {
    // The gap this check exists for: checkOfferedFrameworksResolve is binary,
    // so 1,478 rows falling to 12 passes it while the published percentage
    // changes underneath.
    const failures = await checkMappingCountsStable(
      countingClient(
        { iso27001: 'general-iso-27001-2022', soc2: 'general-aicpa-tsc-2017' },
        { 'general-iso-27001-2022': 12, 'general-aicpa-tsc-2017': 80 },
        396,
      ),
      'v-current',
      BASE,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].framework).toBe('iso27001');
    expect(failures[0].reason).toContain('316');
    expect(failures[0].reason).toContain('12');
  });

  it('fails when the catalogue total moved even if every framework held', async () => {
    const failures = await checkMappingCountsStable(
      countingClient(
        { iso27001: 'general-iso-27001-2022', soc2: 'general-aicpa-tsc-2017' },
        { 'general-iso-27001-2022': 316, 'general-aicpa-tsc-2017': 80 },
        70000,
      ),
      'v-current',
      BASE,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].framework).toBe('(catalogue totals)');
    expect(failures[0].reason).toContain('70000');
  });

  it('skips every count when the catalogue version has moved, and says so', async () => {
    // Spec §7. Counts taken against a different catalogue measure nothing, and
    // nine arithmetic failures would bury the one fact that matters.
    const failures = await checkMappingCountsStable(
      countingClient({ iso27001: 'general-iso-27001-2022' }, { 'general-iso-27001-2022': 999 }),
      'v-moved',
      BASE,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatch(/skipped/i);
    expect(failures[0].reason).toContain('v-current');
    expect(failures[0].reason).toContain('v-moved');
  });

  it('turns an uncurated local code into one failure instead of throwing', async () => {
    const failures = await checkMappingCountsStable(
      countingClient({ soc2: 'general-aicpa-tsc-2017' }, { 'general-aicpa-tsc-2017': 80 }, 396),
      'v-current',
      BASE,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].framework).toBe('iso27001');
    expect(failures[0].reason).toMatch(/no curated/i);
  });
});

describe('the baseline is checked against the framework registry', () => {
  it('covers every offered framework that is not a known gap', () => {
    // The baseline is only as good as its key set. A framework added to the
    // registry but not here is watched by the binary check alone, which is the
    // check this file exists to supplement.
    const expected = FRAMEWORK_REGISTRY
      .map((f) => f.id)
      .filter((id) => !KNOWN_UNCURATED.has(id))
      .sort();
    expect(Object.keys(CATALOGUE_BASELINE.byFramework).sort()).toEqual(expected);
  });
});
