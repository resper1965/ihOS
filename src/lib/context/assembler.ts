// src/lib/context/assembler.ts
// Assembles the full context for each chat request:
// agent profile + conversation history + RAG chunks + agentic triggers/briefing → system prompt

import type { AgentProfile, AssembledContext, RAGChunk } from '@/lib/agents/types';
import { routeToAgent } from '@/lib/agents/intent-router';
import { getMessages } from '@/lib/chat/persistence';
import { searchDocuments } from '@/lib/chat/rag-search';
import { createClient } from '@/lib/supabase/server';
import { getAllOrgStates } from '@/lib/agents/org-state';

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

async function fetchRAGChunks(
  query: string,
  framework?: string,
  productVersionId?: string,
  categories?: string[] | null,
): Promise<RAGChunk[]> {
  try {
    const results = await searchDocuments(query, {
      framework,
      productVersionId,
      categories: categories ?? undefined,
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

function buildSystemPrompt(
  profile: AgentProfile,
  ragChunks: RAGChunk[],
  briefingContext = '',
  learningContext = '',
  orgStateContext = '',
  autonomyContext = ''
): string {
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

  if (briefingContext) {
    parts.push(briefingContext);
  }

  if (learningContext) {
    parts.push(learningContext);
  }

  if (orgStateContext) {
    parts.push(orgStateContext);
  }

  if (autonomyContext) {
    parts.push(autonomyContext);
  }

  parts.push(`\n\n## Session Metadata\n- Current time: ${new Date().toISOString()}`);
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function assembleContext(
  conversationId: string,
  userMessage: string = '',
  options?: {
    profileOverride?: AgentProfile;
    tenantId?: string;
    userId?: string;
    productVersionId?: string;
    salesChannel?: 'B2B_GEHC' | 'B2B_DIRECT' | null;
  }
): Promise<AssembledContext> {
  const { profile, classification } = routeToAgent(userMessage);
  const selectedProfile = options?.profileOverride ?? profile;

  const conversationHistory = await fetchConversationHistory(conversationId);

  const frameworkHint = classification.matchedKeywords.find((kw) =>
    ['soc2', 'iso27001', 'lgpd', 'gdpr', 'nist-csf', 'pci-dss', 'hipaa'].includes(kw)
  );

  // Derive allowed categories from the sales channel
  // Mirrors logic from assessment engine (engine.ts lines 121-127)
  let ragCategories: string[] | null = null;
  const channel = options?.salesChannel;
  if (channel === 'B2B_GEHC') {
    ragCategories = ['ISMS_CORE', 'OPERATIONAL', 'B2B_GEHC'];
  } else if (channel === 'B2B_DIRECT') {
    ragCategories = ['ISMS_CORE', 'OPERATIONAL', 'B2B_DIRECT'];
  }
  // If no channel context (null/undefined), ragCategories stays null → all categories

  const ragChunks = await fetchRAGChunks(userMessage, frameworkHint, options?.productVersionId, ragCategories);

  // Agentic evolution contexts
  let briefingContext = '';
  let learningContext = '';
  let orgStateContext = '';
  let autonomyContext = '';
  let pendingNotifIds: string[] = [];

  const userId = options?.userId;
  if (userId) {
    try {
      const supabase = await createClient();

      // 1. Briefing Loop: Detect new session or inactivity > 1 hour
      const rawMessages = await getMessages(conversationId, 1);
      const isNewSession = rawMessages.length === 0;
      let isInactive = false;
      if (!isNewSession && rawMessages[0].created_at) {
        const lastMessageTime = new Date(rawMessages[0].created_at).getTime();
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        isInactive = lastMessageTime < oneHourAgo;
      }

      if (isNewSession || isInactive) {
        const { data: notifications } = await supabase
          .from('agent_notifications')
          .select('*')
          .eq('user_id', userId)
          .eq('read', false)
          .order('created_at', { ascending: false });

        if (notifications && notifications.length > 0) {
          briefingContext = `\n\n## [PROACTIVE BRIEFING CONTEXT]\nYou have the following unread compliance notifications about the organization. Inform the user in a friendly manner at the beginning of your response:\n`;
          notifications.forEach((n: any) => {
            briefingContext += `- [${n.type.toUpperCase()}] ${n.title}: ${n.content}\n`;
          });
          briefingContext += `\nInstruction: Treat these compliance items proactively. Help the user resolve them.\n`;

          // Defer mark-as-read to onFinish in route.ts for reliable delivery
          pendingNotifIds = notifications.map((n: any) => n.id);
        }
      }

      // 2. Learning Loop: Fetch user feedback corrections
      const { data: corrections } = await supabase
        .from('agent_learning_corrections')
        .select('user_correction, agent_misaligned_response')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (corrections && corrections.length > 0) {
        learningContext = `\n\n## [INSTRUCTIONS FROM USER CORRECTIONS]\nAvoid repeating the following misalignments detected in previous user interactions:\n`;
        corrections.forEach((c: any) => {
          learningContext += `- User Correction: "${c.user_correction}" (Avoid responding as: "${c.agent_misaligned_response}")\n`;
        });
      }

      // 3. Org State: Fetch active organizational maturity/state vars
      const orgStates = await getAllOrgStates(userId);
      if (orgStates && orgStates.length > 0) {
        orgStateContext = `\n\n## [ORGANIZATIONAL STATE]\nConsider the following active organizational context information in your analysis:\n`;
        orgStates.forEach((os) => {
          orgStateContext += `- ${os.state_key}: ${JSON.stringify(os.state_value)}\n`;
        });
      }

      // 4. Autonomy Boundaries: Fetch active autonomy parameters for the user
      const { data: boundaries } = await supabase
        .from('agent_autonomy_boundaries')
        .select('action_type, zone')
        .eq('user_id', userId);

      if (boundaries && boundaries.length > 0) {
        autonomyContext = `\n\n## [AUTONOMY BOUNDARIES]\nYou operate under the following strict security autonomy rules. Respect the restrictions below and ask for permission in the chat BEFORE triggering YELLOW actions:\n`;
        boundaries.forEach((b: any) => {
          const zoneExplanation = b.zone === 'green'
            ? 'GREEN (Fully autonomous execution authorized).'
            : b.zone === 'yellow'
            ? 'YELLOW (Requires user approval. You MUST ask the user before calling this tool and set confirmed=true only with explicit consent).'
            : 'RED (PROHIBITED. Do not execute under any circumstances and explain this restriction in your response).';
          autonomyContext += `- Action "${b.action_type}": ${zoneExplanation}\n`;
        });
      }
    } catch (err) {
      console.warn('[Context] Failed to load agentic evolution parameters:', err instanceof Error ? err.message : err);
    }
  }

  const systemPrompt = buildSystemPrompt(
    selectedProfile,
    ragChunks,
    briefingContext,
    learningContext,
    orgStateContext,
    autonomyContext
  );

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
      pendingNotificationIds: pendingNotifIds,
    },
  };
}
