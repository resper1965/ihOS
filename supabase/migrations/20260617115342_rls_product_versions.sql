-- Enable RLS for product_versions to fix "RLS Disabled in Public" vulnerability
ALTER TABLE public.product_versions ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users (admins, ionic_user, and clients) to view product versions
CREATE POLICY product_versions_select_all ON public.product_versions
    FOR SELECT TO authenticated
    USING (true);

-- Allow only 'admin' and 'ionic_user' to manage (insert, update, delete) product versions
CREATE POLICY product_versions_manage_admin ON public.product_versions
    FOR ALL TO authenticated
    USING (public.get_user_role()::text IN ('admin', 'ionic_user'))
    WITH CHECK (public.get_user_role()::text IN ('admin', 'ionic_user'));
