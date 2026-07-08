// src/app/api/chat/generate-answers/route.ts
// Receives extracted questions and produces posture-grounded compliance
// answers (F3, specs/003 Onda 2), batched 5 at a time. Layering:
//   1. persisted control verdicts (control_evaluation_cache) — primary truth
//   2. document citations (hybrid RAG) — supporting evidence
//   3. declared gap — when neither layer covers the question (fail-closed,
//      Constitution Principle VIII: no best-effort improvisation)

import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { embed, generateText } from 'ai';
import { getOpenAI } from '@/lib/chat/openai';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  mapQuestionToControls,
  getPersistedVerdicts,
  buildPostureGrounding,
} from '@/lib/assessment/posture-answering';
import {
  searchVerifiedAnswers,
  buildVerifiedAnswerBlock,
} from '@/lib/chat/verified-answers';
import type {
  ExtractedQuestion,
  GeneratedAnswer,
  RAGReference,
  AnswerSource,
} from '@/lib/chat/questionnaire-types';

export const maxDuration = 120;

const BATCH_SIZE = 5;
const RAG_MATCH_COUNT = 5;
const RAG_MATCH_THRESHOLD = 0.65;

type SalesChannel = 'B2B_GEHC' | 'B2B_DIRECT';

/** Category filter derived from the sales channel, mirroring the assessment
 *  engine's overlay logic (engine.ts): channel absent = both overlays, which
 *  is only acceptable for internal aggregate views — questionnaire callers
 *  should always send the channel (specs/003 F2). */
function categoriesForChannel(salesChannel?: SalesChannel | null): string[] {
  const base = ['ISMS_CORE', 'OPERATIONAL'];
  if (salesChannel === 'B2B_GEHC') return [...base, 'B2B_GEHC'];
  if (salesChannel === 'B2B_DIRECT') return [...base, 'B2B_DIRECT'];
  return [...base, 'B2B_GEHC', 'B2B_DIRECT'];
}

// ── Single-question processor ────────────────────────────────────────────────

