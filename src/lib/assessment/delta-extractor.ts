import { generateObject } from 'ai';
import { getOpenAI } from '@/lib/chat/openai';
import { z } from 'zod';

export const ExtractedDeltaSchema = z.object({
  feature_slug: z.string().describe('Unique lowercase snake_case code for the feature (e.g. oauth2_auth, webrtc_signaling)'),
  description: z.string().describe('Clear, concise summary of what this technical feature/integration does'),
  affected_components: z.array(z.enum(['database', 'network', 'frontend', 'endpoint', 'system'])).describe('Technical components affected by this change'),
  risk_level: z.enum(['low', 'medium', 'high']).describe('Inherent security risk level of this technical change'),
  confidence: z.number().min(0).max(1).describe('Your confidence (0.0-1.0) that this is a REAL, concrete technical feature delta introduced in this version — not boilerplate, marketing, or an unchanged policy. Use <0.6 when uncertain.'),
});

export const DeltaExtractorResultSchema = z.object({
  deltas: z.array(ExtractedDeltaSchema).describe('List of technical release deltas extracted from the text'),
});

export type ExtractedDelta = z.infer<typeof ExtractedDeltaSchema>;
export type DeltaExtractorResult = z.infer<typeof DeltaExtractorResultSchema>;

/** Deltas extracted with confidence below this threshold are flagged needs_review. */
export const DELTA_REVIEW_THRESHOLD = 0.6;

/**
 * Upsert extracted deltas for a product version. Writes the richer columns
 * (extraction_confidence/needs_review/source_document_id) when the schema has
 * them, and transparently falls back to the base columns on databases where
 * the lineage migration hasn't been applied yet — so the delta ledger (which
 * drives threat-model cache invalidation) is never silently lost.
 *
 * `admin` is a Supabase admin client; typed loosely to avoid coupling to the
 * generated types for the newer columns.
 */
export async function persistDeltas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  productVersionId: string,
  deltas: ExtractedDelta[],
  sourceDocumentId?: number | null,
): Promise<{ error: string | null; degraded: boolean }> {
  if (!deltas || deltas.length === 0) return { error: null, degraded: false };

  const richRows = deltas.map((d) => ({
    product_version_id: productVersionId,
    feature_slug: d.feature_slug,
    description: d.description,
    affected_components: d.affected_components,
    risk_level: d.risk_level,
    extraction_confidence: d.confidence,
    needs_review: d.confidence < DELTA_REVIEW_THRESHOLD,
    source_document_id: sourceDocumentId ?? null,
  }));

  const rich = await admin
    .from('product_version_deltas')
    .upsert(richRows, { onConflict: 'product_version_id,feature_slug' });
  if (!rich.error) return { error: null, degraded: false };

  // Older schema without the confidence/review/source columns: retry base cols.
  const baseRows = deltas.map((d) => ({
    product_version_id: productVersionId,
    feature_slug: d.feature_slug,
    description: d.description,
    affected_components: d.affected_components,
    risk_level: d.risk_level,
  }));
  const base = await admin
    .from('product_version_deltas')
    .upsert(baseRows, { onConflict: 'product_version_id,feature_slug' });
  return { error: base.error?.message ?? null, degraded: true };
}

const SYSTEM_PROMPT = `You are a GRC and Software Security Architect.
Your task is to analyze the provided corporate/product documentation (such as architecture designs, SRS, release notes, or security manuals) and identify new technical features, components, integrations, or operational protocols introduced in this product version.

Ignore general boilerplate text, marketing claims, and standard unchanged compliance policies. Focus strictly on active changes, new features, or technical integrations.

For each technical change identified, output:
1. feature_slug: A lowercase snake_case identifier (e.g., "oauth2_integration", "webrtc_p2p_channel").
2. description: A clear 1-2 sentence description.
3. affected_components: An array of impacted areas chosen from: 'database', 'network', 'frontend', 'endpoint', 'system'.
4. risk_level: The security risk profile of this feature (low, medium, high). For instance, new communications tunnels or remote access features are 'high' risk, database changes are 'medium' risk, and simple UI updates are 'low' risk.
5. confidence: Your confidence from 0.0 to 1.0 that this is a genuine, concrete technical delta (not boilerplate/marketing/unchanged policy). Be honest — use a value below 0.6 when the text is ambiguous.`;

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
