// What the vendor's catalogue held when someone last looked.
//
// Measured 2026-09-09 against the live database with exact counts
// (`select('*', { count: 'exact', head: true })`), never with a paginated read.
// An unordered paged read reported TX-LEVEL-2 at zero mappings while preparing
// this; the true count is 366. PostgREST guarantees no stable row order between
// two range() calls, and a baseline that miscounts manufactures the false alarm
// it exists to prevent.
//
// The 67,234 total reconciles with the per-relationship figures published in
// docs/standard-api/FINDINGS_2026-09-09.md -- intersects 39,185, null 14,819,
// subset 8,391, equal 4,796, superset 43. Two independent measurements agreeing
// is why this number is usable as a baseline at all.
//
// CHANGING A NUMBER HERE IS A CLAIM THAT THE VENDOR CHANGED.
// Not that the test is inconvenient. Re-measure with exact counts, then say in
// the commit message what moved and why you believe the new value. This is the
// same discipline framework_identity_curation applies to identities through
// decided_by and rationale.
//
// Keyed by OUR local_code, never by the vendor slug. The slug is the value that
// drifts -- keying by it would reproduce the 2026-09-08 break inside the file
// written to detect it.
//
// Spec: docs/superpowers/specs/2026-09-09-vendor-drift-design.md §4
export type CatalogueBaseline = {
  scfVersionId: string;
  totalMappings: number;
  byFramework: Record<string, number>;
};

export const CATALOGUE_BASELINE = {
  scfVersionId: '826a1f05-f065-4feb-9f44-ced8019a6701',
  totalMappings: 67234,
  byFramework: {
    iso27001: 316,
    iso27701: 149,
    'BR-LGPD': 80,
    'EU-GDPR': 241,
    'EU-DORA': 442,
    soc2: 1478,
    'TX-LEVEL-2': 366,
    nist_800_53: 1117,
  },
} as const;
