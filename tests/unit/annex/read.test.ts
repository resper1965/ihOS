import { describe, it, expect } from 'vitest';
import { scfControlsForAnnex } from '@/lib/annex/read';

function clientReturning(rows: Array<Record<string, unknown>>) {
  const calls: Array<[string, string]> = [];
  const client = {
    from: () => ({
      select: () => ({
        eq: (col: string, v: string) => {
          calls.push([col, v]);
          return { then: (r: (x: { data: unknown[]; error: null }) => unknown) => r({ data: rows, error: null }) };
        },
      }),
    }),
  };
  return { client, calls };
}

describe('reading the Annex A crosswalk', () => {
  it('returns every SCF control an Annex control maps to, with its confidence', () => {
    const { client } = clientReturning([
      { control_code: 'GOV-01', edition: 'iso27001:2022', confidence: 'probable', relationship_type: null },
      { control_code: 'GOV-02', edition: 'iso27001:2022', confidence: 'exact', relationship_type: 'subset' },
    ]);
    return expect(scfControlsForAnnex('A.5.1', client as never)).resolves.toEqual([
      { controlCode: 'GOV-01', edition: 'iso27001:2022', confidence: 'probable', relationshipType: null },
      { controlCode: 'GOV-02', edition: 'iso27001:2022', confidence: 'exact', relationshipType: 'subset' },
    ]);
  });

  it('filters by the annex code, and says so', async () => {
    const { client, calls } = clientReturning([]);
    await scfControlsForAnnex('A.8.24', client as never);
    expect(calls).toContainEqual(['annex_code', 'A.8.24']);
  });

  it('returns an empty list for an unmapped control rather than throwing', async () => {
    // A control the crosswalk does not cover is a real state -- the SoA may
    // apply something none of the 124 ids reaches. The caller reports it as
    // unmapped; it is not an error here.
    const { client } = clientReturning([]);
    await expect(scfControlsForAnnex('A.5.99', client as never)).resolves.toEqual([]);
  });
});
