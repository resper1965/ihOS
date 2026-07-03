DROP FUNCTION IF EXISTS public.match_documents_hybrid(text, extensions.vector, float, int, text, uuid, text[]);

CREATE OR REPLACE FUNCTION public.match_documents_hybrid(
    query_text text,
    query_embedding extensions.vector,
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 5,
    filter_framework text DEFAULT NULL,
    filter_version_id uuid DEFAULT NULL,
    filter_categories text[] DEFAULT NULL
)
RETURNS TABLE (
    id bigint,
    content text,
    content_en text,
    similarity float,
    document_id bigint,
    chunk_index int,
    section_title text,
    nist_families text[],
    iso_controls text[],
    scf_controls text[],
    doc_filename text,
    doc_title text,
    doc_category text,
    doc_type text,
    clarity_report jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
          AND (
              filter_framework IS NULL
              OR filter_framework = ANY(dc.nist_families)
              OR filter_framework = ANY(dc.iso_controls)
              OR filter_framework = ANY(dc.scf_controls)
          )
          AND (
              filter_version_id IS NULL
              OR cd.product_version_id IS NULL
              OR cd.product_version_id = filter_version_id
          )
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
            extensions.similarity(dc.content, query_text) AS text_score,
            ROW_NUMBER() OVER (ORDER BY extensions.similarity(dc.content, query_text) DESC) AS text_rank
        FROM public.document_chunks dc
        JOIN public.compliance_documents cd ON cd.id = dc.document_id
        WHERE extensions.similarity(dc.content, query_text) > 0.05
          AND (
              filter_framework IS NULL
              OR filter_framework = ANY(dc.nist_families)
              OR filter_framework = ANY(dc.iso_controls)
              OR filter_framework = ANY(dc.scf_controls)
          )
          AND (
              filter_version_id IS NULL
              OR cd.product_version_id IS NULL
              OR cd.product_version_id = filter_version_id
          )
          AND (
              filter_categories IS NULL
              OR cd.category::TEXT = ANY(filter_categories)
          )
        ORDER BY extensions.similarity(dc.content, query_text) DESC
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
        cd.doc_type,
        cd.clarity_report
    FROM rrf
    JOIN public.document_chunks dc ON dc.id = rrf.chunk_id
    JOIN public.compliance_documents cd ON cd.id = dc.document_id
    ORDER BY rrf.combined_score DESC;
END;
$$;
