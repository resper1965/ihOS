-- Migration 012: Fix enum + notification constraint
-- 1. Add B2B_DIRECT to document_category enum (exists in TypeScript but not DB)
ALTER TYPE public.document_category ADD VALUE IF NOT EXISTS 'B2B_DIRECT';

-- 2. Fix agent_notifications CHECK constraint to allow 'document_expired' type
-- First drop the existing check, then recreate with new values
ALTER TABLE public.agent_notifications DROP CONSTRAINT IF EXISTS agent_notifications_type_check;
ALTER TABLE public.agent_notifications ADD CONSTRAINT agent_notifications_type_check 
  CHECK (type IN ('poam_expiry', 'score_change', 'task_deadline', 'document_expired', 'assessment_complete'));
