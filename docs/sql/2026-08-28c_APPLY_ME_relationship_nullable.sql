-- Migration 20260828000004: relationship_type may be unrecorded.
--
-- The vendor is fixing the defect we reported as Q10. `xlsx-importer.ts:353`
-- hardcoded `intersects` on every crosswalk row — the same shape as the 0.500
-- strength they disclosed earlier — and they are replacing it with values from
-- their STRM bundle, which does carry real distinctions. Their own recorded
-- distribution:
--
--     "Equal"        4,850
--     "Subset of"      116
--     "Superset Of"     42
--     total          5,008
--
-- Against the 79,133 mappings the API serves, that is **6.3% coverage**. The
-- remaining 74,125 rows — 93.7% — will arrive with NO relationship recorded.
--
-- Their instinct on this was right and worth preserving in the schema: the
-- uncovered rows must be null, NOT `intersects`. Defaulting them would keep the
-- fabrication alive under a new name, and this column is `NOT NULL` today, so
-- the sync would fail on the first honest row rather than store it.
--
-- Null here means "the vendor has not recorded how this control relates to this
-- requirement". That is a different statement from `intersects`, which asserts
-- partial overlap. src/lib/assessment/curation/policy.ts gives it its own
-- contribution — 'unrecorded' — reported separately from 'needs_review',
-- because the two call for different work: review is a judgement a person can
-- make from the mapping in hand, unrecorded means nobody can and the vendor has
-- to supply it.

ALTER TABLE public.scf_control_mappings
  ALTER COLUMN relationship_type DROP NOT NULL;

-- The CHECK stays, and still does its job. In Postgres a CHECK passes when the
-- expression is NULL, so `relationship_type IN (...)` admits NULL while still
-- rejecting a sixth value the curation policy would have no rule for. That
-- guard is about a new vocabulary entry appearing, not about absence.
COMMENT ON COLUMN public.scf_control_mappings.relationship_type IS
  'Vendor vocabulary, exactly five values as of 2026-08-27, or NULL where the '
  'vendor has not recorded the relationship. NULL is not `intersects`: one is '
  'absence, the other asserts partial overlap. A SIXTH non-null value must break '
  'the sync, because the curation policy decides what each one contributes and '
  'cannot decide for a type it has never seen.';
