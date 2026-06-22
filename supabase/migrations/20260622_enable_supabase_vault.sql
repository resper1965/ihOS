-- Migration: Enable vault extension and establish access wrappers
-- Target: Supabase Vault integration

-- 1. Enable pg_vault / vault extension if not enabled (Supabase uses the name "supabase_vault")
CREATE EXTENSION IF NOT EXISTS supabase_vault;



-- 2. Helper to safely upsert secrets in the vault
CREATE OR REPLACE FUNCTION public.set_vault_secret(secret_name text, secret_value text, secret_description text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  secret_id uuid;
BEGIN
  -- Check if secret exists
  SELECT id INTO secret_id FROM vault.secrets WHERE name = secret_name;
  
  IF secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(secret_id, secret_value, secret_name, secret_description);
  ELSE
    SELECT vault.create_secret(secret_value, secret_name, secret_description) INTO secret_id;
  END IF;

  
  RETURN secret_id;
END;
$$;

-- 3. Secure helper to fetch decrypted secrets
CREATE OR REPLACE FUNCTION public.get_vault_secret(secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  decrypted text;
  session_role text;
BEGIN
  -- Enforce security: restrict to service_role or superusers/postgres
  SELECT current_setting('role', true) INTO session_role;
  IF session_role = 'none' OR session_role IS NULL OR session_role = '' THEN
    session_role := current_user;
  END IF;

  IF session_role <> 'service_role' AND session_role <> 'postgres' AND session_role <> 'supabase_admin' THEN
    RAISE EXCEPTION 'Access Denied: Insufficient privileges to read vault secrets (Role: %)', session_role;
  END IF;

  SELECT decrypted_secret INTO decrypted
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;

  RETURN decrypted;
END;
$$;

-- 4. Set appropriate execution permissions
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_vault_secret(text) TO service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.set_vault_secret(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_vault_secret(text, text, text) TO service_role, postgres;
