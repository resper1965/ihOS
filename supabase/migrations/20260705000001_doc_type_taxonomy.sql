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
--   UNCLASSIFIED    transitional value for legacy rows awaiting triage
--
-- Migration order matters (legacy rows hold format values, not NULLs):
--   1. preserve the format into file_format where it is missing;
--   2. reset non-taxonomy values to UNCLASSIFIED;
--   3. only then add the CHECK (admitting UNCLASSIFIED).
-- Idempotent: re-running is a no-op.
-- ============================================================================

BEGIN;

UPDATE public.compliance_documents
   SET file_format = doc_type
 WHERE file_format IS NULL
   AND doc_type IN ('pdf', 'docx', 'txt', 'md', 'csv', 'xlsx');

UPDATE public.compliance_documents
   SET doc_type = 'UNCLASSIFIED'
 WHERE doc_type NOT IN
   ('POLICY', 'PROCEDURE', 'CONTRACT', 'CLOUD_ARCH_ORG',
    'SAD', 'SRS_SDS', 'TEST_REPORT', 'UNCLASSIFIED');

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'compliance_documents_doc_type_check'
  ) THEN
    ALTER TABLE public.compliance_documents
      ADD CONSTRAINT compliance_documents_doc_type_check
      CHECK (doc_type IN
        ('POLICY', 'PROCEDURE', 'CONTRACT', 'CLOUD_ARCH_ORG',
         'SAD', 'SRS_SDS', 'TEST_REPORT', 'UNCLASSIFIED'));
  END IF;
END $$;

COMMENT ON COLUMN public.compliance_documents.doc_type IS
  'Semantic document type (specs/003 F1 taxonomy). UNCLASSIFIED = legacy row awaiting triage. File format lives in file_format.';

COMMIT;
