-- ============================================================================
-- Migration: 20260622_scrms_msr_baseline
-- ihOS — Intelligent Hardened Operating System
--
-- Creates tables to support the SCRMS (Security, Compliance & Resilience
-- Management System) methodology, enabling MCR, DSR, and MSR baseline mappings.
-- ============================================================================

BEGIN;

-- 1. Create msr_baselines table
CREATE TABLE IF NOT EXISTS public.msr_baselines (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    product_version_id  UUID            REFERENCES public.product_versions(id) ON DELETE CASCADE,
    name                VARCHAR         NOT NULL,
    description         TEXT,
    status              VARCHAR         NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'deprecated')),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (product_version_id, name)
);

COMMENT ON TABLE public.msr_baselines IS 'MSR security baselines mapping compliance & risk requirements to products';

-- Apply set_updated_at trigger
CREATE TRIGGER trg_msr_baselines_updated_at
    BEFORE UPDATE ON public.msr_baselines
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 2. Create msr_controls table
CREATE TABLE IF NOT EXISTS public.msr_controls (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    baseline_id         UUID            NOT NULL REFERENCES public.msr_baselines(id) ON DELETE CASCADE,
    control_code        VARCHAR         NOT NULL REFERENCES public.scf_controls(control_code) ON DELETE CASCADE,
    classification      VARCHAR         NOT NULL CHECK (classification IN ('MCR', 'DSR')),
    status              VARCHAR         NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'accepted', 'rejected')),
    rejection_rationale TEXT,
    dsr_score           NUMERIC(5,2)    DEFAULT 0,
    dsr_factors         JSONB           DEFAULT '{}'::jsonb,
    pptdf_scope         TEXT[]          DEFAULT '{}'::text[],
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (baseline_id, control_code)
);

COMMENT ON TABLE public.msr_controls IS 'Scoped controls in the security baseline (Minimum Compliance + Discretionary Risk)';
COMMENT ON COLUMN public.msr_controls.classification IS 'MCR (Minimum Compliance Requirement) or DSR (Discretionary Security Requirement)';
COMMENT ON COLUMN public.msr_controls.status IS 'Status of the control within the baseline';
COMMENT ON COLUMN public.msr_controls.dsr_score IS 'Calculated priority score (1-100) for DSR controls';
COMMENT ON COLUMN public.msr_controls.dsr_factors IS 'Algorithmic scoring breakdown for the 5 DSR factors';
COMMENT ON COLUMN public.msr_controls.pptdf_scope IS 'PPTDF scope applicability: People, Process, Technology, Data, Facility';

-- Apply set_updated_at trigger
CREATE TRIGGER trg_msr_controls_updated_at
    BEFORE UPDATE ON public.msr_controls
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_msr_baselines_version ON public.msr_baselines(product_version_id);
CREATE INDEX IF NOT EXISTS idx_msr_controls_lookup ON public.msr_controls(baseline_id, control_code);
CREATE INDEX IF NOT EXISTS idx_msr_controls_classification ON public.msr_controls(classification);
CREATE INDEX IF NOT EXISTS idx_msr_controls_status ON public.msr_controls(status);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.msr_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.msr_controls ENABLE ROW LEVEL SECURITY;

-- Select policies: authenticated users can read baselines/controls
CREATE POLICY msr_baselines_select_authenticated ON public.msr_baselines
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY msr_controls_select_authenticated ON public.msr_controls
    FOR SELECT USING (auth.role() = 'authenticated');

-- Write policies: admins can manage baselines/controls
CREATE POLICY msr_baselines_admin ON public.msr_baselines
    FOR ALL USING (public.get_user_role() = 'admin');

CREATE POLICY msr_controls_admin ON public.msr_controls
    FOR ALL USING (public.get_user_role() = 'admin');

COMMIT;
