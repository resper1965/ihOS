-- ============================================================================
-- Migration: 20260623_grc_isms_core_delta
-- ihOS — Intelligent Hardened Operating System
--
-- Establishes separating Core ISMS from Version Deltas.
-- ============================================================================

BEGIN;

-- 1. Create isms_baselines table
CREATE TABLE IF NOT EXISTS public.isms_baselines (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    framework_code      VARCHAR         NOT NULL,
    name                VARCHAR         NOT NULL,
    description         TEXT,
    status              VARCHAR         NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Apply set_updated_at trigger
CREATE TRIGGER trg_isms_baselines_updated_at
    BEFORE UPDATE ON public.isms_baselines
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 2. Create isms_controls table
CREATE TABLE IF NOT EXISTS public.isms_controls (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    isms_id             UUID            NOT NULL REFERENCES public.isms_baselines(id) ON DELETE CASCADE,
    control_code        VARCHAR         NOT NULL REFERENCES public.scf_controls(control_code) ON DELETE CASCADE,
    status              VARCHAR         NOT NULL DEFAULT 'implemented' CHECK (status IN ('implemented', 'partial', 'planned', 'not_applicable')),
    evidence_url        TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (isms_id, control_code)
);

-- Apply set_updated_at trigger
CREATE TRIGGER trg_isms_controls_updated_at
    BEFORE UPDATE ON public.isms_controls
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 3. Create product_version_deltas table
CREATE TABLE IF NOT EXISTS public.product_version_deltas (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    product_version_id  UUID            NOT NULL REFERENCES public.product_versions(id) ON DELETE CASCADE,
    feature_slug        VARCHAR         NOT NULL,
    description         TEXT            NOT NULL,
    affected_components TEXT[]          NOT NULL DEFAULT '{}'::text[],
    risk_level          VARCHAR         NOT NULL CHECK (risk_level IN ('high', 'medium', 'low')),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (product_version_id, feature_slug)
);

-- Apply set_updated_at trigger
CREATE TRIGGER trg_product_version_deltas_updated_at
    BEFORE UPDATE ON public.product_version_deltas
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 4. Evolve msr_baselines to support inheritance
ALTER TABLE public.msr_baselines 
    ADD COLUMN parent_baseline_id UUID REFERENCES public.msr_baselines(id) ON DELETE SET NULL,
    ADD COLUMN isms_baseline_id UUID REFERENCES public.isms_baselines(id) ON DELETE RESTRICT;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.isms_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.isms_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_version_deltas ENABLE ROW LEVEL SECURITY;

-- Select policies
CREATE POLICY isms_baselines_select_authenticated ON public.isms_baselines
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY isms_controls_select_authenticated ON public.isms_controls
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY product_version_deltas_select_authenticated ON public.product_version_deltas
    FOR SELECT USING (auth.role() = 'authenticated');

-- Write policies for admin management
CREATE POLICY isms_baselines_admin ON public.isms_baselines
    FOR ALL USING (public.get_user_role() = 'admin');

CREATE POLICY isms_controls_admin ON public.isms_controls
    FOR ALL USING (public.get_user_role() = 'admin');

CREATE POLICY product_version_deltas_admin ON public.product_version_deltas
    FOR ALL USING (public.get_user_role() = 'admin');

COMMIT;
