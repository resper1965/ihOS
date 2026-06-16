-- Migration: Sprint 4 — add onboarding_completed and preferences to profiles
-- Run this in: Supabase Dashboard → SQL Editor
-- Project: uomdcazsriznqytvnsrv (ihOS)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;
