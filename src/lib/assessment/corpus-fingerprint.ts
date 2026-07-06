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
  // Hash a stable per-row signature (id@updated_at), not just count + max
  // timestamp: a replacement (one doc removed, another added with an older
  // updated_at) can leave count and max unchanged, which would wrongly keep the
  // fingerprint identical and serve stale cached evaluations.
  const docSignature = rows.map((r) => `${r.id}@${r.updated_at}`).sort().join('|');

  // Include control provenance count so that re-tagging (without document
  // changes) also invalidates cached evaluations.
  const docIds = rows.map((r) => r.id);
  const { count: provCount } = await (admin as any)
    .from('document_control_provenance')
    .select('id', { count: 'exact', head: true })
    .in('document_id', docIds);

  const signature = `${docSignature}|prov:${provCount ?? 0}`;
  return hash(signature);
}

export interface ProductVersionDelta {
  feature_slug: string;
  description: string;
  affected_components: string[];
  risk_level: 'low' | 'medium' | 'high';
  updated_at: string;
  needs_review?: boolean;
  extraction_confidence?: number | null;
}

/**
 * Accumulated technical feature deltas extracted from version documentation,
 * plus a fingerprint that changes only when a delta is added or updated.
 * Threat modeling uses this to re-evaluate only what changed since the last
 * accumulated analysis instead of regenerating from scratch every time.
 *
 * `needsReviewCount` counts deltas the extractor flagged as low-confidence,
 * so callers can warn that the delta ledger itself may be incomplete/noisy.
 */
export async function getDeltaFingerprint(
  productVersionId: string,
): Promise<{ fingerprint: string; deltas: ProductVersionDelta[]; needsReviewCount: number }> {
  const admin = createAdminClient();
  // Tolerate older schemas where needs_review/extraction_confidence don't
  // exist yet: request them, but fall back to the base columns on error.
  let rows: ProductVersionDelta[] = [];
  // needs_review/extraction_confidence are newer columns not yet in the
  // generated types; cast and gracefully fall back on older schemas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withReview = await (admin as any)
    .from('product_version_deltas')
    .select('feature_slug, description, affected_components, risk_level, updated_at, needs_review, extraction_confidence')
    .eq('product_version_id', productVersionId);
  if (withReview.error) {
    const base = await admin
      .from('product_version_deltas')
      .select('feature_slug, description, affected_components, risk_level, updated_at')
      .eq('product_version_id', productVersionId);
    rows = (base.data ?? []) as unknown as ProductVersionDelta[];
  } else {
    rows = (withReview.data ?? []) as ProductVersionDelta[];
  }

  const deltas = rows.slice().sort((a, b) => a.feature_slug.localeCompare(b.feature_slug));
  const fingerprint = hash(deltas.map((d) => `${d.feature_slug}@${d.updated_at}`).join('|') || 'no-deltas');
  const needsReviewCount = deltas.filter((d) => d.needs_review === true).length;
  return { fingerprint, deltas, needsReviewCount };
}
