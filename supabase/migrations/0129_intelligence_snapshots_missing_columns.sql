-- ============================================================================
-- Migration 0129: intelligence_snapshots — add columns referenced by 013.
--
-- Same class of drift as 0095: migration 013_seed_real_scorecard.sql INSERTs
-- input_payload/result_payload/score, but 008 creates intelligence_snapshots
-- without them (they were added to production outside the tracked migrations —
-- confirmed against the generated Supabase types: input_payload Json,
-- result_payload Json, score numeric null, user_id uuid null). Without this, a
-- from-scratch `supabase db reset` fails at 013 with:
--   column "input_payload" of relation "intelligence_snapshots" does not exist.
--
-- Runs after 0123_ and before 013_ (filename order); idempotent, no-op where
-- the columns already exist.
-- ============================================================================

BEGIN;

ALTER TABLE public.intelligence_snapshots
    ADD COLUMN IF NOT EXISTS input_payload  JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS score          NUMERIC,
    ADD COLUMN IF NOT EXISTS user_id        UUID;

COMMIT;
