// src/app/api/chat/generate-answers/route.ts
// Receives extracted questions, generates embeddings, retrieves RAG context,
// and produces compliance answers via OpenAI — batched 5 at a time.

import { NextResponse } from 'next/server';
import { embed, generateText } from 'ai';
import { getOpenAI } from '@/lib/chat/openai';

import { createClient } from '@/lib/supabase/server';
import type {
  ExtractedQuestion,
  GeneratedAnswer,
  RAGReference,
} from '@/lib/chat/questionnaire-types';

export const maxDuration = 120;

const BATCH_SIZE = 5;
const RAG_MATCH_COUNT = 5;
const RAG_MATCH_THRESHOLD = 0.65;

// ── Single-question processor ────────────────────────────────────────────────

async function processQuestion(
  question: ExtractedQuestion,
  supabase: Awaited<ReturnType<typeof createClient>>,
  productVersionId?: string,
): Promise<GeneratedAnswer> {
  const openai = await getOpenAI();
  // 1. Generate embedding for the question text
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),

    value: question.text,
  });

  // 2. Retrieve matching document chunks via Supabase RPC
  const { data: matchedChunks, error: rpcError } = await (supabase as any).rpc(
    'match_documents_hybrid',
    {
      query_text: question.text,
      query_embedding: embedding,
      match_threshold: RAG_MATCH_THRESHOLD,
      match_count: RAG_MATCH_COUNT,
      filter_framework: null,
      filter_version_id: productVersionId || null,
      filter_categories: null,
    },
  );

  if (rpcError) {
    console.error(
      `[generate-answers] RPC error for ${question.questionId}:`,
      rpcError.message,
    );
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

  // Build context string for the LLM
  const ragContext =
    chunks.length > 0
      ? chunks
          .map(
            (c, i) =>
              `[Source ${i + 1}] ${c.document_title ?? 'Document'} — ${c.section_title ?? 'N/A'}\n${c.content}`,
          )
          .join('\n\n')
      : 'No relevant policy documents were found.';

  // 3. Generate compliance answer
  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system: `You are a GRC (Governance, Risk & Compliance) expert for Ionic Health.
Answer the following compliance questionnaire question using ONLY the policy excerpts provided below.
If the policies do not contain enough information, state what is missing and give a best-effort answer noting the gap.
Always cite the source documents by name.
Be concise, professional, and factual.

POLICY CONTEXT:
${ragContext}`,
    prompt: `Question: ${question.text}${question.context ? `\nCategory/Context: ${question.context}` : ''}`,
  });

  // Estimate confidence based on number and quality of RAG matches
  const avgSimilarity =
    references.length > 0
      ? references.reduce((sum, r) => sum + r.similarity, 0) / references.length
      : 0;
  const confidenceScore = Math.round(
    Math.min(100, avgSimilarity * 100 * (references.length > 0 ? 1 : 0.3)),
  );

  return {
    questionId: question.questionId,
    questionText: question.text,
    generatedAnswer: text,
    confidenceScore,
    references,
  };
}

// ── Batch helper ─────────────────────────────────────────────────────────────

async function processBatch(
  questions: ExtractedQuestion[],
  supabase: Awaited<ReturnType<typeof createClient>>,
  productVersionId?: string,
): Promise<GeneratedAnswer[]> {
  const results = await Promise.allSettled(
    questions.map((q) => processQuestion(q, supabase, productVersionId)),
  );

  return results.map((result, idx) => {
    if (result.status === 'fulfilled') return result.value;

    const question = questions[idx];
    console.error(
      `[generate-answers] Failed ${question.questionId}:`,
      result.reason,
    );

    return {
      questionId: question.questionId,
      questionText: question.text,
      generatedAnswer: `[Error] Failed to generate answer: ${
        result.reason instanceof Error ? result.reason.message : 'Unknown error'
      }`,
      confidenceScore: 0,
      references: [],
    };
  });
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { questions, productVersionId } = body as {
      questions?: ExtractedQuestion[];
      productVersionId?: string;
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

    const allAnswers: GeneratedAnswer[] = [];

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
      const batch = questions.slice(i, i + BATCH_SIZE);
      const batchAnswers = await processBatch(batch, supabase, productVersionId);
      allAnswers.push(...batchAnswers);
    }

    return NextResponse.json(
      { success: true, data: allAnswers },
      { status: 200 },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate answers.';
    console.error('[generate-answers] Error:', message);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
