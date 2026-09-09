import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION_PATH = 'supabase/migrations/20260909000002_annex_control_mappings.sql';
const MIRROR_PATH = 'docs/sql/2026-09-09c_APPLY_ME_annex_crosswalk.sql';

const sql = readFileSync(resolve(process.cwd(), MIGRATION_PATH), 'utf8');

describe('the Annex A crosswalk is a first-class table', () => {
  it('keys on (edition, annex_code, control_code), never on an id alone', () => {
    // Edition is part of the key because the data holds two: A.7.5 is an ISO
    // 27001:2022 physical control and A.7.5.3 is an ISO 27701 PII control.
    // Keying on the code alone would collide them.
    expect(sql).toMatch(/PRIMARY KEY \(edition, annex_code, control_code\)/i);
  });

  it('constrains edition to the two that exist, so a third fails loudly', () => {
    expect(sql).toMatch(/edition\s+text\s+not null/i);
    expect(sql).toContain("'iso27001:2022'");
    expect(sql).toContain("'iso27701:2019'");
  });

  it('allows a null relationship, because the source cannot state one', () => {
    // The legacy table holds only a triple of codes. NULL means "unrecorded",
    // which contributionOf() already distinguishes from 'intersects'.
    expect(sql).toMatch(/relationship_type\s+text\s+null/i);
  });

  it('records provenance and confidence on every row', () => {
    expect(sql).toMatch(/provenance\s+text\s+not null/i);
    expect(sql).toMatch(/confidence\s+text\s+not null/i);
    expect(sql).toContain("'probable'");
    expect(sql).toContain("'exact'");
  });

  it('refuses an exact row that nobody signed', () => {
    // An exact mapping with no decided_by is the shape of a guess wearing a
    // signature. The CHECK makes it unstorable.
    // Extract the exact_is_signed constraint to verify all three signature
    // columns are required when confidence = 'exact'.
    const constraintMatch = sql.match(
      /ADD CONSTRAINT annex_control_mappings_exact_is_signed CHECK \(([\s\S]*?)\);/
    );
    expect(constraintMatch).toBeTruthy();

    const constraintBody = constraintMatch![1];
    // Verify the constraint references confidence and 'exact'
    expect(constraintBody).toContain("confidence");
    expect(constraintBody).toContain("'exact'");
    // Verify all three signature columns are required
    expect(constraintBody).toContain("decided_by");
    expect(constraintBody).toContain("decided_at");
    expect(constraintBody).toContain("rationale");
  });

  it('enables row level security, like every other spine table', () => {
    expect(sql).toMatch(/ALTER TABLE public\.annex_control_mappings\s+ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY .* ON public\.annex_control_mappings/i);
  });

  it('the docs/sql mirror a person actually applies carries this migration verbatim', () => {
    // table-shape only ever reads the migration file. The mirror is what gets
    // pasted into the database -- deliberately not byte-identical, it carries
    // an extra "-- Mirrors: ..." header -- so nothing else asserts they agree
    // on the SQL itself. A later fix to the migration alone would otherwise
    // leave the tested schema and the deployed schema silently diverged.
    const mirror = readFileSync(resolve(process.cwd(), MIRROR_PATH), 'utf8');
    const migrationFirstLine = sql.split('\n')[0];
    const mirrorLines = mirror.split('\n');

    // Strip the mirror's header by finding where the migration's own first
    // line begins, rather than assuming a fixed number of header lines.
    const bodyStart = mirrorLines.indexOf(migrationFirstLine);
    expect(bodyStart).toBeGreaterThan(-1);

    const mirrorBody = mirrorLines.slice(bodyStart).join('\n');
    expect(mirrorBody).toBe(sql);
  });
});
