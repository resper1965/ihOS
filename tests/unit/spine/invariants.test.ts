import { describe, it, expect } from 'vitest';
import { checkOfferedFrameworksResolve } from '@/lib/spine/invariants';

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
    const failures = await checkOfferedFrameworksResolve(
      client({}, {}),
      'v1',
      new Set(['iso27001', 'iso27701', 'BR-LGPD', 'EU-GDPR', 'EU-DORA', 'soc2', 'nist_800_53', 'TX-LEVEL-2', 'fedramp', 'IEC-62304']),
    );
    expect(failures).toEqual([]);
  });
});
