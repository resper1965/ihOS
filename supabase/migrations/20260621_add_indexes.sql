-- Migration: Add GIN trigram indexes for optimized text searches

-- Make sure pg_trgm extension is active (it is, but keep it idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index on content_en for faster hybrid searches in English translations
CREATE INDEX IF NOT EXISTS document_chunks_content_en_trgm_idx 
ON public.document_chunks USING GIN (content_en gin_trgm_ops);

-- Document the addition of the content_en trigram index
COMMENT ON INDEX public.document_chunks_content_en_trgm_idx IS 'GIN trigram index on English translations for fast text search';
