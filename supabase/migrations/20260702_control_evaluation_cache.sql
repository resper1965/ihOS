-- ============================================================================
-- Migration: 20260702_control_evaluation_cache
-- ihOS — Persisted "current control situation" cache.
--
-- The RAG document corpus is the source of truth for whether a control is
-- currently satisfied. Historically every assessment run re-evaluated every
-- control via RAG + the Standard GRC Engine API, even when nothing changed.
-- This table persists the last known evaluation per control/scope so the
-- engine only re-calls external APIs when the document corpus changed
-- (corpus_fingerprint mismatch) or the user explicitly forces re-evaluation.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.control_evaluation_cache (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    control_code        VARCHAR     NOT NULL,
    mode                VARCHAR     NOT NULL CHECK (mode IN ('quick', 'deep')),
    product_version_id  UUID        NULL REFERENCES public.product_versions(id) ON DELETE CASCADE,
    sales_channel       VARCHAR     NULL,
    scope_key           VARCHAR     NOT NULL, -- app-computed: "<product_version_id|global>:<sales_channel|all>"
    corpus_fingerprint  VARCHAR     NOT NULL,
    evaluation          JSONB       NOT NULL,
    evaluated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (control_code, mode, scope_key)
);

COMMENT ON TABLE public.control_evaluation_cache IS 'Persisted last-known compliance status per SCF control. Reused across assessment runs until corpus_fingerprint changes (source documentation was updated) or the user forces re-evaluation. Minimizes RAG search and Standard GRC Engine API usage.';
COMMENT ON COLUMN public.control_evaluation_cache.scope_key IS 'App-computed cache scope: product_version_id (or "global") + sales_channel (or "all"). Plain column (not an expression index) so Supabase upsert(onConflict=...) works.';
COMMENT ON COLUMN public.control_evaluation_cache.corpus_fingerprint IS 'Hash of the relevant published document corpus (count + latest updated_at). A mismatch means source documentation changed since this evaluation and it must be refreshed.';
COMMENT ON COLUMN public.control_evaluation_cache.evaluation IS 'Serialized ControlEvaluation (ISMS/Evidence phases, combined status, confidence, snippets) — reused as-is when the cache is valid.';

CREATE INDEX IF NOT EXISTS idx_control_eval_cache_scope ON public.control_evaluation_cache (mode, scope_key);
CREATE INDEX IF NOT EXISTS idx_control_eval_cache_version ON public.control_evaluation_cache (product_version_id);

CREATE TRIGGER trg_control_evaluation_cache_updated_at
    BEFORE UPDATE ON public.control_evaluation_cache
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.control_evaluation_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY control_evaluation_cache_select_authenticated ON public.control_evaluation_cache
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY control_evaluation_cache_service_write ON public.control_evaluation_cache
    FOR ALL USING (auth.role() = 'service_role');

COMMIT;
