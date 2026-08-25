-- ============================================================================
-- Migration 20260825000001: vendors (supply-chain / third-party risk)
--
-- Backfills a migration for a table that already exists on the linked
-- project but was never tracked in this repo (created directly against the
-- live database at some point during the SCRMS vendor UI's development).
-- Schema below matches the live table exactly, as introspected via
-- `supabase db query --linked` against information_schema/pg_catalog on
-- 2026-08-25 — this is not a new design, it reproduces what's already
-- running in production so fresh environments (CI, staging, other
-- developers) can create the same table.
--
-- Idempotent: re-running is a no-op (IF NOT EXISTS / IF-NOT-EXISTS-guarded
-- policies), safe to apply even where the table already exists.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.vendors (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id),
    name        TEXT        NOT NULL,
    description TEXT        NULL,
    risk_level  TEXT        NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    status      TEXT        NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.vendors IS
  'Third-party / supply-chain vendors a user tracks for SCRMS risk assessment. Per-user owned (see RLS below) — not an org-global catalog.';

-- ── vendor_id on the tables that reference it ────────────────────────────────

ALTER TABLE public.assessments
    ADD COLUMN IF NOT EXISTS vendor_id UUID NULL REFERENCES public.vendors(id) ON DELETE CASCADE;

ALTER TABLE public.compliance_documents
    ADD COLUMN IF NOT EXISTS vendor_id UUID NULL REFERENCES public.vendors(id) ON DELETE SET NULL;

ALTER TABLE public.msr_baselines
    ADD COLUMN IF NOT EXISTS vendor_id UUID NULL REFERENCES public.vendors(id) ON DELETE CASCADE;

-- ── RLS: vendors are owned by the user who created them ──────────────────────

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vendors' AND policyname = 'Users can select their own vendors') THEN
    CREATE POLICY "Users can select their own vendors" ON public.vendors
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vendors' AND policyname = 'Users can insert their own vendors') THEN
    CREATE POLICY "Users can insert their own vendors" ON public.vendors
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vendors' AND policyname = 'Users can update their own vendors') THEN
    CREATE POLICY "Users can update their own vendors" ON public.vendors
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vendors' AND policyname = 'Users can delete their own vendors') THEN
    CREATE POLICY "Users can delete their own vendors" ON public.vendors
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

COMMIT;
