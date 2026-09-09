import { describe, it, expect } from 'vitest';
import { checkAnnexMappingsResolve } from '@/lib/spine/invariants';

/**
 * `annexRows` are what the crosswalk holds; `catalogue` is the set of SCF
 * control codes the current version knows.
 */
function client(annexRows: Array<{ annex_code: string; control_code: string }>, catalogue: string[]) {
  return {
    from: (table: string) => ({
      select: (_c: string, _o?: unknown) => {
        if (table === 'annex_control_mappings') {
          return {
            order: () => ({
              range: async () => ({ data: annexRows, error: null }),
            }),
          };
        }
        return {
          eq: () => ({
            order: () => ({
              range: async () => ({ data: catalogue.map((c) => ({ control_code: c })), error: null }),
            }),
          }),
        };
      },
    }),
  };
}

/** A client whose reads fail, as they do before the migration is applied. */
function brokenClient(message: string) {
  return {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async () => ({ data: null, error: { message } }),
        }),
        eq: () => ({
          order: () => ({
            range: async () => ({ data: null, error: { message } }),
          }),
        }),
      }),
    }),
  };
}

describe('every Annex mapping points at a control that exists', () => {
  it('passes when all mapped controls are in the catalogue', async () => {
    const failures = await checkAnnexMappingsResolve(
      client([{ annex_code: 'A.5.1', control_code: 'GOV-01' }], ['GOV-01', 'GOV-02']),
      'v1',
    );
    expect(failures).toEqual([]);
  });

  it('fails an Annex control mapped to a control the catalogue does not have', async () => {
    // A vendor version bump can retire a control code. The mapping would then
    // point at nothing and the projection would silently lose coverage -- the
    // same silence that let eight curated identities break for eleven days.
    const failures = await checkAnnexMappingsResolve(
      client([{ annex_code: 'A.5.1', control_code: 'GONE-99' }], ['GOV-01']),
      'v1',
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].annexCode).toBe('A.5.1');
    expect(failures[0].reason).toMatch(/GONE-99/);
  });

  it('reports a missing table as a failure instead of throwing', async () => {
    // Before the migration is applied, PostgREST returns "relation
    // annex_control_mappings does not exist". That must become one legible
    // failure entry, not an exception that discards the sibling check's
    // already-computed results (the cron route awaits both with no try/catch).
    const failures = await checkAnnexMappingsResolve(
      brokenClient('relation "scf_controls_cache" does not exist') as never,
      'v1',
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatch(/does not exist/);
  });
});
