-- ============================================================================
-- Migration: 20260702_version_baseline_lineage
-- ihOS — Threat-model version lineage + delta extraction confidence.
--
-- Enables "accumulated" threat analysis across product versions:
--   * product_versions.previous_version_id — explicit, admin-set baseline link
--     (version_code is free-text, so lineage is declared, never inferred).
--   * threat_models.baseline_model_id — records which prior analysis a model
--     inherited from, so the UI can show inherited vs new threats.
--   * product_version_deltas.extraction_confidence / needs_review — the delta
--     extractor is an LLM; low-confidence deltas must be reviewable, not
--     silently trusted (Constitution Principle VIII).
-- ============================================================================

BEGIN;

-- 1. Explicit lineage between product versions (manual, admin-set).
ALTER TABLE public.product_versions
    ADD COLUMN IF NOT EXISTS previous_version_id UUID
        REFERENCES public.product_versions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.product_versions.previous_version_id IS
    'Explicit baseline: the version this one accumulates from. Set manually by an admin — never inferred from version_code (which is free-text).';

CREATE INDEX IF NOT EXISTS idx_product_versions_previous
    ON public.product_versions (previous_version_id);

-- 2. Threat-model lineage: which prior analysis this model inherited from.
ALTER TABLE public.threat_models
    ADD COLUMN IF NOT EXISTS baseline_model_id TEXT
        REFERENCES public.threat_models(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'generated'
        CHECK (source IN ('generated', 'inherited', 'manual_seed'));

COMMENT ON COLUMN public.threat_models.baseline_model_id IS
    'The prior-version threat_models row this analysis inherited threats from (NULL if generated from scratch or manually seeded).';
COMMENT ON COLUMN public.threat_models.source IS
    'generated = produced by the GRC engine; inherited = built on a previous-version baseline; manual_seed = imported as a starting baseline when no history existed.';

CREATE INDEX IF NOT EXISTS idx_threat_models_baseline
    ON public.threat_models (baseline_model_id);

-- 3. Delta extraction confidence + review flag.
ALTER TABLE public.product_version_deltas
    ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(3,2)
        CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1)),
    ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS source_document_id BIGINT
        REFERENCES public.compliance_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.product_version_deltas.extraction_confidence IS
    'LLM self-reported confidence (0-1) that this is a real technical feature delta. Low values should be reviewed before driving threat-model regeneration.';
COMMENT ON COLUMN public.product_version_deltas.needs_review IS
    'True when extraction_confidence is below the review threshold — surfaced for human confirmation.';
COMMENT ON COLUMN public.product_version_deltas.source_document_id IS
    'Document the delta was extracted from, for traceability.';

COMMIT;
