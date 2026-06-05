// src/lib/context/assembler.ts
// Assembles the full context for each chat request:
// agent profile + conversation history + RAG chunks → system prompt

import type { ModelMessage } from 'ai';
import type { AgentProfile, AssembledContext, RAGChunk } from '@/lib/agents/types';
import { routeToAgent } from '@/lib/agents/intent-router';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_HISTORY_MESSAGES = 10;
const MAX_RAG_CHUNKS = 5;
const RAG_SIMILARITY_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Internal: fetch conversation history from Supabase
// ---------------------------------------------------------------------------

async function fetchConversationHistory(
  conversationId: string
): Promise<ModelMessage[]> {
  // TODO: wire to Supabase
  // const supabase = getSupabaseServerClient();
  // const { data } = await supabase
  //   .from('messages')
  //   .select('role, content, tool_calls')
  //   .eq('conversation_id', conversationId)
  //   .order('created_at', { ascending: false })
  //   .limit(MAX_HISTORY_MESSAGES);
  // return (data ?? []).reverse().map(row => ({
  //   role: row.role as 'user' | 'assistant',
  //   content: row.content,
  // }));

  const _id = conversationId; // acknowledge parameter
  // Return empty history until Supabase is wired
  return [];
}

// ---------------------------------------------------------------------------
// Internal: fetch RAG chunks via pgvector similarity search
// ---------------------------------------------------------------------------

async function fetchRAGChunks(
  query: string,
  framework?: string
): Promise<RAGChunk[]> {
  // TODO: wire to Supabase pgvector
  // const supabase = getSupabaseServerClient();
  // const embedding = await generateEmbedding(query);
  // const { data } = await supabase.rpc('match_documents', {
  //   query_embedding: embedding,
  //   match_threshold: RAG_SIMILARITY_THRESHOLD,
  //   match_count: MAX_RAG_CHUNKS,
  //   filter_framework: framework ?? null,
  // });
  // return data ?? [];

  const _query = query;
  const _framework = framework;
  const _threshold = RAG_SIMILARITY_THRESHOLD;
  // Return empty chunks until pgvector is wired
  return [];
}

// ---------------------------------------------------------------------------
// Internal: build the augmented system prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  profile: AgentProfile,
  ragChunks: RAGChunk[]
): string {
  const parts: string[] = [profile.systemPrompt];

  if (ragChunks.length > 0) {
    parts.push('\n\n## Relevant Context (from knowledge base)\n');
    parts.push(
      'The following document excerpts may be relevant to the user\'s question. ' +
      'Reference them when applicable but do not fabricate information beyond what is provided.\n'
    );

    for (const chunk of ragChunks) {
      parts.push(
        `### ${chunk.metadata.documentTitle}` +
        (chunk.metadata.section ? ` — ${chunk.metadata.section}` : '') +
        (chunk.metadata.framework ? ` [${chunk.metadata.framework}]` : '') +
        `\n${chunk.content}\n`
      );
    }
  }

  // Append timestamp for recency-aware responses
  parts.push(`\n\n## Session Metadata\n- Current time: ${new Date().toISOString()}`);

  return parts.join('');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assemble the full context for a chat request.
 *
 * 1. Classify intent → select agent profile
 * 2. Fetch conversation history (last N messages)
 * 3. Fetch RAG chunks via pgvector similarity
 * 4. Build augmented system prompt
 */
export async function assembleContext(
  conversationId: string,
  userMessage: string,
  options?: {
    /** Override the auto-detected profile */
    profileOverride?: AgentProfile;
    /** Tenant ID for multi-tenant isolation */
    tenantId?: string;
    /** Authenticated user ID */
    userId?: string;
  }
): Promise<AssembledContext> {
  // 1. Classify intent (or use override)
  const { profile, classification } = routeToAgent(userMessage);
  const selectedProfile = options?.profileOverride ?? profile;

  // 2. Fetch conversation history
  const conversationHistory = await fetchConversationHistory(conversationId);

  // 3. Fetch RAG chunks
  //    Use the classification to narrow RAG search by framework if relevant
  const frameworkHint = classification.matchedKeywords.find((kw) =>
    ['soc2', 'iso27001', 'lgpd', 'gdpr', 'nist-csf', 'pci-dss', 'hipaa'].includes(kw)
  );
  const ragChunks = await fetchRAGChunks(userMessage, frameworkHint);

  // 4. Build augmented system prompt
  const systemPrompt = buildSystemPrompt(selectedProfile, ragChunks);

  return {
    profile: selectedProfile,
    systemPrompt,
    conversationHistory,
    ragChunks,
    metadata: {
      conversationId,
      tenantId: options?.tenantId,
      userId: options?.userId,
      timestamp: new Date().toISOString(),
    },
  };
}
