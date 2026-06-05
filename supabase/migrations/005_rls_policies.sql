-- ============================================================================
-- Migration 005: Row-Level Security (RLS) Policies
-- ihOS — Intelligent Hardened Operating System
--
-- Implements multi-tenant RBAC via PostgreSQL RLS:
--
-- ROLE HIERARCHY:
--   • admin        → Full access to everything
--   • ionic_user   → Full read access to compliance data, own chat data
--   • client_user  → ISMS_CORE docs + their B2B overlay, own chat data
--
-- SECURITY MODEL:
--   - All tables have RLS enabled (no bypass)
--   - Helper function get_user_role() avoids repeated profile lookups
--   - Document chunk visibility inherits from parent document via subquery
--   - Chat data (conversations/messages) strictly scoped to auth.uid()
--
-- Dependencies: 003_core_tables, 004_compliance_tables
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- Helper: cached role lookup for RLS policies
-- ──────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can read profiles table regardless of caller's RLS
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_user_role() IS
  'Returns the RBAC role for the currently authenticated user. Used by RLS policies.';

-- Helper: get client_org for tenant-scoped document filtering
CREATE OR REPLACE FUNCTION public.get_user_client_org()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT client_org FROM public.profiles WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_user_client_org() IS
  'Returns the client organization for the current user. Used for B2B document RLS.';

-- ══════════════════════════════════════════════════════════════════════════════
-- ENABLE RLS ON ALL TABLES
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scf_controls            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scf_framework_mappings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_assessments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poam_items              ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. PROFILES
-- ══════════════════════════════════════════════════════════════════════════════

-- Users can read their own profile
CREATE POLICY profiles_select_own ON public.profiles
    FOR SELECT
    USING (id = auth.uid());

-- Admins can read all profiles (user management)
CREATE POLICY profiles_select_admin ON public.profiles
    FOR SELECT
    USING (public.get_user_role() = 'admin');

-- Users can update their own profile (limited fields enforced by app layer)
CREATE POLICY profiles_update_own ON public.profiles
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. CONVERSATIONS — users manage own conversations
-- ══════════════════════════════════════════════════════════════════════════════

-- SELECT: Users see only their own conversations
CREATE POLICY conversations_select_own ON public.conversations
    FOR SELECT
    USING (user_id = auth.uid());

-- INSERT: Users can create conversations (must be their own user_id)
CREATE POLICY conversations_insert_own ON public.conversations
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- UPDATE: Users can update own conversations (title, etc.)
CREATE POLICY conversations_update_own ON public.conversations
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- DELETE: Users can delete own conversations (cascades to messages)
CREATE POLICY conversations_delete_own ON public.conversations
    FOR DELETE
    USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. MESSAGES — users manage messages in own conversations
-- ══════════════════════════════════════════════════════════════════════════════

-- SELECT: Users see messages only in their own conversations
CREATE POLICY messages_select_own ON public.messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
              AND c.user_id = auth.uid()
        )
    );

-- INSERT: Users can add messages only to their own conversations
CREATE POLICY messages_insert_own ON public.messages
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
              AND c.user_id = auth.uid()
        )
    );

-- UPDATE: Users can update messages in own conversations
CREATE POLICY messages_update_own ON public.messages
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
              AND c.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
              AND c.user_id = auth.uid()
        )
    );

-- DELETE: Users can delete messages in own conversations
CREATE POLICY messages_delete_own ON public.messages
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
              AND c.user_id = auth.uid()
        )
    );

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. COMPLIANCE_DOCUMENTS — role-based document visibility
-- ══════════════════════════════════════════════════════════════════════════════

-- Admins and ionic_users see ALL documents (ISMS_CORE + B2B + OPERATIONAL)
CREATE POLICY docs_select_internal ON public.compliance_documents
    FOR SELECT
    USING (public.get_user_role() IN ('admin', 'ionic_user'));

