// src/lib/chat/rag-search.ts
import { createClient } from '@/lib/supabase/server';
import { generateEmbedding } from './embeddings';
import { ihosEngine } from '@/lib/ihos-engine';
import type { SearchResult } from '@/lib/ihos-engine';

export interface SearchDocumentResult {
  id: number;
  content: string;
  similarity: number;
  metadata: {
    documentId: number;
    documentTitle: string;
    framework?: string;
    section?: string;
  };
}

export interface SearchDocumentsOptions {
  framework?: string;
  productVersionId?: string;
  categories?: string[];
  limit?: number;
  threshold?: number;
}

/**
 * Search documents via ihos-engine API (primary strategy).
 * Returns results mapped to SearchDocumentResult[] format.
 */
async function searchDocumentsWithEngine(
  query: string,
  options: SearchDocumentsOptions = {}
): Promise<SearchDocumentResult[]> {
  const { limit = 5 } = options;

  const response = await ihosEngine.search({
    query,
    top_k: limit,
    channel_filter: 'gehc',
  });

  if (!response.results || !Array.isArray(response.results)) {
    return [];
  }

  return response.results.map((result: SearchResult, index: number) => ({
    id: index + 1,
    content: result.content ?? '',
    similarity: result.score ?? 0,
    metadata: {
      documentId: parseInt(result.document_id, 10) || 0,
      documentTitle: result.filename ?? 'Unknown Document',
      framework: result.iso_controls?.join(', ') ?? undefined,
      section: result.section_title ?? undefined,
    },
  }));
}

/**
 * Search documents via Supabase RPC (fallback strategy).
 */
async function searchDocumentsWithSupabase(
  query: string,
  options: SearchDocumentsOptions = {}
): Promise<SearchDocumentResult[]> {
  const { framework = null, productVersionId = null, categories = null, limit = 5, threshold = 0.7 } = options;

  // Generate a real semantic embedding for the search query
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(query);
  } catch (embeddingErr) {
    console.error(
      '[RAG] Embedding generation failed:',
      embeddingErr instanceof Error ? embeddingErr.message : embeddingErr,
    );
    return [];
  }

  const supabase = await createClient();

  // Try new signature first (with filter_version_id + filter_categories)
  let { data, error } = await supabase.rpc('match_documents_hybrid', {
    query_text: query,
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
    filter_framework: framework,
    filter_version_id: productVersionId,
    filter_categories: categories,
  });

  // Fallback: if the new signature doesn't exist yet, retry without filter_version_id/filter_categories
  if (error && (error.code === '42883' || error.message?.includes('function') || error.code === 'PGRST202')) {
    console.warn('[RAG] filter_version_id/filter_categories not supported yet, falling back to old signature');
    const fallback = await supabase.rpc('match_documents_hybrid', {
      query_text: query,
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      filter_framework: framework,
    });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error('[RAG] match_documents RPC error:', error.message);
    return [];
  }

  if (!data || !Array.isArray(data)) return [];

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as number,
    content: (row.content as string) ?? '',
    similarity: (row.similarity as number) ?? 0,
    metadata: {
      documentId: (row.document_id as number) ?? 0,
      documentTitle: (row.document_title as string) ?? 'Unknown Document',
      framework: (row.framework as string) ?? undefined,
      section: (row.section_title as string) ?? undefined,
    },
  }));
}

export async function searchDocuments(
  query: string,
  options: SearchDocumentsOptions = {}
): Promise<SearchDocumentResult[]> {
  try {
    // Primary: try ihos-engine search
    try {
      const engineResults = await searchDocumentsWithEngine(query, options);
      if (engineResults.length > 0) {
        return engineResults;
      }
      // Engine returned empty — fall through to Supabase
      console.warn('[RAG] ihos-engine returned no results, falling back to Supabase RPC');
    } catch (engineErr) {
      console.warn(
        '[RAG] ihos-engine search failed, falling back to Supabase RPC:',
        engineErr instanceof Error ? engineErr.message : engineErr,
      );
    }

    // Fallback: Supabase RPC hybrid search
    return await searchDocumentsWithSupabase(query, options);
  } catch (err) {
    console.error('[RAG] searchDocuments failed:', err instanceof Error ? err.message : err);
    throw err;
  }
}
