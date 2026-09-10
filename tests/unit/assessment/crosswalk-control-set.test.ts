// tests/unit/assessment/crosswalk-control-set.test.ts
// The engine evaluates exactly the controls the score is computed from
// (spec 2026-09-10 §3.1). It used to choose them from the legacy
// scf_framework_mappings: for ISO 27001 + 27701 that evaluated 613 controls
// that never reached a score, and skipped 14 that did.

import { describe, it, expect } from 'vitest';
import { controlCodesForFrameworks, type ReadableClient } from '@/lib/assessment/projection';

interface Row {
  framework_code: string;
  scf_version_id: string;
  control_code: string;
  requirement_code: string;
}

/** framework_identity_curation + scf_control_mappings, filtered the way PostgREST would. */
function crosswalk(curation: Record<string, string>, rows: Row[]): ReadableClient {
  function query(table: string, filters: Record<string, string>): unknown {
    return {
      eq: (col: string, v: string) => query(table, { ...filters, [col]: v }),
      maybeSingle: async () => {
        const vendor = table === 'framework_identity_curation' ? curation[filters.local_code] : undefined;
        return { data: vendor ? { vendor_framework_code: vendor, confidence: 'high' } : null, error: null };
      },
      then: (onFulfilled: (r: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve({
          data: rows.filter(
            (r) => r.framework_code === filters.framework_code && r.scf_version_id === filters.scf_version_id,
          ),
          error: null,
        }).then(onFulfilled, onRejected),
    };
  }
  return { from: (table: string) => ({ select: () => query(table, {}) }) } as unknown as ReadableClient;
}

const V = 'v-cached';
const curation = { iso27001: 'iso-27001-2022', iso27701: 'iso-27701-2019' };
const rows: Row[] = [
  { framework_code: 'iso-27001-2022', scf_version_id: V, control_code: 'GOV-09', requirement_code: '5.1' },
  { framework_code: 'iso-27001-2022', scf_version_id: V, control_code: 'GOV-09', requirement_code: '5.2' },
  { framework_code: 'iso-27001-2022', scf_version_id: V, control_code: 'SEA-02.1', requirement_code: '8.1' },
  { framework_code: 'iso-27701-2019', scf_version_id: V, control_code: 'HRS-05.1', requirement_code: '6.4' },
  // Another catalogue version: must not leak into this one.
  { framework_code: 'iso-27001-2022', scf_version_id: 'v-old', control_code: 'AST-01.2', requirement_code: '5.9' },
];

describe('controlCodesForFrameworks', () => {
  it('selects the distinct controls of each curated slug at the cached version', async () => {
    const set = await controlCodesForFrameworks(['iso27001', 'iso27701'], V, crosswalk(curation, rows));
    expect([...set].sort()).toEqual(['GOV-09', 'HRS-05.1', 'SEA-02.1']);
  });

  it('skips a framework nobody has curated, without dropping the others', async () => {
    const set = await controlCodesForFrameworks(['iso27001', 'soc2'], V, crosswalk(curation, rows));
    expect([...set].sort()).toEqual(['GOV-09', 'SEA-02.1']);
  });

  it('selects nothing when the crosswalk maps nothing at that version', async () => {
    const set = await controlCodesForFrameworks(['iso27001'], 'v-empty', crosswalk(curation, rows));
    expect(set.size).toBe(0);
  });
});
