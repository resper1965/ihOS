-- ============================================================================
-- Migration 006: Functions & Triggers
-- ihOS — Intelligent Hardened Operating System
--
-- Core database functions:
--   1. match_documents()   — pgvector cosine similarity search for RAG
--   2. handle_new_user()   — Auto-creates profile on auth.users INSERT
--
-- Dependencies: 003_core_tables (document_chunks, profiles), 005_rls_policies
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. match_documents() — pgvector RAG retrieval function
-- ──────────────────────────────────────────────────────────────────────────────
-- Performs cosine similarity search against document_chunks.embedding.
-- Returns top-K most similar chunks with metadata for the AI agent.
--
-- Usage (from Edge Function / API):
--   SELECT * FROM match_documents(
--     query_embedding := <float[]>,
--     match_threshold := 0.7,
--     match_count     := 10,
--     filter_framework := NULL  -- optional: filter by SCF/NIST/ISO tags
--   );
--
-- NOTE: This function runs through RLS — client_users will only see
-- chunks from documents they have access to (ISMS_CORE + their B2B overlay).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_documents(
    query_embedding     VECTOR(1536),
    match_threshold     FLOAT       DEFAULT 0.7,
    match_count         INT         DEFAULT 10,
    filter_framework    TEXT        DEFAULT NULL
)
RETURNS TABLE (
    id              BIGINT,
    content         TEXT,
    content_en      TEXT,
    similarity      FLOAT,
    document_id     BIGINT,
    chunk_index     INT,
    section_title   TEXT,
    nist_families   TEXT[],
    iso_controls    TEXT[],
    scf_controls    TEXT[],
    doc_filename    TEXT,
    doc_title       TEXT,
    doc_category    TEXT,
    doc_type        TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER  -- Respects RLS policies of the calling user
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.content,
        dc.content_en,
        (1 - (dc.embedding <=> query_embedding))::FLOAT AS similarity,
        dc.document_id,
        dc.chunk_index,
        dc.section_title,
        dc.nist_families,
        dc.iso_controls,
        dc.scf_controls,
        cd.filename  AS doc_filename,
        cd.title     AS doc_title,
        cd.category::TEXT AS doc_category,
        cd.doc_type
    FROM public.document_chunks dc
    JOIN public.compliance_documents cd ON cd.id = dc.document_id
    WHERE
        -- Embedding must exist
        dc.embedding IS NOT NULL
        -- Cosine similarity threshold
        AND (1 - (dc.embedding <=> query_embedding)) >= match_threshold
        -- Optional framework filter: matches any of the control tag arrays
        AND (
            filter_framework IS NULL
            OR filter_framework = ANY(dc.nist_families)
            OR filter_framework = ANY(dc.iso_controls)
            OR filter_framework = ANY(dc.scf_controls)
        )
    ORDER BY dc.embedding <=> query_embedding  -- ASC = most similar first
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.match_documents IS
  'pgvector cosine similarity search for RAG. Returns top-K document chunks with metadata. Respects RLS.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. handle_new_user() — auto-create profile on signup
-- ──────────────────────────────────────────────────────────────────────────────
-- Trigger function that fires AFTER INSERT on auth.users.
-- Creates a corresponding row in public.profiles with default role.
--
-- SECURITY DEFINER: Required because the trigger fires in the auth schema
-- context, which doesn't have direct INSERT access to public.profiles.
--
-- The default role is 'ionic_user' (internal staff). Admins must manually
-- promote users or set client_user + client_org for B2B tenants.
-- ──────────────────────────────────────────────────────────────────────────────
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
        'ionic_user',
        now()
    );
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Trigger function: auto-creates a profiles row with default role when a new user signs up via Supabase Auth';

-- Create the trigger on auth.users
-- DROP first to make migration idempotent
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. match_scf_controls() — SCF control similarity search
-- ──────────────────────────────────────────────────────────────────────────────
-- Used by the SCF auto-tagging pipeline to find semantically similar
-- SCF controls for a given document chunk embedding.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_scf_controls(
    query_embedding     VECTOR(1536),
    match_threshold     FLOAT       DEFAULT 0.75,
    match_count         INT         DEFAULT 5
)
RETURNS TABLE (
    control_code    VARCHAR,
    domain_code     VARCHAR,
    control_name    TEXT,
    description     TEXT,
    similarity      FLOAT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sc.control_code,
        sc.domain_code,
        sc.control_name,
        sc.description,
        (1 - (sc.embedding <=> query_embedding))::FLOAT AS similarity
    FROM public.scf_controls sc
    WHERE
        sc.embedding IS NOT NULL
        AND (1 - (sc.embedding <=> query_embedding)) >= match_threshold
    ORDER BY sc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION public.match_scf_controls IS
  'pgvector cosine similarity search for SCF controls. Used by auto-tagging pipeline.';
