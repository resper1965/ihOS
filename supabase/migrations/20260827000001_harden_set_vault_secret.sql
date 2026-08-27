-- ============================================================================
-- Migration 20260827000001: defend set_vault_secret in depth
--
-- 20260622000002 created both vault helpers as SECURITY DEFINER, revoked
-- EXECUTE from public, and granted it to service_role and postgres. But only
-- get_vault_secret also performs an INTERNAL role check; set_vault_secret
-- relies on the grant alone.
--
-- Both are equally unreachable from `authenticated` today. The asymmetry is
-- the problem: a future convenience `GRANT EXECUTE ... TO authenticated` would
-- leave the read protected by its own check and silently open the write. An API
-- route that stores a credential is being built on this function, so it gets
-- the same second line of defence its sibling already has.
--
-- Deliberately does NOT log or return the secret value — a SECURITY DEFINER
-- function that RAISEs with the value would put a credential into the Postgres
-- log. The return stays the secret's uuid.
--
-- Idempotent: CREATE OR REPLACE, and re-running the grants is a no-op.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.set_vault_secret(
  secret_name text,
  secret_value text,
  secret_description text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  secret_id uuid;
  session_role text;
BEGIN
  -- Same check get_vault_secret has performed since 20260622000002.
  SELECT current_setting('role', true) INTO session_role;
  IF session_role = 'none' OR session_role IS NULL OR session_role = '' THEN
    session_role := current_user;
  END IF;

  IF session_role <> 'service_role'
     AND session_role <> 'postgres'
     AND session_role <> 'supabase_admin' THEN
    -- Names the role, never the secret.
    RAISE EXCEPTION 'Access Denied: Insufficient privileges to write vault secrets (Role: %)', session_role;
  END IF;

  SELECT id INTO secret_id FROM vault.secrets WHERE name = secret_name;

  IF secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(secret_id, secret_value, secret_name, secret_description);
  ELSE
    SELECT vault.create_secret(secret_value, secret_name, secret_description) INTO secret_id;
  END IF;

  RETURN secret_id;
END;
$$;

-- Re-assert the grants; CREATE OR REPLACE preserves them, but stating them
-- keeps this migration self-contained if it is ever applied to a fresh database.
REVOKE EXECUTE ON FUNCTION public.set_vault_secret(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_vault_secret(text, text, text) TO service_role, postgres;

COMMIT;
