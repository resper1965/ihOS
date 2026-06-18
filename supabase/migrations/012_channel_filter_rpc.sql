-- ============================================================================
-- Migration 012: Channel-Aware RAG Filtering
--
-- Adds `filter_categories text[]` parameter to `match_documents_hybrid` so
-- the RAG search can scope results to the categories allowed by the active
-- B2B sales channel (ISMS_CORE, OPERATIONAL, B2B_GEHC, B2B_DIRECT).
--
-- The existing function only had filter_framework + filter_version_id.
-- We DROP the old signature and recreate with the extra parameter.
-- ============================================================================

-- Drop existing overloads so the new signature takes effect cleanly
DROP FUNCTION IF EXISTS public.match_documents_hybrid(TEXT, VECTOR(1536), FLOAT, INT, TEXT);
DROP FUNCTION IF EXISTS public.match_documents_hybrid(TEXT, VECTOR(1536), FLOAT, INT, TEXT, UUID);

-- ──────────────────────────────────────────────────────────────────────────────
-- match_documents_hybrid() — Hybrid RAG retrieval with RRF + category filter
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_documents_hybrid(
    query_text          TEXT,
    query_embedding     VECTOR(1536),
    match_threshold     FLOAT       DEFAULT 0.5,
    match_count         INT         DEFAULT 10,
    filter_framework    TEXT        DEFAULT NULL,
    filter_version_id   UUID        DEFAULT NULL,
    filter_categories   TEXT[]      DEFAULT NULL
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
        JOIN public.compliance_documents cd ON cd.id = dc.document_id
        WHERE dc.embedding IS NOT NULL
          AND (1 - (dc.embedding <=> query_embedding)) >= match_threshold
          -- Framework filter (nist/iso/scf control families)
          AND (
              filter_framework IS NULL
              OR filter_framework = ANY(dc.nist_families)
              OR filter_framework = ANY(dc.iso_controls)
              OR filter_framework = ANY(dc.scf_controls)
          )
          -- Version scoping
          AND (
              filter_version_id IS NULL
              OR cd.product_version_id IS NULL
              OR cd.product_version_id = filter_version_id
          )
          -- Category / channel filter
          AND (
              filter_categories IS NULL
              OR cd.category::TEXT = ANY(filter_categories)
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
        JOIN public.compliance_documents cd ON cd.id = dc.document_id
        WHERE similarity(dc.content, query_text) > 0.05
          -- Framework filter
          AND (
              filter_framework IS NULL
              OR filter_framework = ANY(dc.nist_families)
              OR filter_framework = ANY(dc.iso_controls)
              OR filter_framework = ANY(dc.scf_controls)
          )
          -- Version scoping
          AND (
              filter_version_id IS NULL
              OR cd.product_version_id IS NULL
              OR cd.product_version_id = filter_version_id
          )
          -- Category / channel filter
          AND (
              filter_categories IS NULL
              OR cd.category::TEXT = ANY(filter_categories)
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

COMMENT ON FUNCTION public.match_documents_hybrid IS
  'Hybrid RAG retrieval (vector + trigram RRF). Filters by framework controls, product version, and document category/channel.';
