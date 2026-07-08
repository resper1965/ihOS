-- ============================================================================
-- Migration 20260708000001: PR #14 review fixes.
--
--   1. agent_notifications.type CHECK — allow 'runtime_posture_violation'
--      (the DefectDojo sync's cross-axis alert was hitting the constraint
--      and being silently dropped by routeNotification's error logging).
--   2. replace_customer_assessment_answers() — the answers POST previously
--      ran delete → insert → counters → status → audit event as separate
--      requests, so a mid-flight failure left the assessment half-applied.
--      This RPC makes the whole replace atomic (single transaction).
--
-- Idempotent: re-running is a no-op.
-- ============================================================================

BEGIN;

-- ── 1. Notification type ─────────────────────────────────────────────────────

ALTER TABLE public.agent_notifications DROP CONSTRAINT IF EXISTS agent_notifications_type_check;
ALTER TABLE public.agent_notifications ADD CONSTRAINT agent_notifications_type_check
  CHECK (type IN (
    'poam_expiry', 'score_change', 'task_deadline', 'document_expired',
    'assessment_complete', 'runtime_posture_violation'
  ));

-- ── 2. Atomic answer replace ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.replace_customer_assessment_answers(
    p_assessment_id UUID,
    p_answers JSONB,          -- array of answer rows (see route for shape)
    p_posture_fingerprint TEXT DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_inserted INT;
    v_counts JSONB;
BEGIN
    SELECT status INTO v_status
    FROM public.customer_assessments
    WHERE id = p_assessment_id
    FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'assessment_not_found';
    END IF;
    IF v_status NOT IN ('received', 'answering') THEN
        RAISE EXCEPTION 'invalid_status:%', v_status;
    END IF;

    -- Replace semantics: a regeneration supersedes the previous answer set.
    DELETE FROM public.customer_assessment_answers
    WHERE assessment_id = p_assessment_id;

    INSERT INTO public.customer_assessment_answers (
        assessment_id, question_text, question_context, cell_coords,
        sheet_name, row_index, draft_answer, final_answer, answer_source,
        mapped_controls, "references", confidence, review_status, needs_review
    )
    SELECT
        p_assessment_id,
        a->>'question_text',
        a->>'question_context',
        a->>'cell_coords',
        a->>'sheet_name',
        (a->>'row_index')::INT,
        a->>'draft_answer',
        NULL,
        a->>'answer_source',
        COALESCE(a->'mapped_controls', '[]'::JSONB),
        COALESCE(a->'references', '[]'::JSONB),
        (a->>'confidence')::INT,
        'pending',
        COALESCE((a->>'needs_review')::BOOLEAN, false)
    FROM jsonb_array_elements(p_answers) AS a;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    UPDATE public.customer_assessments ca
    SET question_count = v_inserted,
        answered_count = (
            SELECT count(*) FROM public.customer_assessment_answers x
            WHERE x.assessment_id = p_assessment_id
              AND length(trim(coalesce(x.draft_answer, ''))) > 0
        ),
        approved_count = 0,
        posture_fingerprint = COALESCE(p_posture_fingerprint, ca.posture_fingerprint),
        status = CASE WHEN v_status = 'received' THEN 'answering' ELSE v_status END
    WHERE ca.id = p_assessment_id;

    INSERT INTO public.customer_assessment_events
        (assessment_id, event_type, from_status, to_status, actor_id, detail)
    VALUES (
        p_assessment_id, 'answers_generated', v_status,
        CASE WHEN v_status = 'received' THEN 'answering' ELSE v_status END,
        p_actor_id,
        jsonb_build_object(
            'answer_count', v_inserted,
            'posture_fingerprint', p_posture_fingerprint
        )
    );

    SELECT jsonb_build_object(
        'inserted', v_inserted,
        'question_count', question_count,
        'answered_count', answered_count,
        'approved_count', approved_count,
        'status', status
    ) INTO v_counts
    FROM public.customer_assessments WHERE id = p_assessment_id;

    RETURN v_counts;
END;
$$;

COMMENT ON FUNCTION public.replace_customer_assessment_answers IS
  'Atomic replace of a customer assessment''s answer set: delete + insert + counters + status transition + audit event in one transaction (PR #14 review).';

-- Internal callers only (service role via the API route).
REVOKE ALL ON FUNCTION public.replace_customer_assessment_answers(UUID, JSONB, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_customer_assessment_answers(UUID, JSONB, TEXT, UUID) TO service_role;

COMMIT;
