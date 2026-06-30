-- ============================================================================
-- Migration: Admin RLS for Profiles
-- ============================================================================

-- Add policy to allow admins to update any profile (e.g., to approve/reject users)
CREATE POLICY profiles_update_admin ON public.profiles
    FOR UPDATE
    USING (public.get_user_role() = 'admin');

-- Allow admins to delete profiles if necessary
CREATE POLICY profiles_delete_admin ON public.profiles
    FOR DELETE
    USING (public.get_user_role() = 'admin');
