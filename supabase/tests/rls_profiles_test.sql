-- pgTAP-only test (no basejump/supabase_test_helpers dependency — nothing in
-- this repo installs them, so helpers like rls_enabled() are unavailable).
-- Runs as the local `postgres` superuser, which bypasses EXECUTE grants and
-- RLS, so privilege checks use has_function_privilege() and the RLS behavior
-- tests switch to the `authenticated` role first.
BEGIN;
SELECT plan(5);

-- Test 1: Row Level Security is enabled on profiles
SELECT ok(
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass),
    'Row Level Security must be enabled on public.profiles'
);

-- Test 2: Exactly the expected RLS policies exist on profiles
-- (005_rls_policies.sql + 20260629210000_admin_profiles_rls.sql)
SELECT policies_are('public', 'profiles', ARRAY[
    'profiles_select_own',
    'profiles_select_admin',
    'profiles_update_own',
    'profiles_update_admin',
    'profiles_delete_admin'
]);

-- Test 3: auth_role execute is denied to anon/authenticated
-- (Root cause of the historical permission-denied error. throws_ok() can't be
-- used here: the test session is superuser, which bypasses ACL checks.)
-- auth_role() itself is live-schema drift: no migration creates it, and
-- 20260617115707 only revokes it conditionally. On a from-scratch database it
-- doesn't exist, which satisfies the assertion vacuously.
SELECT ok(
    CASE WHEN to_regprocedure('public.auth_role()') IS NULL THEN true
         ELSE NOT has_function_privilege('authenticated', 'public.auth_role()', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.auth_role()', 'EXECUTE')
    END,
    'Execute permission on auth_role should be revoked from anon/authenticated (or the function is absent)'
);

-- Setup for tests 4-5: create a user inside this (rolled-back) transaction.
-- The on_auth_user_created trigger (handle_new_user) creates the profile row.
-- Then simulate an authenticated session: `role` is a GUC, so set_config()
-- performs a transaction-local SET ROLE; auth.uid() reads request.jwt.claims.
INSERT INTO auth.users (id, email)
VALUES ('722fa9dc-7378-40bd-9ac9-f045ec57d906', 'rls-test@example.com');

DO $$ BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config(
        'request.jwt.claims',
        '{"sub": "722fa9dc-7378-40bd-9ac9-f045ec57d906", "role": "authenticated", "app_metadata": {"role": "ionic_user"}}',
        true
    );
END $$;

-- Test 4: an authenticated user can read their own profile through RLS
SELECT results_eq(
    $$ SELECT id FROM public.profiles WHERE id = '722fa9dc-7378-40bd-9ac9-f045ec57d906' $$,
    $$ SELECT '722fa9dc-7378-40bd-9ac9-f045ec57d906'::uuid $$,
    'Authenticated users must be able to select their own profile'
);

-- Test 5: get_user_role runs without RLS recursion or permission errors
SELECT lives_ok(
    $$ SELECT public.get_user_role() $$,
    'get_user_role should execute cleanly without RLS circular dependency'
);

SELECT * FROM finish();
ROLLBACK;
