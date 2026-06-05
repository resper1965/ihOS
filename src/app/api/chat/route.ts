// src/app/api/chat/route.ts
// Next.js API route for the ihOS AI chat system
// Uses Vercel AI SDK streamText with tool calling

import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { assembleContext } from '@/lib/context/assembler';
import { agentTools } from '@/lib/agents/tools';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const body = await req.json();

  const {
    messages,
    conversationId = crypto.randomUUID(),
  }: {
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    conversationId?: string;
  } = body;

  // Get the last user message for intent classification
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'user');

  if (!lastUserMessage) {
    return new Response(
      JSON.stringify({ error: 'No user message found' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Assemble context: classify intent → profile → system prompt + RAG
  const context = await assembleContext(
    conversationId,
    lastUserMessage.content
  );

  // Stream the response using Vercel AI SDK
  const result = streamText({
    model: openai('gpt-4o'),
    system: context.systemPrompt,
    messages,
    tools: agentTools,

    // Callback: log tool calls for audit trail
    onStepFinish: async ({ toolCalls }) => {
      if (toolCalls && toolCalls.length > 0) {
        console.log(
          `[ihOS Audit] conversation=${conversationId} agent=${context.profile.id} tools=${toolCalls.map((t) => t.toolName).join(',')}`
        );
      }
    },
  });

  // Return the streaming response compatible with useChat
  return result.toTextStreamResponse({
    headers: {
      'X-Agent-Profile': context.profile.id,
      'X-Conversation-Id': conversationId,
    },
  });
}
