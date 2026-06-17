-- ============================================================================
-- Migration: User Approval Flow & Admin Setup
-- ============================================================================

-- 1. Create user_status enum
CREATE TYPE public.user_status AS ENUM ('pending', 'approved', 'rejected');

-- 2. Add status column to profiles
ALTER TABLE public.profiles
ADD COLUMN status public.user_status NOT NULL DEFAULT 'pending';

COMMENT ON COLUMN public.profiles.status IS 'Approval status of the user: pending, approved, or rejected';

-- 3. Retroactively approve existing users to prevent locking out currently active staff
UPDATE public.profiles SET status = 'approved';

-- 4. Promote resper@ionic.health to admin
-- Using DO block in case the user doesn't exist yet, to avoid errors
DO $$
BEGIN
    UPDATE public.profiles
    SET role = 'admin', status = 'approved'
    WHERE id = (SELECT id FROM auth.users WHERE email = 'resper@ionic.health');
END $$;

-- 5. Modify handle_new_user trigger to handle the approval flow and admin auto-promotion
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role public.user_role;
    v_status public.user_status;
BEGIN
    -- Master admin auto-promotion
    IF NEW.email = 'resper@ionic.health' THEN
        v_role := 'admin';
        v_status := 'approved';
    ELSE
        v_role := 'ionic_user';
        v_status := 'pending';
    END IF;

    INSERT INTO public.profiles (id, role, status, created_at)
    VALUES (
        NEW.id,
        v_role,
        v_status,
        now()
    );
    RETURN NEW;
END;
$$;
