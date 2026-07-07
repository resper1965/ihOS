// src/app/api/chat/promote-qa/route.ts
// Promotes approved Q&A pairs into the verified-answer memory
// (verified_answers) and records learning corrections when the user edited
// the AI draft.
//
// F5 safeguard (specs/003 Onda 4): promotions NEVER touch document_chunks.
// The old path inserted VERIFIED_QA rows there, letting document RAG
// (layer 2) cite previous answers (layer 3) as documentation — the echo
// chamber the roadmap forbids. Promotions without an explicit sales channel
// are parked as needs_review (unscoped answers are never served) until the
// caller provides the channel/version context.

import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { embed } from 'ai';
import { getOpenAI } from '@/lib/chat/openai';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCorpusFingerprint } from '@/lib/assessment/corpus-fingerprint';
import type {
  PromotionPayload,
  PromotionResult,
} from '@/lib/chat/questionnaire-types';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // ── Auth check ──────────────────────────────────────────────────────
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 },
      );
    }

    // ── Parse body ──────────────────────────────────────────────────────
    const body = (await req.json()) as PromotionPayload;
    const { items, conversationId, salesChannel, productVersionId, sourceAssessmentId } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Request body must contain a non-empty "items" array of approved Q&A pairs.',
        },
        { status: 400 },
      );
    }

    if (salesChannel !== undefined && salesChannel !== null &&
        salesChannel !== 'B2B_GEHC' && salesChannel !== 'B2B_DIRECT') {
      return NextResponse.json(
        { success: false, error: 'salesChannel must be "B2B_GEHC" or "B2B_DIRECT" when provided.' },
        { status: 400 },
      );
    }

    // verified_answers is newer than the generated Supabase types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Channel-less promotions cannot be safely served (no scope) — park them
    // for triage instead of refusing, so the legacy UI keeps working.
    const status = salesChannel ? 'active' : 'needs_review';
    const postureFingerprint = await getCorpusFingerprint(productVersionId ?? null);

    let answersInserted = 0;
    let correctionsWritten = 0;

    const openai = await getOpenAI();

    for (const item of items) {

      const combinedText = `Q: ${item.questionText}\nA: ${item.finalAnswer}`;

      // 1. Generate embedding for the combined Q+A text
      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: combinedText,
      });

      // 2. Insert into the verified-answer memory (layer 3 — NOT document_chunks)
      const { error: insertError } = await admin
        .from('verified_answers')
        .insert({
          question_text: item.questionText,
          final_answer: item.finalAnswer,
          embedding,
          sales_channel: salesChannel ?? null,
          product_version_id: productVersionId ?? null,
          posture_fingerprint: postureFingerprint,
          source_assessment_id: sourceAssessmentId ?? null,
          status,
          created_by: user.id,
        });

      if (insertError) {
        logger.error("Failed to insert verified answer", { context: "chat/promote-qa", meta: { questionId: item.questionId, error: insertError.message } });
        continue; // skip but don't abort the whole batch
      }

      answersInserted++;

      // 3. If user edited the AI draft, record a learning correction
      if (item.wasEdited) {
        const correctionPayload: Record<string, unknown> = {
          user_id: user.id,
          conversation_id:
            conversationId ?? '00000000-0000-0000-0000-000000000000',
          message_id: null,
          user_correction: item.finalAnswer,
          agent_misaligned_response: item.aiDraftAnswer,
          learned_context: item.questionText,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: corrError } = await (supabase as any)
          .from('agent_learning_corrections')
          .insert(correctionPayload);

        if (corrError) {
          logger.error("Failed to insert correction", { context: "chat/promote-qa", meta: { questionId: item.questionId, error: corrError.message } });
        } else {
          correctionsWritten++;
        }
      }
    }

    const result: PromotionResult = {
      answersInserted,
      correctionsWritten,
      parkedForTriage: status === 'needs_review' ? answersInserted : 0,
    };

    return NextResponse.json(
      { success: true, data: result },
      { status: 200 },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to promote Q&A pairs.';
    logger.error("Promote QA failed", { context: "chat/promote-qa", meta: { error: message } });

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
