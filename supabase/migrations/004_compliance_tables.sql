-- ============================================================================
-- Migration 004: Compliance Assessment & POAM Tables
-- ihOS — Intelligent Hardened Operating System
--
-- Creates tables for the compliance assessment workflow:
--   1. compliance_assessments — Framework-specific assessment containers
--   2. poam_items             — Plan of Action & Milestones findings
--
-- These tables complete the compliance lifecycle:
--   Assessment → Finding → Remediation → Closure/Risk Acceptance
--
-- Dependencies: 002_enums (poam_status), auth.users
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. COMPLIANCE_ASSESSMENTS — assessment containers
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.compliance_assessments (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    framework_code          VARCHAR     NOT NULL,
    user_id                 UUID        REFERENCES auth.users(id),
    observation_start_date  DATE,
    observation_end_date    DATE,
    status                  VARCHAR     NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'in_progress', 'completed', 'archived')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compliance_assessments IS 'Compliance assessment containers scoped to a specific framework (ISO-27001, SOC-2, etc.)';
COMMENT ON COLUMN public.compliance_assessments.framework_code IS 'Target framework identifier (e.g., ISO-27001, SOC-2, NIST-800-53)';
COMMENT ON COLUMN public.compliance_assessments.status IS 'Assessment lifecycle: draft → in_progress → completed → archived';
COMMENT ON COLUMN public.compliance_assessments.observation_start_date IS 'Start of the audit observation period';
COMMENT ON COLUMN public.compliance_assessments.observation_end_date IS 'End of the audit observation period';

-- Index for filtering assessments by framework
CREATE INDEX idx_assessments_framework ON public.compliance_assessments (framework_code);
-- Index for filtering assessments by owner
CREATE INDEX idx_assessments_user ON public.compliance_assessments (user_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. POAM_ITEMS — Plan of Action & Milestones
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.poam_items (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id               UUID            NOT NULL REFERENCES public.compliance_assessments(id) ON DELETE CASCADE,
    control_code                VARCHAR,
    finding                     TEXT,
    remediation                 TEXT,
    status                      public.poam_status NOT NULL DEFAULT 'open',
    risk_acceptance_expires_at  TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.poam_items IS 'Plan of Action & Milestones — tracks findings and remediation from compliance assessments';
COMMENT ON COLUMN public.poam_items.control_code IS 'Control identifier with the finding (e.g., AC-1, A.5.1)';
COMMENT ON COLUMN public.poam_items.finding IS 'Description of the compliance gap or finding';
COMMENT ON COLUMN public.poam_items.remediation IS 'Planned or completed remediation action';
COMMENT ON COLUMN public.poam_items.risk_acceptance_expires_at IS 'Expiration date when status is risk_accepted — requires periodic review';

-- Index for retrieving POAM items by assessment
CREATE INDEX idx_poam_assessment ON public.poam_items (assessment_id);
-- Index for filtering by status (e.g., "show all open items")
CREATE INDEX idx_poam_status ON public.poam_items (status);

-- ──────────────────────────────────────────────────────────────────────────────
-- Auto-update updated_at timestamps via trigger
-- ──────────────────────────────────────────────────────────────────────────────

-- Generic trigger function for updated_at columns
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS 'Generic trigger function to auto-update updated_at timestamp on row modification';

-- Apply to compliance_documents
CREATE TRIGGER trg_compliance_documents_updated_at
    BEFORE UPDATE ON public.compliance_documents
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Apply to compliance_assessments
CREATE TRIGGER trg_compliance_assessments_updated_at
    BEFORE UPDATE ON public.compliance_assessments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Apply to poam_items
CREATE TRIGGER trg_poam_items_updated_at
    BEFORE UPDATE ON public.poam_items
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
