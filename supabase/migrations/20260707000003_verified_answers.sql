-- ============================================================================
-- Migration 20260707000003: verified-answer memory with safeguards
-- (specs/003-truth-platform F5 / Onda 4 — T501, T502 legacy migration).
--
-- The legacy promotion path inserted approved Q&A pairs into document_chunks
-- (section_title = 'VERIFIED_QA'). That is the echo chamber the roadmap
-- warns about: layer 2 (document RAG) would retrieve layer 3 (previous
-- answers) and cite an old answer as if it were documentation.
--
-- This migration:
--   1. Creates verified_answers — a SEPARATE store, scoped by sales channel
--      and product version, stamped with the corpus fingerprint at approval
--      time (staleness signal) and a status lifecycle.
--   2. Adds match_verified_answers — scope-mandatory similarity search that
--      only ever serves answers from the SAME channel (and version or
--      org-wide), never from another scope.
--   3. Migrates legacy VERIFIED_QA chunks out of document_chunks into
--      verified_answers as status='needs_review' (their channel/version is
--      unknown — they must be triaged before being served), then DELETES
--      them from document_chunks so document RAG can never read them again.
--
-- Idempotent: re-running is a no-op.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.verified_answers (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    question_text       TEXT        NOT NULL,
    final_answer        TEXT        NOT NULL,
    embedding           VECTOR(1536),
    -- Scope: answers only ever serve the same channel; version NULL = org-wide.
    sales_channel       TEXT        NULL CHECK (sales_channel IN ('B2B_GEHC', 'B2B_DIRECT')),
    product_version_id  UUID        NULL REFERENCES public.product_versions(id) ON DELETE CASCADE,
    -- Corpus fingerprint at approval time. A mismatch with the live corpus
    -- means the posture may have moved: serve as "possibly stale" suggestion
    -- only, never as a confident answer (T503).
    posture_fingerprint TEXT        NULL,
    mapped_controls     JSONB       NOT NULL DEFAULT '[]',
    source_assessment_id UUID       NULL REFERENCES public.customer_assessments(id) ON DELETE SET NULL,
    status              TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'needs_review', 'retired')),
    valid_until         DATE        NULL,
    created_by          UUID        NULL REFERENCES auth.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.verified_answers IS
  'Approved questionnaire answers as reusable phrasing memory (specs/003 F5). Separate from document_chunks BY DESIGN: document RAG (layer 2) must never retrieve previous answers (layer 3). Scoped by channel/version; posture_fingerprint drives staleness.';

CREATE INDEX IF NOT EXISTS idx_verified_answers_scope
    ON public.verified_answers (sales_channel, product_version_id) WHERE status = 'active';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_verified_answers_embedding') THEN
    CREATE INDEX idx_verified_answers_embedding
        ON public.verified_answers USING hnsw (embedding vector_cosine_ops);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_verified_answers_updated_at') THEN
    CREATE TRIGGER trg_verified_answers_updated_at
        BEFORE UPDATE ON public.verified_answers
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.verified_answers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'verified_answers' AND policyname = 'verified_answers_internal_all') THEN
    CREATE POLICY verified_answers_internal_all ON public.verified_answers
      FOR ALL USING (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ionic_user'))
      );
  END IF;
END $$;

-- ── Scope-mandatory similarity search ────────────────────────────────────────
-- Channel is REQUIRED; only rows from that channel (or channel-agnostic NULL
-- rows) are candidates. Version-scoped rows only match their own version;
-- NULL-version rows are org-wide. Only status='active' is ever served.

CREATE OR REPLACE FUNCTION public.match_verified_answers(
    query_embedding VECTOR(1536),
    filter_channel  TEXT,
    filter_version_id UUID DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.80,
    match_count     INT DEFAULT 3
)
RETURNS TABLE (
    id UUID,
    question_text TEXT,
    final_answer TEXT,
    sales_channel TEXT,
    product_version_id UUID,
    posture_fingerprint TEXT,
    mapped_controls JSONB,
    valid_until DATE,
    created_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE sql STABLE
-- The vector extension lives in the `extensions` schema on Supabase; without
-- it in the search_path the <=> operator fails to resolve (same fix as
-- match_documents_hybrid).
SET search_path = public, extensions
AS $$
  SELECT
    va.id,
    va.question_text,
    va.final_answer,
    va.sales_channel,
    va.product_version_id,
    va.posture_fingerprint,
    va.mapped_controls,
    va.valid_until,
    va.created_at,
    1 - (va.embedding <=> query_embedding) AS similarity
  FROM public.verified_answers va
  WHERE va.status = 'active'
    AND va.embedding IS NOT NULL
    AND (va.sales_channel IS NULL OR va.sales_channel = filter_channel)
    AND (va.product_version_id IS NULL OR va.product_version_id = filter_version_id)
    AND (va.valid_until IS NULL OR va.valid_until >= CURRENT_DATE)
    AND 1 - (va.embedding <=> query_embedding) >= match_threshold
  ORDER BY va.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION public.match_verified_answers IS
  'Verified-answer retrieval with mandatory channel scoping: an approved answer never serves a different sales channel or product version (specs/003 F5 isolation rule).';

-- ── Legacy VERIFIED_QA chunk migration (anti-echo-chamber) ──────────────────
-- Channel/version of legacy promotions is unknown → park them as
-- needs_review (not served until triaged), then remove them from
-- document_chunks so layer 2 stops reading them. Embeddings are preserved.

INSERT INTO public.verified_answers
    (question_text, final_answer, embedding, sales_channel, product_version_id, status, created_at)
SELECT
    COALESCE(NULLIF(split_part(dc.content, E'\nA: ', 1), ''), dc.content),
    COALESCE(NULLIF(split_part(dc.content, E'\nA: ', 2), ''), dc.content),
    dc.embedding,
    NULL,
    NULL,
    'needs_review',
    COALESCE(dc.created_at, now())
FROM public.document_chunks dc
WHERE dc.section_title = 'VERIFIED_QA'
  AND NOT EXISTS (
    SELECT 1 FROM public.verified_answers va
    WHERE va.status = 'needs_review'
      AND va.question_text = COALESCE(NULLIF(split_part(dc.content, E'\nA: ', 1), ''), dc.content)
  );

DELETE FROM public.document_chunks WHERE section_title = 'VERIFIED_QA';

COMMIT;
