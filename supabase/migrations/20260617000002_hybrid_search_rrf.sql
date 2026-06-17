-- ============================================================================
-- Migration: Hybrid Search with Reciprocal Rank Fusion (RRF)
-- 
-- 1. Enable pg_trgm extension for lexical search
-- 2. Create GIN index for faster text search
-- 3. Create match_documents_hybrid RPC combining vector and lexical search
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create an index for pg_trgm on document_chunks.content for faster text search
CREATE INDEX IF NOT EXISTS document_chunks_content_trgm_idx ON public.document_chunks USING GIN (content gin_trgm_ops);

-- ──────────────────────────────────────────────────────────────────────────────
-- match_documents_hybrid() — Hybrid RAG retrieval function (RRF)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_documents_hybrid(
    query_text          TEXT,
    query_embedding     VECTOR(1536),
    match_threshold     FLOAT       DEFAULT 0.5,
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
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH vector_search AS (
        SELECT 
            dc.id,
            (1 - (dc.embedding <=> query_embedding))::FLOAT AS vector_score,
            ROW_NUMBER() OVER (ORDER BY dc.embedding <=> query_embedding) AS vector_rank
        FROM public.document_chunks dc
        WHERE dc.embedding IS NOT NULL
          AND (1 - (dc.embedding <=> query_embedding)) >= match_threshold
          AND (
              filter_framework IS NULL
              OR filter_framework = ANY(dc.nist_families)
              OR filter_framework = ANY(dc.iso_controls)
              OR filter_framework = ANY(dc.scf_controls)
          )
        ORDER BY dc.embedding <=> query_embedding
        LIMIT match_count * 2
    ),
    text_search AS (
        SELECT 
            dc.id,
            similarity(dc.content, query_text) AS text_score,
            ROW_NUMBER() OVER (ORDER BY similarity(dc.content, query_text) DESC) AS text_rank
        FROM public.document_chunks dc
        WHERE similarity(dc.content, query_text) > 0.05
          AND (
              filter_framework IS NULL
              OR filter_framework = ANY(dc.nist_families)
              OR filter_framework = ANY(dc.iso_controls)
              OR filter_framework = ANY(dc.scf_controls)
          )
        ORDER BY similarity(dc.content, query_text) DESC
        LIMIT match_count * 2
    ),
    rrf AS (
        SELECT
            COALESCE(v.id, t.id) AS chunk_id,
            (
                COALESCE(1.0 / (v.vector_rank + 60), 0.0) +
                COALESCE(1.0 / (t.text_rank + 60), 0.0)
            ) AS combined_score
        FROM vector_search v
        FULL OUTER JOIN text_search t ON v.id = t.id
        ORDER BY combined_score DESC
        LIMIT match_count
    )
    SELECT
        dc.id,
        dc.content,
        dc.content_en,
        rrf.combined_score::FLOAT AS similarity,
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
    FROM rrf
    JOIN public.document_chunks dc ON dc.id = rrf.chunk_id
    JOIN public.compliance_documents cd ON cd.id = dc.document_id
    ORDER BY rrf.combined_score DESC;
END;
$$;
