-- ============================================================================
-- Migration 003: Core Tables
-- ihOS — Intelligent Hardened Operating System
--
-- Creates the core application tables in dependency order:
--   1. profiles            — Extends auth.users with RBAC role + tenant org
--   2. conversations       — Chat conversation containers
--   3. messages            — Chat messages with tool_calls audit trail
--   4. compliance_documents — Ingested compliance document metadata
--   5. document_chunks     — Vectorized text chunks for RAG retrieval
--   6. scf_controls        — Secure Controls Framework control catalogue
--   7. scf_framework_mappings — Cross-framework control mappings
--
-- Dependencies: 001_extensions (uuid-ossp, vector), 002_enums
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. PROFILES — extends Supabase Auth
-- ──────────────────────────────────────────────────────────────────────────────
-- Auto-populated by the handle_new_user() trigger (see 006_functions.sql).
-- The id column is a FK to auth.users(id), NOT auto-generated.
CREATE TABLE public.profiles (
    id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role        public.user_role NOT NULL DEFAULT 'ionic_user',
    client_org  TEXT        NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'User profiles extending Supabase Auth with RBAC roles and tenant organization';
COMMENT ON COLUMN public.profiles.role IS 'RBAC role determining access scope via RLS policies';
COMMENT ON COLUMN public.profiles.client_org IS 'B2B client organization identifier (e.g., GEHC). NULL for admin/ionic users';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. CONVERSATIONS — chat containers
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.conversations (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       TEXT        DEFAULT 'New Compliance Chat',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.conversations IS 'Chat conversation containers, one per user session';

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. MESSAGES — chat messages with audit trail
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.messages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    role            VARCHAR     NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content         TEXT,
    tool_calls      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.messages IS 'Chat messages within conversations. tool_calls stores agent function call audit trail';
COMMENT ON COLUMN public.messages.role IS 'Message author: user, assistant, system, or tool';
COMMENT ON COLUMN public.messages.tool_calls IS 'JSONB array of tool invocations for audit/replay';

-- Index for efficient conversation message retrieval (ordered by time)
CREATE INDEX idx_messages_conversation_created
    ON public.messages (conversation_id, created_at);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. COMPLIANCE_DOCUMENTS — ingested document metadata
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.compliance_documents (
    id              BIGSERIAL   PRIMARY KEY,
    filename        TEXT        NOT NULL,
    filepath        TEXT        NOT NULL,
    doc_type        TEXT        NOT NULL,
    policy_number   TEXT,
    title           TEXT,
    language        TEXT        DEFAULT 'en',
    year            INT,
    category        public.document_category,
    file_format     TEXT,
    file_size_bytes BIGINT,
    total_chunks    INT         DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compliance_documents IS 'Compliance documents ingested by the ETL pipeline (187 docs currently)';
COMMENT ON COLUMN public.compliance_documents.category IS 'RLS filter: ISMS_CORE (all users), B2B_GEHC (tenant-scoped), OPERATIONAL (internal)';

-- B-tree indexes for common query patterns
CREATE INDEX idx_docs_category ON public.compliance_documents (category);
CREATE INDEX idx_docs_type     ON public.compliance_documents (doc_type);
CREATE INDEX idx_docs_policy   ON public.compliance_documents (policy_number);

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. DOCUMENT_CHUNKS — vectorized text chunks for RAG
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.document_chunks (
    id            BIGSERIAL       PRIMARY KEY,
    document_id   BIGINT          REFERENCES public.compliance_documents(id) ON DELETE CASCADE,
    chunk_index   INT             NOT NULL,
    content       TEXT            NOT NULL,
    char_count    INT,
    section_title TEXT,
    nist_families TEXT[],
    iso_controls  TEXT[],
    content_en    TEXT,
    embedding     VECTOR(1536),
    scf_controls  TEXT[],
    created_at    TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.document_chunks IS 'Vectorized text chunks for RAG retrieval (6,410 chunks, 100% embedded)';
COMMENT ON COLUMN public.document_chunks.embedding IS '1536-dim embedding via text-embedding-3-small, indexed with HNSW';
COMMENT ON COLUMN public.document_chunks.content_en IS 'English translation when original content is in Portuguese';
COMMENT ON COLUMN public.document_chunks.scf_controls IS 'SCF control tags for cross-framework mapping (pending sync)';

-- B-tree index for document-to-chunk lookups
CREATE INDEX idx_chunks_doc ON public.document_chunks (document_id);

-- GIN indexes for array containment queries on control tags
CREATE INDEX idx_chunks_nist ON public.document_chunks USING GIN (nist_families);
CREATE INDEX idx_chunks_iso  ON public.document_chunks USING GIN (iso_controls);
CREATE INDEX idx_chunks_scf  ON public.document_chunks USING GIN (scf_controls);

-- HNSW index for fast approximate nearest-neighbor vector search
-- Parameters: m=16 (connections per node), ef_construction=64 (build quality)
-- Operator: vector_cosine_ops for cosine similarity (1 - cosine_distance)
CREATE INDEX idx_chunks_embedding_hnsw
    ON public.document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. SCF_CONTROLS — Secure Controls Framework catalogue
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.scf_controls (
    control_code VARCHAR     PRIMARY KEY,
    domain_code  VARCHAR     NOT NULL,
    control_name TEXT        NOT NULL,
    description  TEXT,
    embedding    VECTOR(1536)
);

COMMENT ON TABLE public.scf_controls IS 'Secure Controls Framework (SCF) control catalogue — 1,468 controls across 33 domains';
COMMENT ON COLUMN public.scf_controls.embedding IS '1536-dim embedding for semantic auto-tagging of document chunks';

-- HNSW index for SCF control similarity search
CREATE INDEX idx_scf_controls_embedding_hnsw
    ON public.scf_controls
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. SCF_FRAMEWORK_MAPPINGS — cross-framework control mappings
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.scf_framework_mappings (
    id                BIGSERIAL   PRIMARY KEY,
    framework_code    VARCHAR     NOT NULL,
    target_control_id VARCHAR     NOT NULL,
    scf_control_code  VARCHAR     REFERENCES public.scf_controls(control_code),
    synced_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.scf_framework_mappings IS 'Maps regulatory framework controls to SCF controls for cross-framework compliance';

-- Unique constraint to prevent duplicate mappings
ALTER TABLE public.scf_framework_mappings
    ADD CONSTRAINT uq_scf_mapping
    UNIQUE (framework_code, target_control_id, scf_control_code);

-- Indexes for common lookup patterns
CREATE INDEX idx_scf_mappings_framework  ON public.scf_framework_mappings (framework_code);
CREATE INDEX idx_scf_mappings_scf_code   ON public.scf_framework_mappings (scf_control_code);
