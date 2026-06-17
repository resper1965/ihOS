-- ============================================================================
-- Migration: Auth Hooks, Insecure Default Fix and RLS Overhead Elimination
-- 
-- 1. Alters handle_new_user() to use 'client_user' instead of 'ionic_user'
-- 2. Creates Postgres-based Custom Auth Hook for JWT generation
-- 3. Optimizes RLS helper functions to prioritize JWT claims over DB lookups
-- ============================================================================

-- 1. Fix Insecure Default Role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, role, created_at)
    VALUES (
        NEW.id,
        'client_user', -- Changed from 'ionic_user' to least-privilege default
        now()
    );
    RETURN NEW;
END;
$$;

-- 2. Create PostgreSQL Auth Hook for Custom Claims
-- This injects role, tenant_id and client_org into the JWT at signing time
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
  DECLARE
    claims jsonb;
    user_role public.user_role;
    user_tenant_id uuid;
    user_client_org text;
  BEGIN
    -- Fetch the user profile
    SELECT role, id, client_org INTO user_role, user_tenant_id, user_client_org
    FROM public.profiles
    WHERE id = (event->'user'->>'id')::uuid;

    claims := event->'claims';

    IF user_role IS NOT NULL THEN
      -- Inject custom claims into app_metadata
      claims := jsonb_set(claims, '{app_metadata, role}', to_jsonb(user_role));
      claims := jsonb_set(claims, '{app_metadata, tenant_id}', to_jsonb(user_tenant_id));
      claims := jsonb_set(claims, '{app_metadata, client_org}', to_jsonb(user_client_org));
    ELSE
      claims := jsonb_set(claims, '{app_metadata, role}', '"client_user"');
    END IF;

    RETURN claims;
  END;
$$;

-- Secure the hook
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- 3. Optimize RLS Helper Functions (Eliminate N+1)
-- Read from JWT first, fallback to DB query if JWT is old
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CAST(COALESCE(
        auth.jwt() -> 'app_metadata' ->> 'role',
        (SELECT role::text FROM public.profiles WHERE id = auth.uid())
    ) AS text);
$$;

CREATE OR REPLACE FUNCTION public.get_user_client_org()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        auth.jwt() -> 'app_metadata' ->> 'client_org',
        (SELECT client_org FROM public.profiles WHERE id = auth.uid())
    );
$$;
