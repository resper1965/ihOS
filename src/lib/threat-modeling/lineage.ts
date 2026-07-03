// src/lib/threat-modeling/lineage.ts
// The GRC engine returns a loosely-typed threat-model JSON payload; this module
// diffs/annotates that dynamic shape, so `any` is intentional here.
/* eslint-disable @typescript-eslint/no-explicit-any */
// Version-baseline lineage for threat modeling.
//
// The product's threat posture accumulates across versions. When a version
// declares a `previous_version_id`, a newly generated model can be diffed
// against the previous version's approved analysis so the UI can distinguish
// threats inherited (unchanged) from threats genuinely new to this version.
//
// IMPORTANT (honest limitation): the external GRC engine does NOT perform
// incremental generation — it always analyzes the full version. This module
// only performs a POST-HOC diff to label inherited vs. new threats; the
// decision to reuse vs. regenerate lives in the route (delta fingerprint).

import type { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface VersionContext {
  productVersionId: string | null;
  previousVersionId: string | null;
}

/**
 * Resolve the product-version UUID and its declared baseline (previous version)
 * from the human-readable version_code sent by the client.
 */
export async function resolveVersionContext(
  admin: AdminClient,
  productVersionCode: string,
): Promise<VersionContext> {
  // previous_version_id is a newer column not yet in the generated types and
  // may be absent on databases where the lineage migration hasn't been applied
  // yet. Try to read it, but degrade gracefully to just the id so version
  // resolution (and therefore delta caching) keeps working either way.
  const withLineage = await (admin as any)
    .from('product_versions')
    .select('id, previous_version_id')
    .eq('version_code', productVersionCode)
    .maybeSingle();

  if (!withLineage.error) {
    const row = withLineage.data as { id?: string; previous_version_id?: string | null } | null;
    return { productVersionId: row?.id ?? null, previousVersionId: row?.previous_version_id ?? null };
  }

  const base = await admin
    .from('product_versions')
    .select('id')
    .eq('version_code', productVersionCode)
    .maybeSingle();
  const row = base.data as { id?: string } | null;
  return { productVersionId: row?.id ?? null, previousVersionId: null };
}

/**
 * Find the most recent usable (approved > reviewed > any) threat model for a
 * given product-version UUID, to serve as an inheritance baseline.
 */
export async function findBaselineModel(
  admin: AdminClient,
  previousVersionId: string | null,
  targetFrameworks: string[] = [],
): Promise<{ id: string; model_data: Record<string, any> } | null> {
  if (!previousVersionId) return null;

  // Resolve the previous version's version_code (threat_models is keyed by the
  // free-text product_version string, not the UUID).
  const { data: prevVersion } = await admin
    .from('product_versions')
    .select('version_code')
    .eq('id', previousVersionId)
    .maybeSingle();
  const prevCode = (prevVersion as { version_code?: string } | null)?.version_code;
  if (!prevCode) return null;

  const { data: rows } = await admin
    .from('threat_models')
    .select('id, model_data, status, created_at, target_frameworks')
    .eq('product_version', prevCode)
    .order('created_at', { ascending: false });

  let list = (rows ?? []) as unknown as Array<{
    id: string; model_data: Record<string, any>; status: string; target_frameworks?: string[];
  }>;
  if (list.length === 0) return null;

  // Only inherit from a framework-compatible baseline: diffing an ISO 27001
  // baseline against a SOC 2 run would produce misleading inherited/new counts.
  // Prefer rows whose framework set overlaps the request; if none overlap,
  // there is no comparable baseline (treat everything as new).
  if (targetFrameworks.length > 0) {
    const wanted = new Set(targetFrameworks);
    const overlapping = list.filter((r) => (r.target_frameworks ?? []).some((f) => wanted.has(f)));
    if (overlapping.length === 0) return null;
    list = overlapping;
  }

  const byStatus = (s: string) => list.find((r) => String(r.status).toLowerCase().includes(s));
  const chosen = byStatus('approved') ?? byStatus('reviewed') ?? list[0];
  return { id: chosen.id, model_data: chosen.model_data };
}

// Returns null when a threat lacks BOTH identifying fields — such threats are
// never matched as inherited (an empty "::" key would make unrelated blank
// threats collide and look inherited).
function threatKey(t: Record<string, unknown>): string | null {
  const stride = String(t.stride_category ?? t.category ?? '').toLowerCase().trim();
  const component = String(t.affected_component ?? t.component ?? '').toLowerCase().trim();
  if (!stride && !component) return null;
  return `${stride}::${component}`;
}

/**
 * Post-hoc diff: annotate each threat in `generatedData` as inherited (present
 * in the baseline by stride_category + affected_component) or new to this
 * version, and stamp lineage metadata. Returns a shallow-updated copy.
 */
export function annotateInheritance(
  generatedData: Record<string, any>,
  baseline: { id: string; model_data: Record<string, any> } | null,
): { data: Record<string, any>; inheritedCount: number; newCount: number; baselineModelId: string | null } {
  const threats: Record<string, unknown>[] =
    generatedData?.threat_model?.threats ?? [];

  if (!baseline) {
    return { data: generatedData, inheritedCount: 0, newCount: threats.length, baselineModelId: null };
  }

  const baselineThreats: Record<string, unknown>[] =
    baseline.model_data?.threat_model?.threats ?? [];
  // Only non-null keys participate in matching (empty-keyed threats never match).
  const baselineKeys = new Set(baselineThreats.map(threatKey).filter((k): k is string => k !== null));

  let inheritedCount = 0;
  let newCount = 0;
  const annotated = threats.map((t) => {
    const key = threatKey(t);
    const inherited = key !== null && baselineKeys.has(key);
    if (inherited) inheritedCount++;
    else newCount++;
    return {
      ...t,
      is_new: !inherited,
      inherited_from_version: inherited ? baseline.id : null,
    };
  });

  const data = {
    ...generatedData,
    threat_model: { ...generatedData.threat_model, threats: annotated },
    metadata: {
      ...generatedData.metadata,
      baseline_model_id: baseline.id,
      inherited_threat_count: inheritedCount,
      new_threat_count: newCount,
    },
  };

  return { data, inheritedCount, newCount, baselineModelId: baseline.id };
}
