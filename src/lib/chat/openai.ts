import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@/lib/env';
import { getSecret } from '@/lib/supabase/vault';

/**
 * Dynamically resolves the OpenAI API Key from Supabase Vault (with fallback to env)
 * and returns a fresh or cached OpenAI provider instance.
 */
export async function getOpenAI() {
  const apiKey = await getSecret('OPENAI_API_KEY') || env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Missing OpenAI API Key from env or Supabase Vault.');
  }

  return createOpenAI({
    apiKey,
    baseURL: env.OPENAI_BASE_URL || 'https://ai-gateway.vercel.sh/v1',
  });
}
