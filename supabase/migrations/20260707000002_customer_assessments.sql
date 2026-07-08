-- ============================================================================
-- Migration 20260707000002: customer assessments as a first-class entity
-- (specs/003-truth-platform F4 / Onda 3 — T401).
--
-- The questionnaire pipeline (parse → answers → HITL review → download) was
-- ephemeral: closing the page lost everything. These tables turn it into a
-- persisted, auditable process:
--
--   customer_assessments         one row per received client questionnaire
--   customer_assessment_answers  one row per question, with provenance
--   customer_assessment_events   append-only audit trail (status moves, edits)
--
-- Status flow: received → answering → in_review → approved → exported → archived
-- (transition rules enforced in src/lib/assessment/customer-assessments.ts).
-- Idempotent: re-running is a no-op.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_assessments (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name         TEXT        NOT NULL,
    sales_channel       TEXT        NOT NULL CHECK (sales_channel IN ('B2B_GEHC', 'B2B_DIRECT')),
    product_version_id  UUID        NOT NULL REFERENCES public.product_versions(id),
    source_file         TEXT        NULL,
    file_format         TEXT        NULL,
    status              TEXT        NOT NULL DEFAULT 'received'
                        CHECK (status IN ('received', 'answering', 'in_review', 'approved', 'exported', 'archived')),
    question_count      INT         NOT NULL DEFAULT 0,
    answered_count      INT         NOT NULL DEFAULT 0,
    approved_count      INT         NOT NULL DEFAULT 0,
    -- Corpus fingerprint at answer-generation time: a mismatch against the
    -- live corpus means the answers may be stale (specs/003 F3/F5).
    posture_fingerprint TEXT        NULL,
    created_by          UUID        NULL REFERENCES auth.users(id),
    reviewed_by         UUID        NULL REFERENCES auth.users(id),
    due_date            DATE        NULL,
    exported_at         TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customer_assessments IS
  'Received client compliance questionnaires as persisted, auditable entities (specs/003 F4). Channel + product version are mandatory: an answer must never mix sales-channel document overlays.';

CREATE INDEX IF NOT EXISTS idx_customer_assessments_status
    ON public.customer_assessments (status);
CREATE INDEX IF NOT EXISTS idx_customer_assessments_version
    ON public.customer_assessments (product_version_id);

CREATE TABLE IF NOT EXISTS public.customer_assessment_answers (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id       UUID        NOT NULL REFERENCES public.customer_assessments(id) ON DELETE CASCADE,
    question_text       TEXT        NOT NULL,
    question_context    TEXT        NULL,
    cell_coords         TEXT        NULL,
    sheet_name          TEXT        NULL,
    row_index           INT         NULL,
    draft_answer        TEXT        NULL,
    final_answer        TEXT        NULL,
    answer_source       TEXT        NULL CHECK (answer_source IN ('posture', 'document', 'verified_qa', 'manual', 'gap')),
    mapped_controls     JSONB       NOT NULL DEFAULT '[]',  -- SCF controls that grounded the answer
    "references"        JSONB       NOT NULL DEFAULT '[]',  -- cited document chunks
    confidence          INT         NULL,
    review_status       TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (review_status IN ('pending', 'approved', 'edited', 'rejected')),
    needs_review        BOOLEAN     NOT NULL DEFAULT false,
    reviewed_by         UUID        NULL REFERENCES auth.users(id),
    reviewed_at         TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customer_assessment_answers IS
  'Per-question answers with full provenance: which layer grounded them (posture verdict / document / verified Q&A / manual / declared gap), the SCF controls involved, and the HITL review trail.';

CREATE INDEX IF NOT EXISTS idx_ca_answers_assessment
    ON public.customer_assessment_answers (assessment_id);
CREATE INDEX IF NOT EXISTS idx_ca_answers_review
    ON public.customer_assessment_answers (assessment_id, review_status);

CREATE TABLE IF NOT EXISTS public.customer_assessment_events (
    id             BIGSERIAL   PRIMARY KEY,
    assessment_id  UUID        NOT NULL REFERENCES public.customer_assessments(id) ON DELETE CASCADE,
    event_type     TEXT        NOT NULL,   -- status_change | answers_generated | answer_reviewed | exported | note
    from_status    TEXT        NULL,
    to_status      TEXT        NULL,
    actor_id       UUID        NULL REFERENCES auth.users(id),
    detail         JSONB       NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customer_assessment_events IS
  'Append-only audit trail for customer assessments: every status transition, answer batch, and review action.';

CREATE INDEX IF NOT EXISTS idx_ca_events_assessment
    ON public.customer_assessment_events (assessment_id, created_at);

-- updated_at triggers (set_updated_at() exists since 006_functions.sql)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_customer_assessments_updated_at') THEN
    CREATE TRIGGER trg_customer_assessments_updated_at
        BEFORE UPDATE ON public.customer_assessments
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ca_answers_updated_at') THEN
    CREATE TRIGGER trg_ca_answers_updated_at
        BEFORE UPDATE ON public.customer_assessment_answers
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── RLS: internal tool — admin/ionic_user only (client_user must not see
--    other customers' questionnaires) ─────────────────────────────────────────

ALTER TABLE public.customer_assessments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_assessment_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_assessment_events  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_assessments' AND policyname = 'ca_internal_all') THEN
    CREATE POLICY ca_internal_all ON public.customer_assessments
      FOR ALL USING (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ionic_user'))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_assessment_answers' AND policyname = 'ca_answers_internal_all') THEN
    CREATE POLICY ca_answers_internal_all ON public.customer_assessment_answers
      FOR ALL USING (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ionic_user'))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_assessment_events' AND policyname = 'ca_events_internal_all') THEN
    CREATE POLICY ca_events_internal_all ON public.customer_assessment_events
      FOR ALL USING (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ionic_user'))
      );
  END IF;
END $$;

COMMIT;
