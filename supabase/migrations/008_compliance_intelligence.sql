-- ============================================================================
-- Migration 008: Compliance Intelligence Tables
-- ihOS — Intelligent Hardened Operating System
--
-- Creates tables for the compliance intelligence dashboard:
--   1. evidence_evaluations    — Per-control evidence assessments with AI scoring
--   2. intelligence_snapshots  — Point-in-time compliance/ROI analytics
--
-- These tables power the compliance dashboard API:
--   Scorecard, Evaluations, Gaps, ROI Path, and Full Report
--
-- Dependencies: 003_core_tables (scf_controls)
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. EVIDENCE_EVALUATIONS — Per-control evidence assessments
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.evidence_evaluations (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    control_code      VARCHAR     NOT NULL,
    domain_code       VARCHAR     NOT NULL,
    control_name      VARCHAR     NOT NULL,
    is_compliant      BOOLEAN     NOT NULL DEFAULT false,
    confidence_score  NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
    missing_elements  JSONB       NULL,     -- string[] of missing evidence items
    auditor_notes     TEXT        NULL,
    evidence_sources  JSONB       NULL,     -- source references used in evaluation
    assessment_id     UUID        NULL REFERENCES public.compliance_assessments(id) ON DELETE SET NULL,
    evaluated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.evidence_evaluations IS 'Per-control evidence assessments with AI-generated compliance scoring';
COMMENT ON COLUMN public.evidence_evaluations.control_code IS 'SCF control code (e.g., PRI-01, DCH-06.1)';
COMMENT ON COLUMN public.evidence_evaluations.domain_code IS 'SCF domain code (e.g., PRI, DCH, AST)';
COMMENT ON COLUMN public.evidence_evaluations.confidence_score IS 'AI confidence in the compliance evaluation (0-100)';
COMMENT ON COLUMN public.evidence_evaluations.missing_elements IS 'JSON array of missing evidence items or gaps';
COMMENT ON COLUMN public.evidence_evaluations.evidence_sources IS 'JSON array of document/chunk references used as evidence';

CREATE INDEX idx_evidence_eval_control ON public.evidence_evaluations (control_code);
CREATE INDEX idx_evidence_eval_domain ON public.evidence_evaluations (domain_code);
CREATE INDEX idx_evidence_eval_compliant ON public.evidence_evaluations (is_compliant);
CREATE INDEX idx_evidence_eval_confidence ON public.evidence_evaluations (confidence_score);
CREATE INDEX idx_evidence_eval_assessment ON public.evidence_evaluations (assessment_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. INTELLIGENCE_SNAPSHOTS — Point-in-time compliance analytics
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.intelligence_snapshots (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_type     VARCHAR     NOT NULL CHECK (snapshot_type IN ('scorecard', 'roi_path', 'domain_breakdown', 'full_report')),
    framework_code    VARCHAR     NULL,
    snapshot_data     JSONB       NOT NULL,   -- Flexible JSON payload per snapshot_type
    metadata          JSONB       NULL,       -- Extra metadata (source, version, etc.)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.intelligence_snapshots IS 'Point-in-time snapshots of compliance intelligence data (scores, ROI, breakdowns)';
COMMENT ON COLUMN public.intelligence_snapshots.snapshot_type IS 'Type of snapshot: scorecard, roi_path, domain_breakdown, full_report';
COMMENT ON COLUMN public.intelligence_snapshots.framework_code IS 'Optional framework scope (NULL = cross-framework)';
COMMENT ON COLUMN public.intelligence_snapshots.snapshot_data IS 'Flexible JSON payload with the actual snapshot data';

CREATE INDEX idx_intel_snapshot_type ON public.intelligence_snapshots (snapshot_type);
CREATE INDEX idx_intel_snapshot_framework ON public.intelligence_snapshots (framework_code);
CREATE INDEX idx_intel_snapshot_created ON public.intelligence_snapshots (created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- ENABLE ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.evidence_evaluations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_snapshots  ENABLE ROW LEVEL SECURITY;

-- Evidence evaluations: authenticated users can read, admin can write
CREATE POLICY evidence_eval_select_authenticated ON public.evidence_evaluations
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY evidence_eval_admin ON public.evidence_evaluations
    FOR ALL
    USING (public.get_user_role() = 'admin');

-- Intelligence snapshots: authenticated users can read, admin can write
CREATE POLICY intel_snapshot_select_authenticated ON public.intelligence_snapshots
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY intel_snapshot_admin ON public.intelligence_snapshots
    FOR ALL
    USING (public.get_user_role() = 'admin');

-- ──────────────────────────────────────────────────────────────────────────────
-- TRIGGERS
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_evidence_evaluations_updated_at
    BEFORE UPDATE ON public.evidence_evaluations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
