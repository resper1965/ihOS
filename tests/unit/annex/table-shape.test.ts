import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260909000002_annex_control_mappings.sql'),
  'utf8',
);

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
    expect(sql).toMatch(/CHECK\s*\(/i);
    expect(sql).toMatch(/decided_by/);
  });

  it('enables row level security, like every other spine table', () => {
    expect(sql).toMatch(/ALTER TABLE public\.annex_control_mappings\s+ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY .* ON public\.annex_control_mappings/i);
  });
});
