import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260909000003_soa_entries.sql'),
  'utf8',
);

/** The body of a named CHECK constraint, so an assertion cannot pass on an unrelated one. */
function constraintBody(name: string): string {
  const m = sql.match(new RegExp(`ADD CONSTRAINT ${name} CHECK \\(([\\s\\S]*?)\\);`));
  expect(m, `constraint ${name} must exist`).toBeTruthy();
  return m![1];
}

describe('the SoA is stored as declarations, not as prose', () => {
  it('keys on (document_id, annex_code) so a new SoA lands beside the old one', () => {
    // A Statement of Applicability is a dated declaration. The previous one is
    // evidence of what was declared then, so nothing is updated in place.
    expect(sql).toMatch(/PRIMARY KEY \(document_id, annex_code\)/i);
  });

  it('stores applicability as a boolean, because there is no third state', () => {
    expect(sql).toMatch(/\bapplicable\s+boolean\s+not null/i);
  });

  it('refuses a declaration with no justification', () => {
    // A control declared applicable or not applicable without a reason is not a
    // declaration. Measured: 142 of 142 rows in the source carry one.
    expect(sql).toMatch(/justification\s+text\s+not null/i);
  });

  it('constrains standard and annex to valid pairs only', () => {
    // Only three combinations exist: ISO 27001:2022 Annex A, ISO 27701:2019 Annex A,
    // and ISO 27701:2019 Annex B. An independent check on each column would allow
    // impossible pairs (e.g. ISO 27001:2022 Annex B, which does not exist).
    const constraint = constraintBody('soa_entries_standard_annex_valid_pair');
    expect(constraint).toContain("('iso27001:2022', 'A')");
    expect(constraint).toContain("('iso27701:2019', 'A')");
    expect(constraint).toContain("('iso27701:2019', 'B')");
  });

  it('keeps the sheet and row a value came from', () => {
    // Traceability to the cell a person typed in is what makes an answer
    // defensible to an auditor rather than merely produced.
    expect(sql).toMatch(/source_sheet\s+text\s+not null/i);
    expect(sql).toMatch(/source_row\s+integer\s+not null/i);
  });

  it('records the hash of the file each row came from', () => {
    // The guard compares this against the file in storage, so a SoA edited in
    // place fails the next import loudly rather than importing over itself.
    expect(sql).toMatch(/source_sha256\s+text\s+not null/i);
  });

  it('enables row level security, like every other table in this spine', () => {
    expect(sql).toMatch(/ALTER TABLE public\.soa_entries\s+ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY .* ON public\.soa_entries/i);
  });
});
