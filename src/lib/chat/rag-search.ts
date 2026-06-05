// src/lib/chat/rag-search.ts
import { createClient } from '@/lib/supabase/server';

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
  limit?: number;
  threshold?: number;
}

export async function searchDocuments(
  query: string,
  options: SearchDocumentsOptions = {}
): Promise<SearchDocumentResult[]> {
  const { framework = null, limit = 5, threshold = 0.7 } = options;

  try {
    const supabase = (await createClient()) as any;

    // Note: In production, we'd generate an embedding first via OpenAI.
    // For now, this calls the match_documents RPC which expects a vector.
    // When embeddings aren't available, return empty results.
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: new Array(1536).fill(0), // placeholder embedding
      match_threshold: threshold,
      match_count: limit,
      filter_framework: framework,
    });

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
  } catch (err) {
    console.error('[RAG] searchDocuments failed:', err instanceof Error ? err.message : err);
    throw err;
  }
}
