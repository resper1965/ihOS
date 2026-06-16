-- ============================================================================
-- Migration 010: Security Hardening (RLS & Tenancy)
-- ihOS — Intelligent Hardened Operating System
--
-- Restricts RLS policies on tables that were previously too permissive.
-- Adds user_id mapping to intelligence_snapshots to support tenant separation.
-- ============================================================================

BEGIN;

  -- 1. Add user_id column to intelligence_snapshots if not exists
  ALTER TABLE public.intelligence_snapshots
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

  -- 2. Drop existing permissive policies on intelligence_snapshots
  DROP POLICY IF EXISTS intel_snapshot_select_authenticated ON public.intelligence_snapshots;
  DROP POLICY IF EXISTS intel_snapshot_admin ON public.intelligence_snapshots;

  -- 3. Re-create secure policies for intelligence_snapshots
  CREATE POLICY intel_snapshot_select_authenticated ON public.intelligence_snapshots
    FOR SELECT
    USING (
      public.get_user_role() IN ('admin', 'ionic_user')
      OR user_id = auth.uid()
      OR user_id IS NULL
    );

  CREATE POLICY intel_snapshot_admin ON public.intelligence_snapshots
    FOR ALL
    USING (public.get_user_role() = 'admin');

  -- 4. Drop existing permissive policies on evidence_evaluations
  DROP POLICY IF EXISTS evidence_eval_select_authenticated ON public.evidence_evaluations;
  DROP POLICY IF EXISTS evidence_eval_admin ON public.evidence_evaluations;

  -- 5. Re-create secure policies for evidence_evaluations
  -- Respects document_chunks visibility (which is role and B2B tenant-scoped)
  CREATE POLICY evidence_eval_select_authenticated ON public.evidence_evaluations
    FOR SELECT
    USING (
      public.get_user_role() IN ('admin', 'ionic_user')
      OR EXISTS (
        SELECT 1 FROM public.document_chunks dc
        WHERE dc.id = chunk_id
      )
    );

  CREATE POLICY evidence_eval_admin ON public.evidence_evaluations
    FOR ALL
    USING (public.get_user_role() = 'admin');

COMMIT;
