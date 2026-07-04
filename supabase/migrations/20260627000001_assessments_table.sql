-- ============================================================================
-- Migration 20260627000001: assessments table (schema-drift reconciliation).
--
-- The `assessments` table exists in the live database but was created outside
-- the tracked migrations (drift) — no migration file creates it, yet
-- 20260629_add_goal_gap_linkage.sql adds a FK REFERENCES assessments(id) and
-- the application reads/writes it throughout (assessments/run, grc-trigger,
-- use-assessments). A from-scratch `supabase db reset` therefore fails with:
--   relation "assessments" does not exist.
--
-- Column set and types mirror the live schema (generated Supabase types).
-- Idempotent: no-op on databases where the table already exists.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.assessments (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                     TEXT        NOT NULL,
    status                   TEXT        NOT NULL DEFAULT 'completed',
    mode                     TEXT        NOT NULL DEFAULT 'quick',
    sales_channel            TEXT,
    product_version_id       UUID        REFERENCES public.product_versions(id) ON DELETE SET NULL,
    frameworks               JSONB,
    framework_scores         JSONB,
    implemented_control_ids  JSONB,
    total_controls           INT,
    compliant_controls       INT,
    missing_controls         INT,
    started_at               TIMESTAMPTZ,
    completed_at             TIMESTAMPTZ,
    created_by               UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at               TIMESTAMPTZ DEFAULT now(),
    updated_at               TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.assessments IS 'Assessment engine runs (quick/deep scans) with per-framework scores. Reconciled from live-schema drift so fresh databases match production.';

CREATE INDEX IF NOT EXISTS idx_assessments_run_version ON public.assessments (product_version_id);
CREATE INDEX IF NOT EXISTS idx_assessments_run_creator ON public.assessments (created_by);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_assessments_updated_at') THEN
    CREATE TRIGGER trg_assessments_updated_at
      BEFORE UPDATE ON public.assessments
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

-- Policies follow the compliance_assessments pattern: any authenticated user
-- can read; writers operate on their own rows (the app inserts with the user
-- client and created_by = auth.uid()).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assessments' AND policyname = 'assessments_select_authenticated') THEN
    CREATE POLICY assessments_select_authenticated ON public.assessments
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assessments' AND policyname = 'assessments_insert_own') THEN
    CREATE POLICY assessments_insert_own ON public.assessments
      FOR INSERT WITH CHECK (created_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assessments' AND policyname = 'assessments_update_own') THEN
    CREATE POLICY assessments_update_own ON public.assessments
      FOR UPDATE USING (created_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assessments' AND policyname = 'assessments_delete_own') THEN
    CREATE POLICY assessments_delete_own ON public.assessments
      FOR DELETE USING (created_by = auth.uid());
  END IF;
END $$;

COMMIT;
