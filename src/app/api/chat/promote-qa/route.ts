// src/app/api/chat/promote-qa/route.ts
// Promotes approved Q&A pairs into the knowledge base (document_chunks)
// and records learning corrections when the user edited the AI draft.

import { NextResponse } from 'next/server';
import { embed } from 'ai';
import { openai } from '@/lib/chat/openai';
import { createClient } from '@/lib/supabase/server';
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
    const { items, conversationId } = body;

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

    let chunksInserted = 0;
    let correctionsWritten = 0;

    for (const item of items) {
      const combinedText = `Q: ${item.questionText}\nA: ${item.finalAnswer}`;

      // 1. Generate embedding for the combined Q+A text
      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: combinedText,
      });

      // 2. Insert into document_chunks as a verified QA entry
      const { error: insertError } = await (supabase as any)
        .from('document_chunks')
        .insert({
          document_id: null, // standalone verified QA — not linked to a document
          content: combinedText,
          chunk_index: 0,
          section_title: 'VERIFIED_QA',
          embedding: JSON.stringify(embedding),
          char_count: combinedText.length,
        });

      if (insertError) {
        console.error(
          `[promote-qa] Failed to insert chunk for ${item.questionId}:`,
          insertError.message,
        );
        continue; // skip but don't abort the whole batch
      }

      chunksInserted++;

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

        const { error: corrError } = await (supabase as any)
          .from('agent_learning_corrections')
          .insert(correctionPayload);

        if (corrError) {
          console.error(
            `[promote-qa] Failed to insert correction for ${item.questionId}:`,
            corrError.message,
          );
        } else {
          correctionsWritten++;
        }
      }
    }

    const result: PromotionResult = { chunksInserted, correctionsWritten };

    return NextResponse.json(
      { success: true, data: result },
      { status: 200 },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to promote Q&A pairs.';
    console.error('[promote-qa] Error:', message);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
