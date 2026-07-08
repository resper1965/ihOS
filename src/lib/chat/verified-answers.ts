// src/lib/chat/verified-answers.ts
// Read side of the verified-answer memory (specs/003 F5 / Onda 4).
//
// Verified answers are LAYER 3: approved phrasings from past questionnaires.
// They are stored apart from document_chunks so document RAG (layer 2) can
// never cite a previous answer as documentation (anti-echo-chamber), and
// they are only ever served within the same sales channel and product
// version. A stored posture fingerprint that no longer matches the live
// corpus demotes the answer to a "possibly stale" suggestion (T503).

import { logger } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCorpusFingerprint } from '@/lib/assessment/corpus-fingerprint';

export interface VerifiedAnswerSuggestion {
  id: string;
  questionText: string;
  finalAnswer: string;
  similarity: number;
  /** True when the corpus changed since this answer was approved. */
  stale: boolean;
  mappedControls: unknown[];
  createdAt: string;
}

export const VERIFIED_ANSWER_THRESHOLD = 0.8;
const VERIFIED_ANSWER_COUNT = 2;

/**
 * Fetch verified-answer suggestions for a question embedding, strictly
 * scoped to the given channel (and version / org-wide). Channel is
 * mandatory: without it there is no safe scope to serve from.
 */
export async function searchVerifiedAnswers(
  admin: SupabaseClient,
  questionEmbedding: number[],
  scope: { salesChannel: 'B2B_GEHC' | 'B2B_DIRECT'; productVersionId?: string | null },
): Promise<VerifiedAnswerSuggestion[]> {
  try {
    const { data, error } = await admin.rpc('match_verified_answers', {
      query_embedding: JSON.stringify(questionEmbedding),
      filter_channel: scope.salesChannel,
      filter_version_id: scope.productVersionId ?? null,
      match_threshold: VERIFIED_ANSWER_THRESHOLD,
      match_count: VERIFIED_ANSWER_COUNT,
    });

    if (error) {
      logger.warn('Verified-answer lookup failed', {
        context: 'verified-answers',
        meta: { error: error.message },
      });
      return [];
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return [];

    const currentFingerprint = await getCorpusFingerprint(scope.productVersionId ?? null);

    return rows.map((row) => ({
      id: String(row.id),
      questionText: String(row.question_text ?? ''),
      finalAnswer: String(row.final_answer ?? ''),
      similarity: Number(row.similarity ?? 0),
      stale:
        row.posture_fingerprint != null &&
        String(row.posture_fingerprint) !== currentFingerprint,
      mappedControls: (row.mapped_controls as unknown[]) ?? [],
      createdAt: String(row.created_at ?? ''),
    }));
  } catch (err) {
    logger.warn('Verified-answer lookup unavailable', {
      context: 'verified-answers',
      meta: { error: err instanceof Error ? err.message : 'unknown' },
    });
    return [];
  }
}

/**
 * Prompt block for suggestions. Pure — testable. Suggestions are phrasing
 * references ONLY: the persisted posture verdict remains the source of
 * truth, and stale suggestions say so explicitly.
 */
export function buildVerifiedAnswerBlock(suggestions: VerifiedAnswerSuggestion[]): string {
  if (suggestions.length === 0) return '';

  const lines = suggestions.map((s, i) => {
    const staleness = s.stale
      ? ' [POSSIBLY STALE — the documentation corpus changed since this answer was approved; use only as a phrasing reference and defer to the evaluated posture]'
      : '';
    return `[Previous approved answer ${i + 1}]${staleness}\nQ: ${s.questionText}\nA: ${s.finalAnswer}`;
  });

  return (
    `PREVIOUSLY APPROVED ANSWERS (same channel/version — phrasing reference only, ` +
    `NEVER evidence; the evaluated posture above always wins on substance):\n${lines.join('\n\n')}`
  );
}
