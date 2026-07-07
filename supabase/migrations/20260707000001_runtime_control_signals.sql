-- ============================================================================
-- Migration 20260707000001: runtime control signals (analytical posture axis).
--
-- Closes the DefectDojo dead-end: findings were synced into
-- defectdojo_findings but never consumed, and were mapped only to
-- ISO/SOC2/NIST codes — outside the SCF spine the rest of ihOS speaks.
--
-- This migration adds the ANALYTICAL posture axis alongside the existing
-- DOCUMENTAL axis (control_evaluation_cache / evidence evaluations):
--
--   1. defectdojo_findings gains mapped_scf_controls[] + product_version_id
--      so each finding lands on the same SCF spine as documents do.
--   2. runtime_control_signals — one row per (source, finding, SCF control):
--      the normalized "observed at runtime" evidence stream. The documental
--      verdict (conforming/partial/informal/gap) is NEVER overwritten by
--      these signals; consumers derive a separate observed status
--      (violated/degraded/clean) from them.
--   3. defectdojo_product_links — maps a DefectDojo product to an ihOS
--      product_version, replacing the single global DEFECTDOJO_PRODUCT_ID
--      env var (kept as fallback for a version-less link).
--
-- Idempotent: re-running is a no-op.
-- ============================================================================

BEGIN;

-- ── 1. SCF spine on defectdojo_findings ─────────────────────────────────────

ALTER TABLE public.defectdojo_findings
    ADD COLUMN IF NOT EXISTS mapped_scf_controls TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS product_version_id UUID NULL
        REFERENCES public.product_versions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.defectdojo_findings.mapped_scf_controls IS
  'SCF control codes resolved from the finding''s ISO/NIST mappings via scf_framework_mappings. Empty = unmapped (surfaced as a coverage gap, never guessed).';
COMMENT ON COLUMN public.defectdojo_findings.product_version_id IS
  'ihOS product version this finding belongs to, resolved via defectdojo_product_links. NULL = org-wide / unlinked product.';

CREATE INDEX IF NOT EXISTS idx_dd_findings_scf_controls
    ON public.defectdojo_findings USING GIN (mapped_scf_controls);
CREATE INDEX IF NOT EXISTS idx_dd_findings_version
    ON public.defectdojo_findings (product_version_id);

-- ── 2. Normalized runtime signal stream ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.runtime_control_signals (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scf_control_code    VARCHAR     NOT NULL,
    product_version_id  UUID        NULL REFERENCES public.product_versions(id) ON DELETE CASCADE,
    source              VARCHAR     NOT NULL DEFAULT 'defectdojo',
    source_ref          VARCHAR     NOT NULL,   -- e.g. DefectDojo finding id
    title               TEXT        NOT NULL,
    severity            VARCHAR     NOT NULL CHECK (severity IN ('Critical', 'High', 'Medium', 'Low', 'Info')),
    active              BOOLEAN     NOT NULL DEFAULT true,
    verified            BOOLEAN     NOT NULL DEFAULT false,
    risk_accepted       BOOLEAN     NOT NULL DEFAULT false,
    is_mitigated        BOOLEAN     NOT NULL DEFAULT false,
    observed_at         TIMESTAMPTZ NULL,       -- when the source first saw it
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, source_ref, scf_control_code)
);

COMMENT ON TABLE public.runtime_control_signals IS
  'Analytical ("observed moment") posture axis: normalized runtime evidence per SCF control, fed by DefectDojo (and future sources). Read together with the documental axis — never replaces it.';
COMMENT ON COLUMN public.runtime_control_signals.source_ref IS
  'Stable identifier of the signal in its source system (DefectDojo finding id). One finding can touch several SCF controls.';

CREATE INDEX IF NOT EXISTS idx_runtime_signals_control
    ON public.runtime_control_signals (scf_control_code) WHERE active;
CREATE INDEX IF NOT EXISTS idx_runtime_signals_version
    ON public.runtime_control_signals (product_version_id);
CREATE INDEX IF NOT EXISTS idx_runtime_signals_source
    ON public.runtime_control_signals (source, source_ref);

ALTER TABLE public.runtime_control_signals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'runtime_control_signals' AND policyname = 'runtime_signals_select_authenticated'
  ) THEN
    CREATE POLICY runtime_signals_select_authenticated ON public.runtime_control_signals
        FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'runtime_control_signals' AND policyname = 'runtime_signals_service_write'
  ) THEN
    CREATE POLICY runtime_signals_service_write ON public.runtime_control_signals
        FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ── 3. DefectDojo product ↔ ihOS version link ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.defectdojo_product_links (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    dd_product_id       INT         NOT NULL UNIQUE,
    product_version_id  UUID        NULL REFERENCES public.product_versions(id) ON DELETE CASCADE,
    label               TEXT        NULL,
    is_active           BOOLEAN     NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.defectdojo_product_links IS
  'Which DefectDojo products the sync cron pulls, and which ihOS product version each one feeds. NULL product_version_id = org-wide signals. When empty, the cron falls back to the DEFECTDOJO_PRODUCT_ID env var.';

ALTER TABLE public.defectdojo_product_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'defectdojo_product_links' AND policyname = 'dd_product_links_select_authenticated'
  ) THEN
    CREATE POLICY dd_product_links_select_authenticated ON public.defectdojo_product_links
        FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'defectdojo_product_links' AND policyname = 'dd_product_links_admin_write'
  ) THEN
    CREATE POLICY dd_product_links_admin_write ON public.defectdojo_product_links
        FOR ALL USING (
          auth.role() = 'service_role'
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role IN ('admin', 'ionic_user')
          )
        );
  END IF;
END $$;

COMMIT;
