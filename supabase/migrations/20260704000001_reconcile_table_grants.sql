-- ============================================================================
-- Migration 20260704000001: reconcile table grants for the API roles.
--
-- Hosted deploys (`supabase db push`) connect as `postgres`, whose default
-- privileges grant the API roles access to every table it creates — so
-- production always had these grants. Local `supabase start` / `db reset`
-- applies migrations as `supabase_admin` instead, which those default
-- privileges do not cover, leaving anon/authenticated/service_role with NO
-- table ACL on a from-scratch database ("permission denied for table
-- profiles" before RLS is even consulted).
--
-- Grants mirror the Supabase platform defaults; RLS policies remain the
-- actual access guard. Idempotent, and a no-op on production.
-- Function EXECUTE grants are deliberately untouched (20260617115707 revokes
-- specific ones).
-- ============================================================================

BEGIN;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

COMMIT;
