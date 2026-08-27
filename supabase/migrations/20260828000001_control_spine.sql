-- Migration 20260828000001: the control-first spine.
--
-- Spec: docs/superpowers/specs/2026-08-27-control-first-design.md
-- Plan: docs/superpowers/plans/2026-08-27-control-first-spine.md
-- Measured API contract: docs/standard-api/CONTRACT_AUDIT.md §H
--
-- Four tables. Three mirror vendor data and may be truncated and re-synced at
-- will. The fourth, framework_identity_curation, holds human decisions and must
-- never be rebuilt from a transform.
--
-- The constraint that shaped all of it, vendor-confirmed 2026-08-27: every UUID
-- this API returns for a control, a framework or a mapping row is minted per SCF
-- version and rotates on a version bump. Their schema uses
-- `id uuid defaultRandom()` with real uniqueness on (scf_version_id, business
-- key), and their words were "the UUID is a row identity, not a control
-- identity". So no UUID is a primary key below. UUIDs are stored as attributes
-- named *_uuid — they are still needed to address the API within a version —
-- and every key is a business identifier that survives.

-- ── Vendor mirror: frameworks ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scf_framework_catalog (
  scf_version_id uuid    NOT NULL,
  framework_code text    NOT NULL,
  framework_uuid uuid    NOT NULL,
  framework_name text    NOT NULL,
  is_synthetic   boolean NOT NULL DEFAULT false,
  status         text    NOT NULL,
  synced_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scf_version_id, framework_code)
);

COMMENT ON TABLE public.scf_framework_catalog IS
  'Mirror of GET /api/v1/scf/frameworks. 272 rows as of 2026-08-27. '
  'framework_code is the vendor human string (e.g. "AICPA TSC 2017:2022 '
  '(used for SOC 2)", "ISO 27001 2022") and is NOT one of our slugs. '
  'Safe to truncate and re-sync.';

COMMENT ON COLUMN public.scf_framework_catalog.framework_uuid IS
  'The UUID to put in a URL path. Rotates per SCF version — never store it as '
  'a foreign key and never persist it outside a row that also names the version.';

-- ── The judgement table ─────────────────────────────────────────────────────
--
-- Our slugs on the left, the vendor's framework on the right, a named human in
-- the middle.
--
-- An earlier draft had `framework_id uuid REFERENCES scf_framework_catalog(...)`
-- here. That was wrong in the worst possible place: this is the one table
-- holding human decisions, and every row's foreign key would have broken on an
-- SCF version bump — silently orphaning curation work with no way to tell which
-- decision had been lost. It keys on framework_code, which survives versions,
-- and deliberately has no foreign key at all.
--
-- vendor_framework_code stays nullable on purpose. "We looked and could not
-- defensibly decide" is a real, recordable answer, and it is the answer the
-- 25,589 rows quarantined in 20260825000002 should have carried instead of a
-- manufactured id.

CREATE TABLE IF NOT EXISTS public.framework_identity_curation (
  local_code              text NOT NULL,
  vendor_framework_code   text NULL,
  confidence              text NOT NULL
    CHECK (confidence IN ('exact', 'probable', 'rejected', 'undecided')),
  decided_by              text NOT NULL,
  decided_at              timestamptz NOT NULL DEFAULT now(),
  decided_against_version uuid NOT NULL,
  rationale               text NOT NULL,
  PRIMARY KEY (local_code)
);

COMMENT ON TABLE public.framework_identity_curation IS
  'Which vendor framework each of our local codes means. Populated by a human, '
  'never by a string transform. Migration 20260825000002 quarantined 25,589 '
  'rows manufactured by prefixing one framework''s control ids into another''s; '
  'this table is the structural answer to that. Deliberately has no foreign '
  'key: framework_code is stable across versions, and a hard reference would '
  'let a vendor version bump destroy curation work.';

COMMENT ON COLUMN public.framework_identity_curation.decided_against_version IS
  'Which SCF version the human was looking at when they decided. A later '
  'version may rename or split a framework; this records what was on screen.';

-- A decision must say something. Either it names a vendor framework, or it is
-- explicitly undecided/rejected — never a null dressed as a pending exact match.
ALTER TABLE public.framework_identity_curation
  DROP CONSTRAINT IF EXISTS framework_identity_curation_decided_or_not;
ALTER TABLE public.framework_identity_curation
  ADD CONSTRAINT framework_identity_curation_decided_or_not CHECK (
    (vendor_framework_code IS NOT NULL AND confidence IN ('exact', 'probable'))
    OR
    (vendor_framework_code IS NULL AND confidence IN ('undecided', 'rejected'))
  );

