-- ============================================================================
-- Migration: Fix Supabase Security Linter Warnings
-- Resolves: extension_in_public, function_search_path_mutable, 
--           anon_security_definer_function_executable
-- ============================================================================

-- 1. Fix: extension_in_public
-- Move vector and pg_trgm to the extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, authenticated, anon, service_role;

ALTER EXTENSION vector SET SCHEMA extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- 2. Fix: anon_security_definer_function_executable & authenticated_security_definer_function_executable
-- Revoke EXECUTE from PostgREST roles for functions that should only be called internally or by triggers
REVOKE EXECUTE ON FUNCTION public.handle_document_lifecycle_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- For get_user_role and get_user_client_org, they are used by RLS so we can't revoke EXECUTE.
-- Instead, we change them to SECURITY INVOKER because they read from JWT or self-profile securely.
ALTER FUNCTION public.get_user_role() SECURITY INVOKER;
ALTER FUNCTION public.get_user_client_org() SECURITY INVOKER;

-- Safely revoke execute on rogue functions the user might have in production
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.auth_role() FROM PUBLIC, anon, authenticated;
  REVOKE EXECUTE ON FUNCTION public.auth_client_org() FROM PUBLIC, anon, authenticated;
EXCEPTION
  WHEN undefined_function THEN
    -- Ignore if they don't exist
    NULL;
END
$$;

-- 3. Fix: function_search_path_mutable
-- Ensure all functions have a strict search_path to prevent search path injection attacks
ALTER FUNCTION public.handle_document_lifecycle_change() SET search_path = public, extensions;
ALTER FUNCTION public.handle_new_user() SET search_path = public, extensions;
ALTER FUNCTION public.set_updated_at() SET search_path = public, extensions;
ALTER FUNCTION public.custom_access_token_hook(jsonb) SET search_path = public, extensions;
ALTER FUNCTION public.get_user_role() SET search_path = public, extensions;
ALTER FUNCTION public.get_user_client_org() SET search_path = public, extensions;

-- Safely alter rogue functions to fix the linter warning
DO $$
BEGIN
  ALTER FUNCTION public.auth_role() SET search_path = public, extensions;
  ALTER FUNCTION public.auth_client_org() SET search_path = public, extensions;
  
  -- Use function name (Postgres allows this if not overloaded)
  ALTER FUNCTION public.search_compliance_docs SET search_path = public, extensions;
  ALTER FUNCTION public.search_compliance_text SET search_path = public, extensions;
  ALTER FUNCTION public.sync_intelligence_snapshot_payloads SET search_path = public, extensions;
  ALTER FUNCTION public.sync_evidence_evaluation_details SET search_path = public, extensions;
EXCEPTION
  WHEN undefined_function OR invalid_function_definition OR ambiguous_function THEN
    -- Ignore if they don't exist or if ambiguous
    NULL;
END
$$;
