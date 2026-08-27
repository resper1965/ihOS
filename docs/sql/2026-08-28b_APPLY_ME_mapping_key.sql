-- Migration 20260828000003: the mapping key needs framework_code.
--
-- Found by running the crosswalk walk against the live API, which failed with:
--
--   ON CONFLICT DO UPDATE command cannot affect row a second time
--
-- meaning two rows in one upsert batch shared the primary key
-- (scf_version_id, control_code, requirement_code).
--
-- Cause: `requirement_code` is not always a code. Several vendor frameworks are
-- tier markers rather than requirement lists — "SCRM Focus  TIER 1 STRATEGIC",
-- "SCRM Focus  TIER 2 OPERATIONAL" — and their requirement_code is the literal
-- string "x". A control that applies at both tiers therefore produced two rows
-- with requirement_code = 'x' and the same control_code.
--
-- Measured across the first three controls (AAT-01, AAT-01.1, AAT-01.2):
--
--   control + requirement_code                46/102 unique   ← collides
--   control + framework_code + requirement    102/102 unique  ← correct
--   control + requirement_uuid                102/102 unique  (but rotates per version)
--
-- So the key gains framework_code. requirement_uuid would also work and is what
-- the vendor's own schema uses — `unique (requirement_id, control_id)` — but
-- those UUIDs are minted per SCF version, and keying on one would break every
-- row on a version bump. Same reason the rest of this schema avoids them.

-- framework_code becomes part of the key, so it cannot be null. Rows without one
-- were already unusable: the projection filters by framework_code, so a null
-- would belong to no framework and could never be counted.
DELETE FROM public.scf_control_mappings WHERE framework_code IS NULL;

ALTER TABLE public.scf_control_mappings
  ALTER COLUMN framework_code SET NOT NULL;

ALTER TABLE public.scf_control_mappings
  DROP CONSTRAINT IF EXISTS scf_control_mappings_pkey;

ALTER TABLE public.scf_control_mappings
  ADD CONSTRAINT scf_control_mappings_pkey
  PRIMARY KEY (scf_version_id, control_code, framework_code, requirement_code);

COMMENT ON COLUMN public.scf_control_mappings.requirement_code IS
  'The vendor''s requirement identifier — often the requirement''s full text, and '
  'for tier-marker frameworks (e.g. "SCRM Focus  TIER 1 STRATEGIC") the literal '
  'string "x". Not unique per control on its own, which is why framework_code is '
  'part of the primary key.';

COMMENT ON COLUMN public.scf_control_mappings.framework_code IS
  'Part of the primary key. A mapping with no framework belongs to no '
  'denominator and is dropped at sync time rather than stored.';
