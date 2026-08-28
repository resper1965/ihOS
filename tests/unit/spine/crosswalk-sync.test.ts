import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { classifyMapping } from '@/lib/standard-api/sync/crosswalk';

const base = {
  control_code: 'AAT-01',
  requirement_code: 'Mechanisms exist to ensure policies…',
  framework_code: 'ISO 27001 2022',
  is_official: true,
  is_synthetic: false,
};

describe('crosswalk rows are stored with their provenance intact', () => {
  it('keeps relationship type and strength rather than flattening to a boolean', () => {
    const row = classifyMapping({
      ...base,
      id: '8a67296a-e0da-40fb-931c-5b3efb35447d',
      scf_framework_requirement_id: 'f184e38f-ea53-435a-99ea-cdcd5b04960f',
      relationship_type: 'intersects',
      relationship_strength: '0.750',
      mapping_source: 'official_scf',
    }, 'v1');

    expect(row.store).toBe(true);
    expect(row.value?.relationship_type).toBe('intersects');
    expect(row.value?.relationship_strength).toBe(0.75);
    expect(row.value?.is_official).toBe(true);
    expect(row.value?.mapping_source).toBe('official_scf');
    expect(row.value?.mapping_uuid).toBe('8a67296a-e0da-40fb-931c-5b3efb35447d');
  });

  it('drops SCF-to-SCF rows on framework_code alone, never on an empty id', () => {
    // The first draft dropped rows where scf_framework_id was "". The vendor has
    // since confirmed that field was hardcoded `scf_framework_id: ""` and never
    // resolved — a bug, not a signal, and one that also made their own
    // framework-filtered queries return nothing. Dropping on it would discard
    // legitimate mappings wholesale.
    const selfRef = classifyMapping({
      ...base,
      framework_code: 'Secure Controls Framework (SCF)',
      relationship_type: 'equal',
      relationship_strength: '1.000',
    }, 'v1');
    expect(selfRef.store).toBe(false);
    expect(selfRef.reason).toBe('self_referential');

    const emptyId = classifyMapping({
      ...base,
      scf_framework_id: '',
      relationship_type: 'equal',
      relationship_strength: '1.000',
    }, 'v1');
    expect(emptyId.store).toBe(true);
  });

  it('accepts an absent relationship as null, so the vendor fix cannot kill the sync', () => {
    // The vendor is replacing the hardcoded `intersects` (xlsx-importer.ts:353)
    // with STRM bundle values covering 5,008 of 79,133 mappings, so ~94% will
    // arrive with nothing recorded. Rejecting that would stop the sync on its
    // first honest row — verified before the fix: null and undefined both threw.
    for (const absent of [null, undefined, '']) {
      const r = classifyMapping({ ...base, relationship_type: absent as never }, 'v1');
      expect(r.store).toBe(true);
      expect(r.value?.relationship_type).toBeNull();
    }
  });

  it('refuses a relationship type it has never seen instead of storing it', () => {
    // The curation policy has no rule for a type it has never seen, and
    // inventing one here is how a number stops being explainable.
    expect(() =>
      classifyMapping({
        ...base,
        relationship_type: 'partially_maybe' as never,
      }, 'v1'),
    ).toThrow(/unknown relationship_type/i);
  });

  it('flags a 0.500 strength as untrustworthy rather than storing it as fact', () => {
    // The vendor's seeding was
    //   (parseFloat(row.relationship_strength) || 0.5).toFixed(3)
    // so an unparseable source value became a confident 0.500 indistinguishable
    // from a measurement. Until their fix is live every 0.500 is suspect and
    // must be findable later for a re-read.
    const suspect = classifyMapping({
      ...base, relationship_type: 'subset', relationship_strength: '0.500',
    }, 'v1');
    expect(suspect.value?.strength_is_trustworthy).toBe(false);

    const fine = classifyMapping({
      ...base, relationship_type: 'subset', relationship_strength: '0.750',
    }, 'v1');
    expect(fine.value?.strength_is_trustworthy).toBe(true);
  });

  it('stores a null strength as null, not as a zero or a default', () => {
    // Their fix omits the field entirely where the value was unparseable.
    // A missing strength is missing — it is not 0, and it is not 0.5.
    const r = classifyMapping({ ...base, relationship_type: 'equal' }, 'v1');
    expect(r.value?.relationship_strength).toBeNull();
    expect(r.value?.strength_is_trustworthy).toBe(true);
  });

  it('drops a row with no requirement_code, which cannot key a denominator', () => {
    const r = classifyMapping({
      ...base, requirement_code: undefined as never, relationship_type: 'equal',
    }, 'v1');
    expect(r.store).toBe(false);
    expect(r.reason).toBe('no_requirement_code');
  });

  it('carries the version through, since every vendor uuid is scoped to one', () => {
    const r = classifyMapping({ ...base, relationship_type: 'equal' }, 'version-abc');
    expect(r.value?.scf_version_id).toBe('version-abc');
  });

  it('drops a mapping with no framework, which belongs to no denominator', () => {
    const r = classifyMapping(
      { ...base, framework_code: undefined as never, relationship_type: 'equal' },
      'v1',
    );
    expect(r.store).toBe(false);
    expect(r.reason).toBe('no_framework_code');
  });
});

