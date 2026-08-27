import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260828000001_control_spine.sql'),
  'utf8',
);

describe('framework identity is curated, never derived', () => {
  it('records who decided each mapping and how confident they were', () => {
    expect(sql).toMatch(/framework_identity_curation/);
    expect(sql).toMatch(/decided_by/);
    expect(sql).toMatch(/rationale/);
    expect(sql).toMatch(/confidence\s+text\s+not null\s+check/i);
  });

  it('admits an undecided local code rather than forcing a guess', () => {
    // A local code with no defensible vendor counterpart must be storable as
    // undecided. The alternative — omitting the row — is what let fabricated
    // mappings look like an absence of data rather than a decision not made.
    expect(sql).toMatch(/vendor_framework_code\s+text\s+null/i);
    expect(sql).toMatch(/'undecided'/);
  });

  it('never derives a vendor identifier from a local code', () => {
    // No string transform anywhere in the migration: no replace, no concat,
    // no prefix arithmetic on framework codes. That is precisely how the
    // 25,589 rows quarantined in 20260825000002 were manufactured.
    expect(sql).not.toMatch(/replace\s*\(\s*framework_code/i);
    expect(sql).not.toMatch(/framework_code\s*\|\|/);
  });

  it('keys nothing on a vendor UUID, because vendor UUIDs rotate per version', () => {
    // Vendor-confirmed 2026-08-27: scf_controls / scf_frameworks / scf_mappings
    // all use `id uuid defaultRandom()` and mint a new row per SCF version. A
    // UUID primary key would break every reference on a version bump, and in
    // framework_identity_curation it would silently destroy human decisions.
    //
    // scf_version_id IS legitimately part of a key — it is the version scope
    // that makes a business code unique. What must never appear in a key is a
    // rotating row identity. Those are named *_uuid by convention here
    // precisely so this assertion can be written.
    const pkLines = sql.match(/PRIMARY KEY\s*\([^)]*\)/gi) ?? [];
    expect(pkLines.length).toBeGreaterThanOrEqual(4);
    for (const pk of pkLines) {
      expect(pk).not.toMatch(/_uuid/i);
    }
    expect(sql).not.toMatch(/REFERENCES\s+public\.scf_framework_catalog/i);
  });

  it('refuses a relationship type the curation policy has no rule for', () => {
    // Five values as of 2026-08-27. A sixth must break the sync loudly rather
        // than land in a table the policy reads.
    expect(sql).toMatch(/relationship_type\s+text\s+not null\s*\n?\s*check/i);
    for (const v of ['equal', 'subset', 'intersects', 'superset', 'no_relation']) {
      expect(sql).toContain(`'${v}'`);
    }
  });

  it('marks a 0.500 strength as untrustworthy-capable', () => {
    // The vendor's seeding was
    //   (parseFloat(row.relationship_strength) || 0.5).toFixed(3)
    // so an unparseable source value became a confident 0.500. Rows ingested
    // before their fix must be findable for a re-read.
    expect(sql).toMatch(/strength_is_trustworthy\s+boolean/i);
    expect(sql).toMatch(/relationship_strength\s+numeric\s+null/i);
  });
});
