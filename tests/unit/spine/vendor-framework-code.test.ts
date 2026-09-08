import { describe, it, expect } from 'vitest';
import { resolveVendorFrameworkCode } from '@/lib/assessment/curation/identity';

function clientReturning(row: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  };
}

describe('the bridge from a local framework code to the vendor catalogue', () => {
  it('returns the curated vendor slug', async () => {
    const code = await resolveVendorFrameworkCode(
      'iso27001',
      clientReturning({ vendor_framework_code: 'general-iso-27001-2022', confidence: 'exact' }),
    );
    expect(code).toBe('general-iso-27001-2022');
  });

  it('returns a probable identity too — probable is a decision, not an absence', async () => {
    const code = await resolveVendorFrameworkCode(
      'iso27701',
      clientReturning({ vendor_framework_code: 'general-iso-27701-2025', confidence: 'probable' }),
    );
    expect(code).toBe('general-iso-27701-2025');
  });

  it('throws when nobody has decided, rather than returning null', async () => {
    // A null here would flow downstream and produce a zero. Inventing the join
    // is precisely how the 25,589 rows quarantined in 20260825000002 were made.
    await expect(
      resolveVendorFrameworkCode('fedramp', clientReturning(null)),
    ).rejects.toThrow(/fedramp/);
  });

  it('throws on an undecided row, which is not the same as a missing one', async () => {
    await expect(
      resolveVendorFrameworkCode(
        'IEC-62304',
        clientReturning({ vendor_framework_code: null, confidence: 'undecided' }),
      ),
    ).rejects.toThrow(/undecided/);
  });

  it('surfaces a database error instead of treating it as "not curated"', async () => {
    const failing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'connection reset' } }),
          }),
        }),
      }),
    };
    await expect(resolveVendorFrameworkCode('iso27001', failing)).rejects.toThrow(/connection reset/);
  });
});
