// src/app/api/chat/route.ts
// Next.js API route for the ihOS AI chat system
// Uses Vercel AI SDK streamText with tool calling + Supabase persistence

import { z } from 'zod';
import { streamText, stepCountIs } from 'ai';
import { getOpenAI } from '@/lib/chat/openai';

import { assembleContext } from '@/lib/context/assembler';
import { getToolsForProfile } from '@/lib/agents/tool-registry';
import { getAITelemetry } from '@/lib/chat/ai-telemetry';
import { createClient } from '@/lib/supabase/server';
import {
  createConversation,
  saveMessage,
} from '@/lib/chat/persistence';

export const maxDuration = 60;

const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().optional(),
    parts: z.array(z.any()).optional(),
  })).min(1, 'At least one message is required'),
  conversationId: z.string().uuid().optional(),
  productVersionId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const rawBody = await req.json();
  const parseResult = ChatRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid request body', details: parseResult.error.issues }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const { messages, conversationId: incomingConversationId, productVersionId } = parseResult.data;

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

  if (!lastUserMessage) {
    return new Response(
      JSON.stringify({ error: 'No user message found' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Safe helper to extract text from Vercel AI SDK v4/v6 messages (supports string content or parts array)
  const getMessageText = (msg: any): string => {
    if (!msg) return '';
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.parts)) {
      return msg.parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('\n');
    }
    return '';
  };

  const userMessageText = getMessageText(lastUserMessage);

  // Auth & Persistence
  let conversationId = incomingConversationId ?? '';
  let userId: string | undefined;
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      userId = user.id;

      if (!conversationId) {
        const title = userMessageText.slice(0, 80) +
          (userMessageText.length > 80 ? '…' : '');
        const conversation = await createConversation(user.id, title);
        conversationId = conversation.id;
      }

      await saveMessage(conversationId, 'user', userMessageText);
    } else {
      if (!conversationId) conversationId = crypto.randomUUID();
    }
  } catch (err) {
    console.error('[Chat] Persistence error (non-blocking):', err);
    if (!conversationId) conversationId = crypto.randomUUID();
  }

  // Derive salesChannel from user profile
  let salesChannel: 'B2B_GEHC' | 'B2B_DIRECT' | null = null;
  if (userId) {
    try {
      const { data: userProfile } = await (supabase as any)
        .from('profiles')
        .select('sales_channel')
        .eq('id', userId)
        .single();
      if (userProfile?.sales_channel) {
        salesChannel = userProfile.sales_channel as 'B2B_GEHC' | 'B2B_DIRECT';
      }
    } catch { /* non-blocking */ }
  }

  const context = await assembleContext(
    conversationId,
    userMessageText,
    { userId, productVersionId, salesChannel }
  );

  const openai = await getOpenAI();

  const result = streamText({
    model: openai('gpt-4o'),

    system: context.systemPrompt,
    messages: messages as any,
    tools: await getToolsForProfile(context.profile.id, userId ?? 'anonymous', true) as any,
    stopWhen: stepCountIs(context.profile.maxSteps),
    experimental_telemetry: getAITelemetry(`chat-${context.profile.id}`, {
      agentProfile: context.profile.id,
      conversationId,
    }),

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

      // Mark briefing notifications as read after successful delivery
      if (context.metadata.pendingNotificationIds?.length) {
        try {
          const notifSupabase = await createClient();
          await (notifSupabase as any)
            .from('agent_notifications')
            .update({ read: true })
            .in('id', context.metadata.pendingNotificationIds);
        } catch (notifErr) {
          console.warn('[Chat] Failed to mark notifications as read:', notifErr);
        }
      }
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      'X-Agent-Profile': context.profile.id,
      'X-Conversation-Id': conversationId,
    },
  });
}