async function processQuestion(
  question: ExtractedQuestion,
  supabase: Awaited<ReturnType<typeof createClient>>,
  openai: Awaited<ReturnType<typeof getOpenAI>>,
  productVersionId?: string,
  salesChannel?: SalesChannel | null,
): Promise<GeneratedAnswer> {
  const admin = createAdminClient();

  // 1. Generate embedding for the question text
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),

    value: question.text,
  });

  // 2. T301/T302 — map the question onto SCF controls and read the persisted
  //    verdicts for them in this version × channel scope.
  const mapped = await mapQuestionToControls(admin, embedding);
  const verdicts = await getPersistedVerdicts(
    admin,
    mapped.map((m) => m.control_code),
    { productVersionId: productVersionId ?? null, salesChannel: salesChannel ?? null },
  );
  const grounding = buildPostureGrounding(mapped, verdicts);

  // 3. Retrieve matching document chunks via Supabase RPC (supporting
  //    citations — never the primary verdict when a posture verdict exists).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: matchedChunks, error: rpcError } = await (supabase as any).rpc(
    'match_documents_hybrid',
    {
      query_text: question.text,
      query_embedding: embedding,
      match_threshold: RAG_MATCH_THRESHOLD,
      match_count: RAG_MATCH_COUNT,
      filter_framework: null,
      filter_version_id: productVersionId || null,
      filter_categories: categoriesForChannel(salesChannel),
    },
  );

  if (rpcError) {
    logger.error("RPC error during hybrid document match", {
      context: "chat/generate-answers",
      meta: { questionId: question.questionId, error: rpcError.message }
    });
  }

  const chunks: Array<Record<string, unknown>> =
    Array.isArray(matchedChunks) ? matchedChunks : [];

  // Build references from matched chunks
  const references: RAGReference[] = chunks.map((chunk) => ({
    chunkId: chunk.id as number,
    documentTitle: (chunk.document_title as string) ?? 'Unknown Document',
    sectionTitle: (chunk.section_title as string) ?? undefined,
    similarity: (chunk.similarity as number) ?? 0,
    excerpt: ((chunk.content as string) ?? '').slice(0, 300),
  }));

  const answerSource: AnswerSource = grounding.hasVerdicts
    ? 'posture'
    : chunks.length > 0
      ? 'document'
      : 'gap';

  // Declared gap: neither a persisted verdict nor an indexed document covers
  // the question. Fail closed — no LLM call, no improvised answer. The
  // remediation status is intentionally NOT exposed (product default:
  // neutral; opt-in per assessment arrives with F4).
  if (answerSource === 'gap') {
    return {
      questionId: question.questionId,
      questionText: question.text,
      generatedAnswer:
        'No indexed evidence covers this question. There is no evaluated control verdict nor policy documentation matching it in the current scope. This is a declared documentation gap — do not answer the client until the underlying policy/evidence is indexed and assessed.',
      confidenceScore: 0,
      references: [],
      answerSource,
      mappedControls: grounding.mappedControls,
      needsReview: true,
    };
  }

  // Layer 3 (F5): previously approved answers from the SAME channel/version,
  // as phrasing references only. Without a channel there is no safe scope.
  const verifiedSuggestions = salesChannel
    ? await searchVerifiedAnswers(admin, embedding, {
        salesChannel,
        productVersionId: productVersionId ?? null,
      })
    : [];
  const verifiedBlock = buildVerifiedAnswerBlock(verifiedSuggestions);

  // Build the layered context for the LLM
  const citationsBlock =
    chunks.length > 0
      ? chunks
          .map(
            (c, i) =>
              `[Source ${i + 1}] ${c.document_title ?? 'Document'} — ${c.section_title ?? 'N/A'}\n${c.content}`,
          )
          .join('\n\n')
      : 'No document excerpts matched — ground the answer strictly on the evaluated posture above.';

  // 4. T303/T304 — fail-closed composition: verdict first, citations as
  //    support, gaps declared as gaps.
  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system: `You are a GRC (Governance, Risk & Compliance) expert for Ionic Health answering a customer compliance questionnaire.

Ground rules (STRICT — Constitution Principle VIII):
- The EVALUATED POSTURE block, when present, is the primary source of truth. Your answer MUST reflect its verdict (conforming/partial/informal/gap) — never contradict it based on document excerpts alone.
- Use the POLICY CONTEXT excerpts only as supporting evidence and cite the source documents by name.
- If the posture verdict for a relevant control is GAP or PARTIAL, say so plainly. Do NOT soften it or speculate about undocumented practices.
- If neither the posture block nor the excerpts contain the information asked, state exactly: the information is not covered by the indexed documentation. NEVER give a best-effort or invented answer.
- Do not disclose internal remediation plans, deadlines, or POA&M details.
- If a verdict is flagged STALE, add: "Note: this verdict may be outdated — internal re-assessment pending."
- Previously approved answers, when present, are phrasing references ONLY — they are not evidence and never override the evaluated posture.
- Be concise, professional, and factual.

${grounding.contextBlock ? `${grounding.contextBlock}\n\n` : ''}${verifiedBlock ? `${verifiedBlock}\n\n` : ''}POLICY CONTEXT:
${citationsBlock}`,
    prompt: `Question: ${question.text}${question.context ? `\nCategory/Context: ${question.context}` : ''}`,
  });

  // 5. Confidence: verdict-backed answers inherit the verdict confidence;
  //    document-only answers keep the similarity heuristic.
  let confidenceScore: number;
  if (grounding.hasVerdicts) {
    const groundedVerdicts = grounding.mappedControls.filter((m) => m.status);
    const verdictConfidences = [...verdicts.values()].map((v) => v.confidenceScore);
    const avgVerdictConfidence =
      verdictConfidences.reduce((sum, c) => sum + c, 0) / Math.max(1, verdictConfidences.length);
    confidenceScore = Math.round(avgVerdictConfidence * (groundedVerdicts.length > 0 ? 1 : 0.5));
  } else {
    const avgSimilarity =
      references.length > 0
        ? references.reduce((sum, r) => sum + r.similarity, 0) / references.length
        : 0;
    confidenceScore = Math.round(Math.min(100, avgSimilarity * 100));
  }

  const stalenessWarning = grounding.hasStaleVerdict
    ? 'One or more grounding verdicts predate the current document corpus — re-run the assessment before relying on this answer.'
    : undefined;

  const needsReview =
    grounding.weakMapping ||
    grounding.hasStaleVerdict ||
    (grounding.hasVerdicts &&
      grounding.mappedControls.some((m) => m.status === 'gap' || m.status === 'partial'));

  return {
    questionId: question.questionId,
    questionText: question.text,
    generatedAnswer: text,
    confidenceScore,
    references,
    answerSource,
    mappedControls: grounding.mappedControls,
    needsReview,
    stalenessWarning,
  };
}

// ── Batch helper ─────────────────────────────────────────────────────────────

async function processBatch(
  questions: ExtractedQuestion[],
  supabase: Awaited<ReturnType<typeof createClient>>,
  openai: Awaited<ReturnType<typeof getOpenAI>>,
  productVersionId?: string,
  salesChannel?: SalesChannel | null,
): Promise<GeneratedAnswer[]> {
  const results = await Promise.allSettled(
    questions.map((q) => processQuestion(q, supabase, openai, productVersionId, salesChannel)),
  );

  return results.map((result, idx) => {
    if (result.status === 'fulfilled') return result.value;

    const question = questions[idx];
    logger.error("Failed to generate answer for question", {
      context: "chat/generate-answers",
      meta: { questionId: question.questionId },
      error: result.reason
    });

    return {
      questionId: question.questionId,
      questionText: question.text,
      generatedAnswer: `[Error] Failed to generate answer: ${
        result.reason instanceof Error ? result.reason.message : 'Unknown error'
      }`,
      confidenceScore: 0,
      references: [],
      needsReview: true,
    };
  });
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const openai = await getOpenAI();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { questions, productVersionId, salesChannel } = body as {
      questions?: ExtractedQuestion[];
      productVersionId?: string;
      salesChannel?: SalesChannel | null;
    };

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Request body must contain a non-empty "questions" array of ExtractedQuestion objects.',
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

    const allAnswers: GeneratedAnswer[] = [];

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
      const batch = questions.slice(i, i + BATCH_SIZE);
      const batchAnswers = await processBatch(batch, supabase, openai, productVersionId, salesChannel);
      allAnswers.push(...batchAnswers);
    }

    return NextResponse.json(
      { success: true, data: allAnswers },
      { status: 200 },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate answers.';
    logger.error("Generate answers failed", { context: "chat/generate-answers", meta: { error: message } });

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
