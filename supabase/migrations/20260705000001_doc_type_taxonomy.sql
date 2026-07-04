-- ============================================================================
-- Migration 20260705000001: semantic doc_type taxonomy (specs/003 F1).
--
-- Until now the upload path wrote the FILE FORMAT (pdf/docx/...) into
-- doc_type, duplicating file_format. doc_type becomes the semantic document
-- type that drives which flow consumes the document:
--   POLICY          ISMS policies/norms          → assessment phase 1
--   PROCEDURE       SOPs, operational procedures → assessment phase 2
--   CONTRACT        DPAs/MSAs per sales channel  → channel overlay
--   CLOUD_ARCH_ORG  org-wide cloud infra         → CLD/NET controls
--   SAD             solution architecture        → threat modeling (version)
--   SRS_SDS         requirements/design          → threat modeling (version)
--   TEST_REPORT     version V&V evidence         → version-scoped evidence
--   EVIDENCE_RECORD audit reports/records        → assessment phase 2
--   UNCLASSIFIED    transitional value for legacy rows awaiting triage
--
-- Migration order matters (legacy rows hold format values, not NULLs):
--   1. preserve the format into file_format where it is missing;
--   2. map legacy SEMANTIC values (used by the local audit engine filters,
--      local-engine.ts) onto the new taxonomy — never reset them blindly;
--   3. reset remaining non-taxonomy values to UNCLASSIFIED;
--   4. only then add the CHECK (admitting UNCLASSIFIED).
-- Idempotent: re-running is a no-op.
-- ============================================================================

BEGIN;

UPDATE public.compliance_documents
   SET file_format = doc_type
 WHERE file_format IS NULL
   AND doc_type IN ('pdf', 'docx', 'txt', 'md', 'csv', 'xlsx');

-- Legacy semantic values → new taxonomy (SoA/control matrices are ISMS
-- policy-phase artifacts; audit reports/records are operational evidence).
UPDATE public.compliance_documents SET doc_type = 'POLICY'
 WHERE doc_type IN ('policy', 'manual', 'soa', 'matrix');
UPDATE public.compliance_documents SET doc_type = 'PROCEDURE'
 WHERE doc_type = 'procedure';
UPDATE public.compliance_documents SET doc_type = 'EVIDENCE_RECORD'
 WHERE doc_type IN ('evidence', 'audit_report', 'internal_audit');

UPDATE public.compliance_documents
   SET doc_type = 'UNCLASSIFIED'
 WHERE doc_type NOT IN
   ('POLICY', 'PROCEDURE', 'CONTRACT', 'CLOUD_ARCH_ORG',
    'SAD', 'SRS_SDS', 'TEST_REPORT', 'EVIDENCE_RECORD', 'UNCLASSIFIED');

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'compliance_documents_doc_type_check'
  ) THEN
    ALTER TABLE public.compliance_documents
      ADD CONSTRAINT compliance_documents_doc_type_check
      CHECK (doc_type IN
        ('POLICY', 'PROCEDURE', 'CONTRACT', 'CLOUD_ARCH_ORG',
         'SAD', 'SRS_SDS', 'TEST_REPORT', 'EVIDENCE_RECORD', 'UNCLASSIFIED'));
  END IF;
END $$;

COMMENT ON COLUMN public.compliance_documents.doc_type IS
  'Semantic document type (specs/003 F1 taxonomy). UNCLASSIFIED = legacy row awaiting triage. File format lives in file_format.';

COMMIT;