describe('the natural key needs framework_code, not just requirement_code', () => {
  // Found by running the walk: it failed with "ON CONFLICT DO UPDATE command
  // cannot affect row a second time", meaning two rows in one batch shared the
  // key. Cause: requirement_code is not always a code. Tier-marker frameworks
  // ("SCRM Focus  TIER 1 STRATEGIC", "SCRM Focus  TIER 2 OPERATIONAL") use the
  // literal string "x", so a control applying at both tiers produced two rows
  // with the same control_code and requirement_code.
  //
  // Measured over AAT-01, AAT-01.1 and AAT-01.2:
  //   control + requirement_code             46/102 unique  ← collides
  //   control + framework + requirement     102/102 unique  ← correct
  const tierMarker = (framework: string) => ({
    control_code: 'AAT-01',
    requirement_code: 'x',
    framework_code: framework,
    relationship_type: 'subset' as const,
    is_official: true,
    is_synthetic: false,
  });

  it('distinguishes two tier-marker rows that share control and requirement', () => {
    const a = classifyMapping(tierMarker('SCRM Focus  TIER 1 STRATEGIC'), 'v1');
    const b = classifyMapping(tierMarker('SCRM Focus  TIER 2 OPERATIONAL'), 'v1');

    expect(a.store).toBe(true);
    expect(b.store).toBe(true);

    const keyOf = (v: NonNullable<typeof a.value>) =>
      `${v.scf_version_id}|${v.control_code}|${v.framework_code}|${v.requirement_code}`;

    // Same control, same requirement_code — different rows.
    expect(a.value!.requirement_code).toBe(b.value!.requirement_code);
    expect(a.value!.control_code).toBe(b.value!.control_code);
    expect(keyOf(a.value!)).not.toBe(keyOf(b.value!));

    // And the key WITHOUT framework_code would collide, which is the bug.
    const weakKey = (v: NonNullable<typeof a.value>) =>
      `${v.scf_version_id}|${v.control_code}|${v.requirement_code}`;
    expect(weakKey(a.value!)).toBe(weakKey(b.value!));
  });

  it('the migration keys on framework_code', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260828000003_mapping_key_includes_framework.sql'),
      'utf8',
    );
    expect(sql).toMatch(
      /PRIMARY KEY \(scf_version_id, control_code, framework_code, requirement_code\)/,
    );
    // framework_code cannot be nullable once it is part of the key.
    expect(sql).toMatch(/ALTER COLUMN framework_code SET NOT NULL/);
  });
});
