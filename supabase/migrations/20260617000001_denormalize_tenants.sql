-- ============================================================================
-- Migration: Denormalize tenants for performance and simplify RLS policies
-- 
-- 1. Add tenant_id to evidence_evaluations, document_chunks, poam_items
-- 2. Add indexes
-- 3. Replace complex JOIN-based RLS policies with direct JWT claims
-- ============================================================================

-- 1. Add columns
ALTER TABLE public.evidence_evaluations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.document_chunks ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.poam_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Add indexes
CREATE INDEX IF NOT EXISTS idx_evidence_eval_tenant ON public.evidence_evaluations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant ON public.document_chunks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_poam_items_tenant ON public.poam_items (tenant_id);

-- Optional: Cluster tables to colocate data by tenant (improves cache hits for multi-tenant analytical queries)
-- Note: CLUSTER is a one-time operation. Needs to be re-run periodically by cron if desired, 
-- but setting it up provides an immediate physical data organization baseline.
-- CLUSTER public.evidence_evaluations USING idx_evidence_eval_tenant;
-- CLUSTER public.document_chunks USING idx_document_chunks_tenant;
-- CLUSTER public.poam_items USING idx_poam_items_tenant;

-- 3. Replace RLS Policies

-- EVIDENCE_EVALUATIONS
DROP POLICY IF EXISTS evidence_eval_select_authenticated ON public.evidence_evaluations;
DROP POLICY IF EXISTS evidence_eval_select_tenant ON public.evidence_evaluations;
CREATE POLICY evidence_eval_select_tenant ON public.evidence_evaluations
    FOR SELECT
    USING (
        public.get_user_role() IN ('admin', 'ionic_user') OR 
        tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    );

-- DOCUMENT_CHUNKS
DROP POLICY IF EXISTS chunks_select_client ON public.document_chunks;
CREATE POLICY chunks_select_client ON public.document_chunks
    FOR SELECT
    USING (
        public.get_user_role() = 'client_user'
        AND (
            tenant_id IS NULL OR -- keep fallback for global ISMS_CORE documents if tenant_id is omitted
            tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
        )
    );

-- POAM_ITEMS
DROP POLICY IF EXISTS poam_select_own ON public.poam_items;
CREATE POLICY poam_select_own ON public.poam_items
    FOR SELECT
    USING (
        public.get_user_role() IN ('admin', 'ionic_user') OR 
        tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    );

DROP POLICY IF EXISTS poam_insert_own ON public.poam_items;
CREATE POLICY poam_insert_own ON public.poam_items
    FOR INSERT
    WITH CHECK (
        public.get_user_role() IN ('admin', 'ionic_user') OR 
        tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    );

DROP POLICY IF EXISTS poam_update_own ON public.poam_items;
CREATE POLICY poam_update_own ON public.poam_items
    FOR UPDATE
    USING (
        public.get_user_role() IN ('admin', 'ionic_user') OR 
        tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    )
    WITH CHECK (
        public.get_user_role() IN ('admin', 'ionic_user') OR 
        tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    );
