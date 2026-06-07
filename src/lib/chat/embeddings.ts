// src/lib/chat/embeddings.ts
// Centralized embedding generation service using OpenAI text-embedding-3-small
// via the Vercel AI SDK. All RAG and document ingestion should use these helpers.

import { embed, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_BATCH_SIZE = 100;

/**
 * Generate a single embedding vector for the given text.
 * Returns a 1536-dimensional float array.
 *
 * @throws Error if the embedding API call fails.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: text,
  });
  return embedding;
}

/**
 * Generate embeddings for multiple texts in batches.
 * Automatically splits into batches of MAX_BATCH_SIZE to stay within
 * API limits. Returns arrays in the same order as the input texts.
 *
 * @throws Error if any batch fails (partial results are NOT returned).
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: openai.embedding(EMBEDDING_MODEL),
      values: batch,
    });
    results.push(...embeddings);
  }

  return results;
}
