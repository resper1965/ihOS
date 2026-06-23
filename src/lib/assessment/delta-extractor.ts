import { generateObject } from 'ai';
import { getOpenAI } from '@/lib/chat/openai';
import { z } from 'zod';

export const ExtractedDeltaSchema = z.object({
  feature_slug: z.string().describe('Unique lowercase snake_case code for the feature (e.g. oauth2_auth, webrtc_signaling)'),
  description: z.string().describe('Clear, concise summary of what this technical feature/integration does'),
  affected_components: z.array(z.enum(['database', 'network', 'frontend', 'endpoint', 'system'])).describe('Technical components affected by this change'),
  risk_level: z.enum(['low', 'medium', 'high']).describe('Inherent security risk level of this technical change'),
});

export const DeltaExtractorResultSchema = z.object({
  deltas: z.array(ExtractedDeltaSchema).describe('List of technical release deltas extracted from the text'),
});

export type ExtractedDelta = z.infer<typeof ExtractedDeltaSchema>;
export type DeltaExtractorResult = z.infer<typeof DeltaExtractorResultSchema>;

const SYSTEM_PROMPT = `You are a GRC and Software Security Architect.
Your task is to analyze the provided corporate/product documentation (such as architecture designs, SRS, release notes, or security manuals) and identify new technical features, components, integrations, or operational protocols introduced in this product version.

Ignore general boilerplate text, marketing claims, and standard unchanged compliance policies. Focus strictly on active changes, new features, or technical integrations.

For each technical change identified, output:
1. feature_slug: A lowercase snake_case identifier (e.g., "oauth2_integration", "webrtc_p2p_channel").
2. description: A clear 1-2 sentence description.
3. affected_components: An array of impacted areas chosen from: 'database', 'network', 'frontend', 'endpoint', 'system'.
4. risk_level: The security risk profile of this feature (low, medium, high). For instance, new communications tunnels or remote access features are 'high' risk, database changes are 'medium' risk, and simple UI updates are 'low' risk.`;

/**
 * Parses the document text and extracts technical release deltas.
 */
export async function extractDeltasFromDocument(text: string): Promise<ExtractedDelta[]> {
  if (!text || !text.trim()) {
    return [];
  }

  try {
    const openai = await getOpenAI();
    const response = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: DeltaExtractorResultSchema,
      system: SYSTEM_PROMPT,
      prompt: `Analyze the following document text to extract technical features/release deltas:\n\n${text.slice(0, 50000)}`,
    });

    return response.object.deltas || [];
  } catch (err) {
    console.error('[Delta Extractor] Failed to extract deltas:', err);
    return [];
  }
}
