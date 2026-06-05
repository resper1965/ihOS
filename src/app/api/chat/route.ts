// src/app/api/chat/route.ts
// Next.js API route for the ihOS AI chat system
// Uses Vercel AI SDK streamText with tool calling + Supabase persistence

import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { assembleContext } from '@/lib/context/assembler';
import { agentTools } from '@/lib/agents/tools';
import { createClient } from '@/lib/supabase/server';
import {
  createConversation,
  saveMessage,
} from '@/lib/chat/persistence';

export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json();

  const {
    messages,
    conversationId: incomingConversationId,
  }: {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    conversationId?: string;
  } = body;

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

  if (!lastUserMessage) {
    return new Response(
      JSON.stringify({ error: 'No user message found' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Auth & Persistence
  let conversationId = incomingConversationId ?? '';
  let userId: string | undefined;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      userId = user.id;

      if (!conversationId) {
        const title = lastUserMessage.content.slice(0, 80) +
          (lastUserMessage.content.length > 80 ? '…' : '');
        const conversation = await createConversation(user.id, title);
        conversationId = conversation.id;
      }

      await saveMessage(conversationId, 'user', lastUserMessage.content);
    }
  } catch (err) {
    console.error('[Chat] Persistence error (non-blocking):', err);
    if (!conversationId) conversationId = crypto.randomUUID();
  }

  const context = await assembleContext(
    conversationId,
    lastUserMessage.content,
    { userId }
  );

  const result = streamText({
    model: openai('gpt-4o'),
    system: context.systemPrompt,
    messages,
    tools: agentTools,

    onStepFinish: async ({ toolCalls }) => {
      if (toolCalls && toolCalls.length > 0) {
        console.log(
          `[ihOS Audit] conversation=${conversationId} agent=${context.profile.id} tools=${toolCalls.map((t) => t.toolName).join(',')}`
        );
      }
    },

    onFinish: async ({ text, toolCalls }) => {
      try {
        if (userId && conversationId && text) {
          const toolCallData = toolCalls && toolCalls.length > 0
            ? toolCalls.map((tc: any) => ({ toolName: tc.toolName, args: tc.args }))
            : undefined;
          await saveMessage(
            conversationId, 'assistant', text,
            toolCallData as Record<string, unknown>[] | undefined
          );
        }
      } catch (err) {
        console.error('[Chat] Failed to persist assistant message:', err);
      }
    },
  });

  return result.toTextStreamResponse({
    headers: {
      'X-Agent-Profile': context.profile.id,
      'X-Conversation-Id': conversationId,
    },
  });
}
