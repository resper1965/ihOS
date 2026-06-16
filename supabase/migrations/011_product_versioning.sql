-- ============================================================================
-- Migration 011: Product Versioning & Document Lifecycle
-- ihOS — Intelligent Hardened Operating System
--
-- Introduces:
--   1. product_versions table — Catalog of nCommand Lite versions
--   2. Updates compliance_assessments & compliance_documents for version scope
--   3. Adds versioning, status, and expiration columns to compliance_documents
--   4. Updates match_documents() RPC to support version-isolation & published status
-- ============================================================================

BEGIN;

  -- 1. Create product_versions table
  CREATE TABLE public.product_versions (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      product_name    VARCHAR     NOT NULL DEFAULT 'nCommand Lite',
      version_code    VARCHAR     NOT NULL,
      status          VARCHAR     NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'supported')),
      technical_specs JSONB       NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (product_name, version_code)
  );

  COMMENT ON TABLE public.product_versions IS 'Versions and technical configurations of Ionic Health products (e.g., nCommand Lite)';

  -- Apply set_updated_at trigger
  CREATE TRIGGER trg_product_versions_updated_at
      BEFORE UPDATE ON public.product_versions
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();

  -- Seed initial versions of nCommand Lite
  INSERT INTO public.product_versions (product_name, version_code, status, technical_specs)
  VALUES 
    ('nCommand Lite', 'v2.2.x', 'supported', '{"architecture": "on-premise", "database": "PostgreSQL 14", "auth": "local password"}'),
    ('nCommand Lite', 'v2.3.x', 'active', '{"architecture": "hybrid cloud", "database": "PostgreSQL 16", "auth": "OAuth2 + MFA"}')
  ON CONFLICT (product_name, version_code) DO NOTHING;

  -- 2. Add product_version_id to compliance_assessments
  ALTER TABLE public.compliance_assessments
      ADD COLUMN IF NOT EXISTS product_version_id UUID REFERENCES public.product_versions(id) ON DELETE SET NULL;

  CREATE INDEX IF NOT EXISTS idx_assessments_version ON public.compliance_assessments (product_version_id);

  -- 3. Add versioning, status, and expiration columns to compliance_documents
  ALTER TABLE public.compliance_documents
      ADD COLUMN IF NOT EXISTS product_version_id UUID REFERENCES public.product_versions(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS version VARCHAR NOT NULL DEFAULT '1.0',
      ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'superseded', 'expired')),
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

  CREATE INDEX IF NOT EXISTS idx_docs_version ON public.compliance_documents (product_version_id);
  CREATE INDEX IF NOT EXISTS idx_docs_status ON public.compliance_documents (status);

  -- 4. Re-create match_documents RPC with version-filtering and status verification
  DROP FUNCTION IF EXISTS public.match_documents(vector, float, int, text);

  CREATE OR REPLACE FUNCTION public.match_documents(
      query_embedding     VECTOR(1536),
      match_threshold     FLOAT       DEFAULT 0.7,
      match_count         INT         DEFAULT 10,
      filter_framework    TEXT        DEFAULT NULL,
      filter_version_id   UUID        DEFAULT NULL
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
          dc.embedding IS NOT NULL
          -- Document status must be 'published'
          AND cd.status = 'published'
          -- Cosine similarity threshold
          AND (1 - (dc.embedding <=> query_embedding)) >= match_threshold
          -- Optional framework filter
          AND (
              filter_framework IS NULL
              OR filter_framework = ANY(dc.nist_families)
              OR filter_framework = ANY(dc.iso_controls)
              OR filter_framework = ANY(dc.scf_controls)
          )
          -- Version scoping: returns document if it is global (null version) OR matches specific version
          AND (
              filter_version_id IS NULL
              OR cd.product_version_id IS NULL
              OR cd.product_version_id = filter_version_id
          )
      ORDER BY dc.embedding <=> query_embedding
      LIMIT match_count;
  END;
  $$;

  COMMENT ON FUNCTION public.match_documents IS
    'pgvector cosine similarity search for RAG. Returns top-K document chunks. Filters by framework, published status, and product version.';

COMMIT;
