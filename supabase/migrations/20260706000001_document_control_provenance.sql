-- ============================================================================
-- Migration: Document Control Provenance
-- ihOS — Intelligent Hardened Operating System
--
-- Creates the provenance chain: Document → Chunk → SCF Control
-- Enables auditability: "Where did this control come from?"
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.document_control_provenance (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         BIGINT NOT NULL REFERENCES public.compliance_documents(id) ON DELETE CASCADE,
    chunk_id            BIGINT NOT NULL REFERENCES public.document_chunks(id) ON DELETE CASCADE,
    scf_control_code    VARCHAR NOT NULL,
    similarity          NUMERIC(4,3) NOT NULL,
    llm_status          VARCHAR NOT NULL DEFAULT 'pending',  -- 'implements' | 'mentions' | 'negates' | 'pending'
    extraction_method   VARCHAR NOT NULL DEFAULT 'semantic_match',  -- 'semantic_match' | 'llm_confirmed'
    evidence_snippet    TEXT,
    llm_justification   TEXT,
    product_version_id  UUID,
    extracted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chunk_id, scf_control_code)
);

CREATE INDEX IF NOT EXISTS idx_prov_document ON public.document_control_provenance(document_id);
CREATE INDEX IF NOT EXISTS idx_prov_control ON public.document_control_provenance(scf_control_code);
CREATE INDEX IF NOT EXISTS idx_prov_version ON public.document_control_provenance(product_version_id);
CREATE INDEX IF NOT EXISTS idx_prov_status ON public.document_control_provenance(llm_status);

COMMENT ON TABLE public.document_control_provenance IS
  'Provenance chain linking document chunks to SCF controls with similarity score, LLM confirmation status, and evidence snippets.';