-- ── Vendor mirror: controls ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scf_controls_cache (
  scf_version_id      uuid    NOT NULL,
  control_code        text    NOT NULL,
  control_uuid        uuid    NOT NULL,
  control_title       text    NOT NULL,
  control_description text,
  scf_domain_uuid     uuid,
  status              text    NOT NULL,
  is_synthetic        boolean NOT NULL DEFAULT false,
  synced_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scf_version_id, control_code)
);

COMMENT ON TABLE public.scf_controls_cache IS
  'Mirror of the SCF control catalogue, loaded via the NDJSON export in one '
  'request. This is the ONLY control base in the product. It replaces '
  'src/lib/assessment/data/iso27001-annex-a.json, a committed duplicate of 93 '
  'ISO Annex A controls whose existence forced local-engine.ts to guess an SCF '
  'code per control and fall back to a hardcoded default when the guess failed.';

-- ── Vendor mirror: the crosswalk ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scf_control_mappings (
  scf_version_id          uuid    NOT NULL,
  control_code            text    NOT NULL,
  requirement_code        text    NOT NULL,
  framework_code          text,
  mapping_uuid            uuid,
  requirement_uuid        uuid,
  relationship_type       text    NOT NULL
    CHECK (relationship_type IN ('equal', 'subset', 'intersects', 'superset', 'no_relation')),
  relationship_strength   numeric NULL,
  strength_is_trustworthy boolean NOT NULL DEFAULT true,
  mapping_source          text,
  is_official             boolean NOT NULL DEFAULT false,
  is_synthetic            boolean NOT NULL DEFAULT false,
  synced_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scf_version_id, control_code, requirement_code)
);

CREATE INDEX IF NOT EXISTS scf_control_mappings_control_idx
  ON public.scf_control_mappings (scf_version_id, control_code);
CREATE INDEX IF NOT EXISTS scf_control_mappings_framework_idx
  ON public.scf_control_mappings (scf_version_id, framework_code);
CREATE INDEX IF NOT EXISTS scf_control_mappings_rel_idx
  ON public.scf_control_mappings (relationship_type);

-- The CHECK on relationship_type is load-bearing beyond validation: if the
-- vendor adds a sixth type, the sync fails loudly instead of silently
-- persisting a value src/lib/assessment/curation/policy.ts has no rule for.
COMMENT ON COLUMN public.scf_control_mappings.relationship_type IS
  'Vendor vocabulary, exactly five values as of 2026-08-27. A new value must '
  'break the sync, because the curation policy decides what each one '
  'contributes and cannot decide for a type it has never seen.';

COMMENT ON COLUMN public.scf_control_mappings.strength_is_trustworthy IS
  'False where relationship_strength is the vendor''s meaningless constant. '
  'Their importer enum-ised the source strength, then seeding ran '
  '(parseFloat(x) || 0.5) — and parseFloat("strong") is NaN, so the default '
  'fired on EVERY official row. Every strength served today is 0.500, derived '
  'from nothing. Void, not merely unverified — these rows want a re-read once '
  'their fix is live.';

COMMENT ON COLUMN public.scf_control_mappings.is_official IS
  'From the vendor. An unofficial mapping may be someone''s synthetic guess and '
  'never moves a customer-facing number without a human saying so.';

-- ── Access ──────────────────────────────────────────────────────────────────
-- Vendor mirrors are readable by any authenticated user; only the service role
-- writes them, because only the sync job does. The curation table is writable
-- by the service role too — the API route behind it enforces admin/ionic_user.

ALTER TABLE public.scf_framework_catalog        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scf_controls_cache           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scf_control_mappings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.framework_identity_curation  ENABLE ROW LEVEL SECURITY;

-- Written out rather than looped. A DO block with format() and EXECUTE would be
-- four lines shorter and cannot be parse-checked without a live server, which
-- this migration has no way to reach before it is applied for real. Eight plain
-- statements have nothing to get wrong.

DROP POLICY IF EXISTS scf_framework_catalog_read ON public.scf_framework_catalog;
CREATE POLICY scf_framework_catalog_read ON public.scf_framework_catalog
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS scf_controls_cache_read ON public.scf_controls_cache;
CREATE POLICY scf_controls_cache_read ON public.scf_controls_cache
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS scf_control_mappings_read ON public.scf_control_mappings;
CREATE POLICY scf_control_mappings_read ON public.scf_control_mappings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS framework_identity_curation_read ON public.framework_identity_curation;
CREATE POLICY framework_identity_curation_read ON public.framework_identity_curation
  FOR SELECT TO authenticated USING (true);
