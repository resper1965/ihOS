// src/lib/integrations/composio.ts
// Composio client singleton + session factory for Vercel AI SDK integration

import { Composio } from '@composio/core';
import { VercelProvider, type VercelToolCollection } from '@composio/vercel';

let composioInstance: Composio<VercelProvider> | null = null;

export function getComposio(): Composio<VercelProvider> | null {
  if (!process.env.COMPOSIO_API_KEY) return null;
  if (!composioInstance) {
    composioInstance = new Composio({
      apiKey: process.env.COMPOSIO_API_KEY,
      provider: new VercelProvider(),
    });
  }
  return composioInstance;
}

/**
 * Creates a Composio session for a user and returns tools
 * compatible with Vercel AI SDK streamText().
 */
export async function getComposioTools(
  userId: string,
  toolkits?: string[]
): Promise<VercelToolCollection | Record<string, never>> {
  const composio = getComposio();
  if (!composio) return {};

  try {
    const session = await composio.create(userId, {
      ...(toolkits && toolkits.length > 0 && { toolkits }),
    });
    return await session.tools();
  } catch (err) {
    console.error('[Composio] Failed to create session:', err);
    return {};
  }
}