-- Client users see ISMS_CORE + their B2B overlay documents
-- B2B category format: 'B2B_' || client_org (e.g., 'B2B_GEHC')
CREATE POLICY docs_select_client ON public.compliance_documents
    FOR SELECT
    USING (
        public.get_user_role() = 'client_user'
        AND (
            category = 'ISMS_CORE'
            OR category::text = 'B2B_' || public.get_user_client_org()
        )
    );

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. DOCUMENT_CHUNKS — inherits visibility from parent document
-- ══════════════════════════════════════════════════════════════════════════════

-- Admins and ionic_users see all chunks
CREATE POLICY chunks_select_internal ON public.document_chunks
    FOR SELECT
    USING (public.get_user_role() IN ('admin', 'ionic_user'));

-- Client users see chunks only from visible documents
CREATE POLICY chunks_select_client ON public.document_chunks
    FOR SELECT
    USING (
        public.get_user_role() = 'client_user'
        AND EXISTS (
            SELECT 1 FROM public.compliance_documents d
            WHERE d.id = document_id
              AND (
                  d.category = 'ISMS_CORE'
                  OR d.category::text = 'B2B_' || public.get_user_client_org()
              )
        )
    );

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. SCF_CONTROLS — read-only reference data
-- ══════════════════════════════════════════════════════════════════════════════

-- All authenticated users can read SCF controls (reference data)
CREATE POLICY scf_controls_select_all ON public.scf_controls
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. SCF_FRAMEWORK_MAPPINGS — read-only reference data
-- ══════════════════════════════════════════════════════════════════════════════

-- All authenticated users can read framework mappings (reference data)
CREATE POLICY scf_mappings_select_all ON public.scf_framework_mappings
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. COMPLIANCE_ASSESSMENTS — admin/owner access
-- ══════════════════════════════════════════════════════════════════════════════

-- Admins see all assessments
CREATE POLICY assessments_select_admin ON public.compliance_assessments
    FOR SELECT
    USING (public.get_user_role() = 'admin');

-- Ionic users see all assessments (internal team access)
CREATE POLICY assessments_select_ionic ON public.compliance_assessments
    FOR SELECT
    USING (public.get_user_role() = 'ionic_user');

-- Users see their own assessments
CREATE POLICY assessments_select_own ON public.compliance_assessments
    FOR SELECT
    USING (user_id = auth.uid());

-- Users can create assessments (user_id must be their own)
CREATE POLICY assessments_insert_own ON public.compliance_assessments
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own assessments
CREATE POLICY assessments_update_own ON public.compliance_assessments
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Admins can update any assessment
CREATE POLICY assessments_update_admin ON public.compliance_assessments
    FOR UPDATE
    USING (public.get_user_role() = 'admin');

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. POAM_ITEMS — access through assessment ownership
-- ══════════════════════════════════════════════════════════════════════════════

-- Admins and ionic_users see all POAM items
CREATE POLICY poam_select_internal ON public.poam_items
    FOR SELECT
    USING (public.get_user_role() IN ('admin', 'ionic_user'));

-- Users see POAM items from their own assessments
CREATE POLICY poam_select_own ON public.poam_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.compliance_assessments a
            WHERE a.id = assessment_id
              AND a.user_id = auth.uid()
        )
    );

-- Users can create POAM items in their own assessments
CREATE POLICY poam_insert_own ON public.poam_items
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.compliance_assessments a
            WHERE a.id = assessment_id
              AND a.user_id = auth.uid()
        )
    );

-- Users can update POAM items in their own assessments
CREATE POLICY poam_update_own ON public.poam_items
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.compliance_assessments a
            WHERE a.id = assessment_id
              AND a.user_id = auth.uid()
        )
    );

-- Admins can update any POAM item
CREATE POLICY poam_update_admin ON public.poam_items
    FOR UPDATE
    USING (public.get_user_role() = 'admin');

-- Users can delete POAM items in their own assessments
CREATE POLICY poam_delete_own ON public.poam_items
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.compliance_assessments a
            WHERE a.id = assessment_id
              AND a.user_id = auth.uid()
        )
    );

-- Admins can delete any POAM item
CREATE POLICY poam_delete_admin ON public.poam_items
    FOR DELETE
    USING (public.get_user_role() = 'admin');
