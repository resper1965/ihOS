import { createOpenAI } from '@ai-sdk/openai';
import { env } from '@/lib/env';

/**
 * Custom OpenAI provider instance configured to use Vercel AI Gateway
 * when OPENAI_BASE_URL is specified or defaults to the standard endpoint.
 */
export const openai = createOpenAI({
  apiKey: env.OPENAI_API_KEY,
  baseURL: env.OPENAI_BASE_URL || 'https://ai-gateway.vercel.sh/v1',
});
