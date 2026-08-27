-- =====================================================================
-- CONTROL-FIRST SPINE — apply everything, in order
--
-- Paste this whole file into the Supabase SQL Editor and run it once.
--
-- It combines:
--   migration 20260828000001  the four spine tables
--   migration 20260828000002  the sync job table
--   the curated framework identity row you decided on 2026-08-27
--   a verification block that prints what landed
--
-- Safe to run more than once: every statement is CREATE ... IF NOT EXISTS,
-- DROP POLICY IF EXISTS before CREATE POLICY, or an idempotent upsert.
--
-- Nothing here writes a secret, and nothing here deletes anything.
--
-- After this runs, the next step is:
--   POST /api/admin/sync/scf     (admin or ionic_user session)
-- which loads the catalogue in one request and then walks the crosswalk —
-- roughly 13 minutes at the vendor's 120-requests-per-60-seconds limit.
-- =====================================================================

BEGIN;

-- =====================================================================
-- PART 1 — the spine (migration 20260828000001)
--
-- Vendor-confirmed 2026-08-27: every UUID this API returns for a control, a
-- framework or a mapping row is minted per SCF version and rotates on a version
-- bump. Their words: "the UUID is a row identity, not a control identity."
-- So no UUID is a primary key. UUIDs live as attributes named *_uuid, because
-- they are still needed to address the API within a version, and every key is a
-- business identifier that survives a bump.
-- =====================================================================

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


-- The judgement table. Our slugs on the left, the vendor's framework on the
-- right, a named human in the middle.
--
-- Deliberately has NO foreign key. An earlier draft pointed it at a vendor
-- UUID, which would have broken every row on a version bump and silently
-- orphaned curation work with no way to tell which decision had been lost.
--
-- vendor_framework_code stays nullable on purpose: "we looked and could not
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
  'this table is the structural answer to that.';

COMMENT ON COLUMN public.framework_identity_curation.decided_against_version IS
  'Which SCF version the human was looking at when they decided. A later '
  'version may rename or split a framework; this records what was on screen.';

-- A decision must say something. Either it names a vendor framework, or it is
-- explicitly undecided/rejected — never a null dressed as a pending match.
ALTER TABLE public.framework_identity_curation
  DROP CONSTRAINT IF EXISTS framework_identity_curation_decided_or_not;
ALTER TABLE public.framework_identity_curation
  ADD CONSTRAINT framework_identity_curation_decided_or_not CHECK (
    (vendor_framework_code IS NOT NULL AND confidence IN ('exact', 'probable'))
    OR
    (vendor_framework_code IS NULL AND confidence IN ('undecided', 'rejected'))
  );


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
  'request. This is the ONLY control base in the product. It replaced '
  'src/lib/assessment/data/iso27001-annex-a.json, a committed duplicate of 93 '
  'ISO Annex A controls whose existence forced local-engine.ts to guess an SCF '
  'code per control and fall back to a hardcoded default when the guess failed.';


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
-- vendor adds a sixth type, the sync fails loudly instead of persisting a value
-- src/lib/assessment/curation/policy.ts has no rule for.
COMMENT ON COLUMN public.scf_control_mappings.relationship_type IS
  'Vendor vocabulary, exactly five values as of 2026-08-27. A new value must '
  'break the sync, because the curation policy decides what each one '
  'contributes and cannot decide for a type it has never seen.';

COMMENT ON COLUMN public.scf_control_mappings.strength_is_trustworthy IS
  'False where relationship_strength is the vendor''s meaningless constant. '
  'Their importer enum-ised the source strength ("strong"/"moderate"/"weak"), '
  'then seeding ran (parseFloat(x) || 0.5) — and parseFloat("strong") is NaN, '
  'so the default fired on EVERY official row. Every strength the API serves '
  'today is 0.500, derived from nothing. Void, not merely unverified.';

COMMENT ON COLUMN public.scf_control_mappings.is_official IS
  'From the vendor. An unofficial mapping may be someone''s synthetic guess and '
  'never moves a customer-facing number without a human saying so.';


ALTER TABLE public.scf_framework_catalog        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scf_controls_cache           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scf_control_mappings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.framework_identity_curation  ENABLE ROW LEVEL SECURITY;

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


-- =====================================================================
-- PART 2 — sync job rows (migration 20260828000002)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.scf_sync_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status         text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  stages         text[] NOT NULL,
  scf_version_id uuid,
  progress       jsonb NOT NULL DEFAULT '{}'::jsonb,
  error          text,
  started_by     uuid REFERENCES auth.users(id),
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);

