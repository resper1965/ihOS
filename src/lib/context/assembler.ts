// src/lib/context/assembler.ts
// Assembles the full context for each chat request:
// agent profile + conversation history + RAG chunks → system prompt

import type { AgentProfile, AssembledContext, RAGChunk } from '@/lib/agents/types';
import { routeToAgent } from '@/lib/agents/intent-router';
import { getMessages } from '@/lib/chat/persistence';
import { searchDocuments } from '@/lib/chat/rag-search';

const MAX_HISTORY_MESSAGES = 10;
const MAX_RAG_CHUNKS = 5;
const RAG_SIMILARITY_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Fetch conversation history from Supabase
// ---------------------------------------------------------------------------

async function fetchConversationHistory(conversationId: string) {
  try {
    const messages = await getMessages(conversationId, MAX_HISTORY_MESSAGES);
    return messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content ?? '',
      }));
  } catch (err) {
    console.warn('[Context] Failed to fetch history:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Fetch RAG chunks via pgvector
// ---------------------------------------------------------------------------

async function fetchRAGChunks(query: string, framework?: string): Promise<RAGChunk[]> {
  try {
    const results = await searchDocuments(query, {
      framework,
      limit: MAX_RAG_CHUNKS,
      threshold: RAG_SIMILARITY_THRESHOLD,
    });
    return results.map((r) => ({
      id: String(r.id),
      content: r.content,
      similarity: r.similarity,
      metadata: {
        documentId: String(r.metadata.documentId),
        documentTitle: r.metadata.documentTitle,
        framework: r.metadata.framework,
        section: r.metadata.section,
      },
    }));
  } catch (err) {
    console.warn('[Context] Failed to fetch RAG chunks:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Build augmented system prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(profile: AgentProfile, ragChunks: RAGChunk[]): string {
  const parts: string[] = [profile.systemPrompt];

  if (ragChunks.length > 0) {
    parts.push('\n\n## Relevant Context (from knowledge base)\n');
    parts.push(
      'The following document excerpts may be relevant. ' +
      'Reference them when applicable but do not fabricate information.\n'
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

  parts.push(`\n\n## Session Metadata\n- Current time: ${new Date().toISOString()}`);
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function assembleContext(
  conversationId: string,
  userMessage: string,
  options?: {
    profileOverride?: AgentProfile;
    tenantId?: string;
    userId?: string;
  }
): Promise<AssembledContext> {
  const { profile, classification } = routeToAgent(userMessage);
  const selectedProfile = options?.profileOverride ?? profile;

  const conversationHistory = await fetchConversationHistory(conversationId);

  const frameworkHint = classification.matchedKeywords.find((kw) =>
    ['soc2', 'iso27001', 'lgpd', 'gdpr', 'nist-csf', 'pci-dss', 'hipaa'].includes(kw)
  );
  const ragChunks = await fetchRAGChunks(userMessage, frameworkHint);

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
