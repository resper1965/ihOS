// src/lib/assessment/corpus-fingerprint.ts
// Cheap, DB-only invalidation signals used to skip redundant RAG/Standard-API
// calls. A fingerprint only changes when the underlying source-of-truth
// (documents or extracted version deltas) actually changes — so callers can
// safely reuse a persisted evaluation until then, minimizing external API usage.

import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

function hash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 16);
}

/**
 * Fingerprint of the published document corpus relevant to a product version
 * (global documents + version-scoped documents). Changes whenever a relevant
 * document is uploaded, reindexed, or updated.
 */
export async function getCorpusFingerprint(productVersionId?: string | null): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('compliance_documents')
    .select('id, product_version_id, updated_at')
    .eq('status', 'published');

  const rows = ((data ?? []) as { id: number; product_version_id: string | null; updated_at: string }[]).filter(
    (d) => d.product_version_id === null || d.product_version_id === productVersionId,
  );

  if (rows.length === 0) return hash('empty');
  const latest = rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), rows[0].updated_at);
  return hash(`${rows.length}:${latest}`);
}

export interface ProductVersionDelta {
  feature_slug: string;
  description: string;
  affected_components: string[];
  risk_level: 'low' | 'medium' | 'high';
  updated_at: string;
}

/**
 * Accumulated technical feature deltas extracted from version documentation,
 * plus a fingerprint that changes only when a delta is added or updated.
 * Threat modeling uses this to re-evaluate only what changed since the last
 * accumulated analysis instead of regenerating from scratch every time.
 */
export async function getDeltaFingerprint(
  productVersionId: string,
): Promise<{ fingerprint: string; deltas: ProductVersionDelta[] }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('product_version_deltas')
    .select('feature_slug, description, affected_components, risk_level, updated_at')
    .eq('product_version_id', productVersionId);

  const deltas = ((data ?? []) as ProductVersionDelta[]).slice().sort((a, b) => a.feature_slug.localeCompare(b.feature_slug));
  const fingerprint = hash(deltas.map((d) => `${d.feature_slug}@${d.updated_at}`).join('|') || 'no-deltas');
  return { fingerprint, deltas };
}
