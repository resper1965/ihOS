-- ============================================================================
-- Migration 009a: evidence_evaluations — add columns referenced by later
-- migrations and the application.
--
-- WHY: migration 010_security_hardening.sql creates an RLS policy on
-- evidence_evaluations that references `chunk_id` (WHERE dc.id = chunk_id), but
-- migration 008 creates the table WITHOUT that column and no earlier migration
-- adds it. As a result `supabase db reset` (and the RLS CI job) fails at
-- migration 010 with: column "chunk_id" does not exist (SQLSTATE 42703).
--
-- Production works only because its schema drifted (these columns were added
-- outside the tracked migrations). This migration reconciles the tracked
-- sequence so a database can be rebuilt from scratch. It runs BEFORE 010
-- (009a sorts between 009_ and 010_) and is idempotent (ADD COLUMN IF NOT
-- EXISTS), so it is a no-op where the columns already exist.
-- ============================================================================

BEGIN;

-- NOTE: tenant_id is intentionally NOT added here — it is owned by a later
-- migration (20260617000001_denormalize_tenants.sql) which adds it WITH a
-- foreign key to profiles. Adding it here (without the FK) would make that
-- later IF NOT EXISTS a no-op and silently drop the FK on a fresh database.
ALTER TABLE public.evidence_evaluations
    -- Referenced by the 010 RLS policy (join to document_chunks.id).
    ADD COLUMN IF NOT EXISTS chunk_id            BIGINT,
    -- Written by the assessment persistence layer (buildEvidenceBatch).
    ADD COLUMN IF NOT EXISTS scf_control_code    VARCHAR,
    ADD COLUMN IF NOT EXISTS control_requirement TEXT,
    ADD COLUMN IF NOT EXISTS evidence_text       TEXT,
    ADD COLUMN IF NOT EXISTS trace_id            VARCHAR;

CREATE INDEX IF NOT EXISTS idx_evidence_eval_chunk    ON public.evidence_evaluations (chunk_id);
CREATE INDEX IF NOT EXISTS idx_evidence_eval_trace    ON public.evidence_evaluations (trace_id);
CREATE INDEX IF NOT EXISTS idx_evidence_eval_scf_code ON public.evidence_evaluations (scf_control_code);

COMMIT;
