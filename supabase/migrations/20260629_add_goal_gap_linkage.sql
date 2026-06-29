-- T033: Link assessment gaps to remediation goals
-- Adds source_assessment_id and source_control_code to agent_goals
-- for tracking which gap prompted the goal creation.
--
-- Apply manually: psql -f supabase/migrations/20260629_add_goal_gap_linkage.sql

ALTER TABLE agent_goals
  ADD COLUMN IF NOT EXISTS source_assessment_id UUID REFERENCES assessments(id),
  ADD COLUMN IF NOT EXISTS source_control_code TEXT;

CREATE INDEX IF NOT EXISTS idx_goals_source_assessment
  ON agent_goals(source_assessment_id) WHERE source_assessment_id IS NOT NULL;
