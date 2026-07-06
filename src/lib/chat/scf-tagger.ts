// src/lib/chat/scf-tagger.ts
// Two-stage SCF auto-tagging: cosine similarity (fast) → LLM confirmation (precise).

import { generateObject } from 'ai';
import { z } from 'zod';
import { getOpenAI } from '@/lib/chat/openai';
import { logger } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

// Types
export interface ScfCandidate {
  control_code: string;
  domain_code: string;
  control_name: string;
  description: string;
  similarity: number;
}

export interface ScfTagResult {
  control_code: string;
  similarity: number;
  llm_status: 'implements' | 'mentions' | 'negates';
  justification: string;
}

export interface TaggedChunk {
  chunk_id: number;
  chunk_index: number;
  content: string;
  embedding: string; // JSON stringified
  scf_controls: string[];
  scf_tag_results: ScfTagResult[];
}

// Zod schema for LLM structured output
const ScfConfirmationSchema = z.object({
  evaluations: z.array(z.object({
    control_code: z.string(),
    status: z.enum(['implements', 'mentions', 'negates']),
    justification: z.string().max(200),
  })),
});

const LLM_BATCH_SIZE = 10;
const SCF_MATCH_THRESHOLD = 0.70;
const SCF_MATCH_COUNT = 5;

// Stage 1: Cosine similarity against scf_controls table
async function findScfCandidates(
  admin: SupabaseClient,
  embedding: number[],
): Promise<ScfCandidate[]> {
  const { data, error } = await admin.rpc('match_scf_controls', {
    query_embedding: JSON.stringify(embedding),
    match_threshold: SCF_MATCH_THRESHOLD,
    match_count: SCF_MATCH_COUNT,
  });

  if (error) {
    logger.warn('SCF candidate search failed', { context: 'scf-tagger', meta: { error: error.message } });
    return [];
  }

  return (data ?? []) as ScfCandidate[];
}

// Stage 2: LLM confirmation
async function confirmWithLlm(
  chunkContent: string,
  candidates: ScfCandidate[],
): Promise<ScfTagResult[]> {
  if (candidates.length === 0) return [];

  try {
    const openai = await getOpenAI();
    const candidateList = candidates
      .map(c => `- ${c.control_code} (${c.control_name}): ${c.description}`)
      .join('\n');

    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: ScfConfirmationSchema,
      prompt: `You are a compliance auditor for Ionic Health's N-Command Lite product.

Analyze the following document excerpt and determine if it IMPLEMENTS, merely MENTIONS, or NEGATES each candidate SCF control.

## Document Excerpt
${chunkContent}

## Candidate Controls
${candidateList}

Rules:
- "implements": The text provides evidence that this control IS actively implemented (policies, procedures, technical measures in place).
- "mentions": The text references the topic but does NOT provide evidence of implementation.
- "negates": The text explicitly states this control is NOT implemented or was excluded.
- Be strict. If in doubt, classify as "mentions".
- Justify each evaluation in one sentence (max 200 chars).`,
    });

    return object.evaluations.map(ev => {
      const candidate = candidates.find(c => c.control_code === ev.control_code);
      return {
        control_code: ev.control_code,
        similarity: candidate?.similarity ?? 0,
        llm_status: ev.status,
        justification: ev.justification,
      };
    });
  } catch (err) {
    logger.warn('LLM confirmation failed, falling back to semantic-only', {
      context: 'scf-tagger',
      meta: { error: err instanceof Error ? err.message : 'unknown' },
    });
    // Fallback: treat all candidates as 'mentions' (conservative)
    return candidates.map(c => ({
      control_code: c.control_code,
      similarity: c.similarity,
      llm_status: 'mentions' as const,
      justification: 'LLM confirmation unavailable — classified as mention by default.',
    }));
  }
}

// Main: Tag chunks with SCF controls (2-stage pipeline)
export async function tagChunksWithScf(
  admin: SupabaseClient,
  chunks: Array<{ chunk_id: number; chunk_index: number; content: string; embedding: string }>,
): Promise<TaggedChunk[]> {
  const results: TaggedChunk[] = [];

  for (let i = 0; i < chunks.length; i += LLM_BATCH_SIZE) {
    const batch = chunks.slice(i, i + LLM_BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (chunk) => {
        const embeddingVector = JSON.parse(chunk.embedding) as number[];

        // Stage 1: Cosine similarity
        const candidates = await findScfCandidates(admin, embeddingVector);

        // Stage 2: LLM confirmation
        const tagResults = await confirmWithLlm(chunk.content, candidates);

        const implementedControls = tagResults
          .filter(r => r.llm_status === 'implements')
          .map(r => r.control_code);

        return {
          ...chunk,
          scf_controls: implementedControls,
          scf_tag_results: tagResults,
        };
      }),
    );

    results.push(...batchResults);
  }

  logger.info(`SCF auto-tagging complete`, {
    context: 'scf-tagger',
    meta: {
      total_chunks: chunks.length,
      chunks_with_controls: results.filter(r => r.scf_controls.length > 0).length,
    },
  });

  return results;
}
