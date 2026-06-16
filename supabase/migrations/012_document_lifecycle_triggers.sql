-- Migration 012: Document Lifecycle Triggers & Invalidation
-- ihOS — Intelligent Hardened Operating System

BEGIN;

  -- 1. Add needs_review column to evidence_evaluations
  ALTER TABLE public.evidence_evaluations
      ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;

  CREATE INDEX IF NOT EXISTS idx_evidence_eval_needs_review ON public.evidence_evaluations (needs_review);

  -- 2. Create trigger function to invalidate evaluations on document updates (superseded/expired)
  CREATE OR REPLACE FUNCTION public.handle_document_lifecycle_change()
  RETURNS TRIGGER AS $$
  BEGIN
      -- When status changes to superseded or expired, invalidate associated evaluations
      IF (OLD.status IS DISTINCT FROM NEW.status) AND (NEW.status IN ('superseded', 'expired')) THEN
          UPDATE public.evidence_evaluations
          SET needs_review = true,
              updated_at = now()
          WHERE chunk_id IN (
              SELECT dc.id 
              FROM public.document_chunks dc
              WHERE dc.document_id = NEW.id
          );
      END IF;
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  -- 3. Create the trigger
  DROP TRIGGER IF EXISTS trg_document_lifecycle_change ON public.compliance_documents;
  CREATE TRIGGER trg_document_lifecycle_change
      AFTER UPDATE ON public.compliance_documents
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_document_lifecycle_change();

COMMIT;
