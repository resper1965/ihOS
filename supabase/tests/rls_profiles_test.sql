BEGIN;
SELECT plan(5);

-- Test 1: Check if Row Level Security is enabled on profiles
SELECT rls_enabled('public', 'profiles');

-- Test 2: Check if the required RLS policies exist on profiles
SELECT policies_are('public', 'profiles', ARRAY[
    'profiles_select_own',
    'profiles_select_admin',
    'profiles_update_own'
]);

-- Test 3: Verify auth_role execute is denied to authenticated/public users
-- (Which was the root cause of the permission denied error)
SELECT throws_ok(
    $$ SELECT public.auth_role() $$,
    '42501', -- Permission denied code
    NULL,    -- Accept any error message
    'Execute permission on auth_role should be revoked from PUBLIC/authenticated'
);

-- Test 4: Simulate an authenticated user and check they can read their own profile
-- Set sub claim to matches user ID in our test profiles
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "722fa9dc-7378-40bd-9ac9-f045ec57d906", "app_metadata": {"role": "client_user"}}', true);

SELECT results_eq(
    $$ SELECT id FROM public.profiles WHERE id = '722fa9dc-7378-40bd-9ac9-f045ec57d906' $$,
    $$ SELECT '722fa9dc-7378-40bd-9ac9-f045ec57d906'::uuid $$,
    'Authenticated users must be able to select their own profile'
);

-- Test 5: Verify get_user_role runs successfully without RLS recursion or permission errors
SELECT lives_ok(
    $$ SELECT public.get_user_role() $$,
    'get_user_role should execute cleanly without RLS circular dependency'
);

SELECT * FROM finish();
ROLLBACK;