COMMENT ON TABLE public.scf_sync_jobs IS
  'One row per SCF sync run. Started by POST /api/admin/sync/scf (admin or '
  'ionic_user), polled by GET with ?jobId=. A failed crosswalk run keeps its '
  'partial progress here, including the last control_code reached, so a resume '
  'starts there rather than at the beginning.';

COMMENT ON COLUMN public.scf_sync_jobs.progress IS
  'Per-stage counts. crosswalk.lastControlCode is the resume point: pass it as '
  'resumeAfterControlCode on the next POST.';

-- Only one run at a time. Two concurrent walks would spend the same vendor rate
-- budget against each other and both crawl, and the second would repeat the
-- first's work rather than extend it. The route also checks, but a route check
-- races with itself; this makes the invariant true.
CREATE UNIQUE INDEX IF NOT EXISTS scf_sync_jobs_one_running
  ON public.scf_sync_jobs ((status))
  WHERE status = 'running';

ALTER TABLE public.scf_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scf_sync_jobs_read ON public.scf_sync_jobs;
CREATE POLICY scf_sync_jobs_read ON public.scf_sync_jobs
  FOR SELECT TO authenticated USING (true);


-- =====================================================================
-- PART 3 — the framework identity decision
--
-- This is the one row in this file that is a human judgement rather than
-- structure, and it is why the table exists.
--
-- Our `iso27001` is an identifier WE invented, used across 17 files as a
-- database key, a query filter, an assessment default and a UI selector. It
-- addresses nothing on the vendor's side. Of the vendor's 272 frameworks,
-- exactly two matched /27001|27002/: "ISO 27001 2022" and "ISO 27002 2022".
-- 27002 is the implementation guidance, not the certifiable standard.
--
-- Decided by resper@ionic.health on 2026-08-27, looking at SCF version
-- 8260df81-979f-4eab-a525-26550ad95d79.
--
-- No other local code is seeded here. iso27701, fedramp, IEC-62304 and
-- TX-LEVEL-2 have not been decided, and the five quarantined codes may never
-- be. A missing row is honest; a guessed row is how the 25,589 came to exist.
-- =====================================================================

INSERT INTO public.framework_identity_curation
  (local_code, vendor_framework_code, confidence, decided_by, decided_against_version, rationale)
VALUES (
  'iso27001',
  'ISO 27001 2022',
  'exact',
  'resper@ionic.health',
  '8260df81-979f-4eab-a525-26550ad95d79',
  'Only two of the vendor''s 272 frameworks matched 27001|27002: "ISO 27001 2022" '
  'and "ISO 27002 2022". 27002 is the implementation guidance, not the certifiable '
  'standard, so it is not what our iso27001 means.'
)
ON CONFLICT (local_code) DO UPDATE SET
  vendor_framework_code   = EXCLUDED.vendor_framework_code,
  confidence              = EXCLUDED.confidence,
  decided_by              = EXCLUDED.decided_by,
  decided_at              = now(),
  decided_against_version = EXCLUDED.decided_against_version,
  rationale               = EXCLUDED.rationale;

COMMIT;


-- =====================================================================
-- PART 4 — verification. Read this output; it is the point of running it.
-- =====================================================================

SELECT
  'tables created' AS check,
  count(*)::text || ' of 5' AS result
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'scf_framework_catalog',
    'scf_controls_cache',
    'scf_control_mappings',
    'framework_identity_curation',
    'scf_sync_jobs'
  );

SELECT
  'no key is a rotating vendor uuid' AS check,
  CASE WHEN count(*) = 0 THEN 'ok' ELSE 'FAIL: ' || count(*)::text || ' found' END AS result
FROM information_schema.key_column_usage k
JOIN information_schema.table_constraints t
  ON t.constraint_name = k.constraint_name AND t.table_schema = k.table_schema
WHERE k.table_schema = 'public'
  AND t.constraint_type = 'PRIMARY KEY'
  AND k.table_name IN (
    'scf_framework_catalog', 'scf_controls_cache',
    'scf_control_mappings', 'framework_identity_curation'
  )
  AND k.column_name LIKE '%\_uuid';

SELECT
  'framework identity' AS check,
  local_code || ' -> ' || coalesce(vendor_framework_code, '(undecided)')
    || '  [' || confidence || ', by ' || decided_by || ']' AS result
FROM public.framework_identity_curation
ORDER BY local_code;

SELECT
  'catalogue rows' AS check,
  'controls: ' || (SELECT count(*) FROM public.scf_controls_cache)::text ||
  ', frameworks: ' || (SELECT count(*) FROM public.scf_framework_catalog)::text ||
  ', mappings: ' || (SELECT count(*) FROM public.scf_control_mappings)::text ||
  '  (all zero until POST /api/admin/sync/scf runs)' AS result;
