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
});
