// src/app/api/threat-modeling/route.ts
// GET  — list threat models (optional ?version= filter)
// POST — generate a new threat model via the GRC engine
//
// The GRC engine returns a loosely-typed JSON payload and several new
// threat_models columns aren't in the generated Supabase types yet, so `any`
// is intentional in this route (same rationale as lineage.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ihosEngine } from '@/lib/ihos-engine';
import { getDeltaFingerprint } from '@/lib/assessment/corpus-fingerprint';
import { resolveVersionContext, findBaselineModel, annotateInheritance } from '@/lib/threat-modeling/lineage';
import { loadActiveFindingsForVersion, annotateEmpiricalConfirmation } from '@/lib/threat-modeling/empirical-correlation';
import type {
  ThreatModelRecord,
  ThreatModelSummary,
} from '@/lib/supabase/types';

export const maxDuration = 300; // generation can take up to 5 min

// ── GET — list threat models ────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const { data: rows, error } = await admin
      .from('threat_models')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      // Table might not exist yet — return empty gracefully
      logger.warn("List query error (table may not exist)", { context: "threat-modeling", meta: { error: error.message } });
      return NextResponse.json({ models: [] });
    }

    const records = (rows ?? []).map((r: any) => {
      const mapped = { ...r, data: r.model_data };
      delete mapped.model_data;
      return mapped as ThreatModelRecord;
    });

    // Optional client-side filter by product_version
    const version = request.nextUrl.searchParams.get('version');

    const models: ThreatModelSummary[] = (records as any[])
      .filter((r) => {
        if (!version) return true;
        const pVersion = r.product_version ?? r.data?.metadata?.product_version ?? r.data?.product_version;
        return pVersion === version;
      })
      .map((r) => {
        const d = r.data as any;
        const versionVal = r.product_version ?? d?.metadata?.product_version ?? d?.product_version ?? 'unknown';
        const statusRaw = r.status ?? d?.metadata?.status ?? d?.status ?? 'draft';
        const cleanStatus = (String(statusRaw).toLowerCase().replace('modelstatus.', '')) as any;

        return {
          id: r.id,
          model_id: d?.model_id ?? d?.id ?? r.id,
          product_version: versionVal,
          status: cleanStatus,
          threat_count: d?.threat_model?.threats?.length ?? 0,
          gap_count: d?.gaps?.length ?? 0,
          recommendation_count: d?.recommendations?.length ?? 0,
          avg_rpn: d?.fmea?.summary?.avg_rpn ?? 0,
          created_at: r.created_at,
        };
      });

    return NextResponse.json({ models });
  } catch (err) {
    logger.warn("List catch error", { context: "threat-modeling", error: err });
    return NextResponse.json({ models: [] });
  }
}

// ── POST — generate new threat model ────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user || !session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = session.access_token;

  let body: {
    product_version?: string;
    target_frameworks?: string[];
    sales_channel?: string | null;
    skip_enrichment?: boolean;
    force_reevaluate?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { product_version, target_frameworks, skip_enrichment, force_reevaluate } = body;

  if (!product_version || typeof product_version !== 'string') {
    return NextResponse.json(
      { error: 'product_version is required and must be a string' },
      { status: 400 },
    );
  }

  if (!Array.isArray(target_frameworks) || target_frameworks.length === 0) {
    return NextResponse.json(
      { error: 'target_frameworks is required and must be a non-empty array' },
      { status: 400 },
    );
  }

  // Commercial context (NPR v3 Moment 1, variable 2): threat models are
  // channel-scoped because Ionic's privacy role differs per channel.
  // NULL = internal aggregate analysis (legacy behavior, still allowed).
  const salesChannel =
    body.sales_channel === 'B2B_GEHC' || body.sales_channel === 'B2B_DIRECT'
      ? body.sales_channel
      : null;
  if (body.sales_channel != null && salesChannel === null) {
    return NextResponse.json(
      { error: 'sales_channel must be "B2B_GEHC" or "B2B_DIRECT" when provided' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Resolve the product version UUID + its declared baseline (previous version).
  // Accumulated feature deltas are keyed by id, not the free-text version_code.
  const { productVersionId, previousVersionId } = await resolveVersionContext(admin, product_version);

  const { fingerprint: deltaFingerprint, deltas, needsReviewCount } = productVersionId
    ? await getDeltaFingerprint(productVersionId)
    : { fingerprint: 'no-product-version-match', deltas: [] as Awaited<ReturnType<typeof getDeltaFingerprint>>['deltas'], needsReviewCount: 0 };

  const sortedFrameworks = [...target_frameworks].sort();

  // ── Accumulated-analysis cache ──────────────────────────────────────────
  // Threat modeling is expensive (LLM + Standard API calls in the external
  // GRC engine). Reuse the last analysis for this product version + framework
  // set until the accumulated product-version deltas actually change, instead
  // of regenerating from scratch on every request.
  if (!force_reevaluate) {
    // Bound the scan: only the most recent rows for this version can be a match
    // (a newer regeneration supersedes older ones). This avoids loading the full
    // history of (large) model_data blobs as a version accumulates regenerations.
    const { data: existingRows } = await admin
      .from('threat_models')
      .select('*')
      .eq('product_version', product_version)
      .order('created_at', { ascending: false })
      .limit(25);

    const existing = ((existingRows ?? []) as any[]).find((row: any) => {
      const rowFrameworks = [...(row.target_frameworks ?? [])].sort();
      const sameFrameworks = JSON.stringify(rowFrameworks) === JSON.stringify(sortedFrameworks);
      const sameDeltas = row.model_data?.metadata?.delta_fingerprint === deltaFingerprint;
      // Channel isolation: a cached GEHC analysis never answers a Direct
      // request (and vice versa). Legacy rows without the column read as
      // NULL and only match channel-less requests.
      const sameChannel = (row.sales_channel ?? row.model_data?.metadata?.sales_channel ?? null) === salesChannel;
      return sameFrameworks && sameDeltas && sameChannel;
    }) as any;

    if (existing) {
      logger.info('Reusing accumulated threat model — no new product-version deltas since last analysis', {
        context: 'threat-modeling',
        meta: { product_version, delta_fingerprint: deltaFingerprint },
      });

      // The documental model is still valid, but the ANALYTICAL axis moves
      // daily: refresh the empirical (DefectDojo) correlation on the cached
      // copy so a finding fixed/opened since the last run is reflected.
      let refreshedData = existing.model_data as Record<string, any>;
      try {
        const findings = await loadActiveFindingsForVersion(admin, productVersionId);
        const { data: correlated } = annotateEmpiricalConfirmation(refreshedData, findings);
        refreshedData = correlated;
        await (admin as any)
          .from('threat_models')
          .update({ model_data: refreshedData })
          .eq('id', existing.id);
      } catch (correlationErr) {
        logger.warn('Empirical correlation refresh failed on cached model', {
          context: 'threat-modeling',
          meta: { error: correlationErr instanceof Error ? correlationErr.message : 'unknown' },
        });
      }

      return NextResponse.json({
        success: true,
        cached: true,
        data: { ...refreshedData, id: existing.id },
      });
    }
  }

  // ── Generate via the Standard/ihos GRC engine — never fabricate results.
  // If the engine is unavailable, that's a coverage gap to resolve externally,
  // not something ihOS should paper over with invented threat data.
  let generatedData: any;
  try {
    console.log('[ThreatModeling] Generating threat model:', {
      product_version,
      target_frameworks,
      skip_enrichment,
      new_deltas: deltas.map((d) => d.feature_slug),
    });

    const result = await ihosEngine.generateThreatModel({
      product_version,
      target_frameworks,
      skip_grc_enrichment: skip_enrichment,
      skip_fmea: true,
      // Mirror of SearchRequest.channel_filter so the engine's RAG pulls the
      // channel's contractual overlay alongside the global/version corpus.
      channel_filter: salesChannel === 'B2B_GEHC' ? 'gehc' : salesChannel === 'B2B_DIRECT' ? 'direct' : undefined,
    }, token);

    // Stripping FMEA fields just in case the external API hasn't implemented skip_fmea yet
    if (result?.threat_model?.threats) {
      result.threat_model.threats = result.threat_model.threats.map((t: any) => {
        const { severity, occurrence, detection, rpn, risk_category, ...pureThreat } = t;
        return pureThreat;
      });
      result.threat_model.fmea_correlations = [];
    }

    generatedData = result as any;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Threat model generation failed';
    logger.error('GRC engine unavailable — refusing to fabricate a threat model', {
      context: 'threat-modeling',
      meta: { message, product_version, target_frameworks },
    });
    return NextResponse.json(
      {
        success: false,
        error: 'GRC_ENGINE_UNAVAILABLE',
        message:
          'The Standard GRC Engine did not return a threat analysis. This is a coverage gap that must be resolved via the external API — ihOS does not invent threat evaluations locally.',
        detail: message,
      },
      { status: 502 },
    );
  }

  // Stamp the delta fingerprint so the next request can tell whether the
  // product actually changed before calling the engine again.
  generatedData = {
    ...generatedData,
    metadata: {
      ...generatedData.metadata,
      delta_fingerprint: deltaFingerprint,
      applied_deltas: deltas.map((d) => d.feature_slug),
      sales_channel: salesChannel,
    } as any,
  };

  // ── Version inheritance ─────────────────────────────────────────────────
  // If this version declares a previous version, diff against its approved
  // analysis so inherited vs. new threats are labelled. The external engine is
  // NOT incremental — this is a post-hoc annotation, not a partial generation.
  const baseline = await findBaselineModel(admin, previousVersionId, target_frameworks, salesChannel);
  const { data: annotatedData, inheritedCount, newCount, baselineModelId } = annotateInheritance(
    generatedData,
    baseline,
  );
  generatedData = annotatedData;

  // ── Empirical correlation (analytical axis) ─────────────────────────────
  // Cross-reference the documental STRIDE model with live DefectDojo
  // findings: threats whose STRIDE category is hit by an active finding's
  // CWE class are flagged empirically observed. Post-hoc annotation only —
  // the engine's generation is untouched.
  const activeFindings = await loadActiveFindingsForVersion(admin, productVersionId);
  const {
    data: empiricallyAnnotated,
    observedThreatCount,
    correlatedFindingCount,
  } = annotateEmpiricalConfirmation(generatedData, activeFindings);
  generatedData = empiricallyAnnotated;

  // ── Coverage-gap warnings (never silently omit) ─────────────────────────
  const warnings: string[] = [];
  if (deltas.length === 0) {
    warnings.push(
      'No product-version deltas were found for this version. Feature-level threat coverage may be incomplete — upload version documentation (SAD/SRS) so new features are extracted, or resolve directly via the external GRC engine.',
    );
  }
  if (needsReviewCount > 0) {
    warnings.push(
      `${needsReviewCount} extracted feature delta(s) were flagged low-confidence and need review. Threat coverage derived from them may be unreliable until confirmed.`,
    );
  }
  if (observedThreatCount > 0) {
    warnings.push(
      `${observedThreatCount} threat(s) are empirically observed: ${correlatedFindingCount} active DefectDojo finding(s) land on the same STRIDE category. Correlation is category-level — confirm the affected component before treating a threat as exploit-confirmed.`,
    );
  }
  if (warnings.length > 0) {
    generatedData = { ...generatedData, limitations: [...(generatedData.limitations ?? []), ...warnings] };
  }

  const modelSource = baselineModelId ? 'inherited' : 'generated';

  // Save the generated model. baseline_model_id/source are newer columns; on
  // databases where the lineage migration hasn't been applied yet, retry with
  // the base columns so generation still succeeds (the inheritance metadata is
  // also embedded in model_data.metadata, so nothing is lost).
  const baseRow = {
    id: crypto.randomUUID(),
    model_data: generatedData,
    product_version: product_version,
    target_frameworks: target_frameworks,
    status: 'draft',
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admins = admin as any;
  let inserted: any;
  let insertError: { message?: string } | null;
  ({ data: inserted, error: insertError } = await admins
    .from('threat_models')
    .insert({ ...baseRow, baseline_model_id: baselineModelId, source: modelSource, sales_channel: salesChannel })
    .select('*')
    .single());

  if (insertError) {
    logger.warn('Threat model insert with lineage/channel columns failed; retrying with base columns (apply 20260702000002 and 20260707000005)', {
      context: 'threat-modeling',
      meta: { error: insertError.message },
    });
    // sales_channel remains recoverable from model_data.metadata on old schemas.
    ({ data: inserted, error: insertError } = await admins
      .from('threat_models')
      .insert(baseRow)
      .select('*')
      .single());
  }

  if (insertError || !inserted) {
    logger.error('Failed to save generated threat model to database', {
      context: 'threat-modeling',
      meta: { error: insertError?.message }
    });
    return NextResponse.json({ error: 'Failed to save threat model to database' }, { status: 500 });
  }

  // Telemetry: prove regeneration was necessary and record inheritance ratio.
  logger.info('Threat model generated', {
    context: 'threat-modeling',
    meta: {
      product_version,
      cached: false,
      source: modelSource,
      delta_count: deltas.length,
      deltas_needing_review: needsReviewCount,
      inherited_threats: inheritedCount,
      new_threats: newCount,
      empirically_observed_threats: observedThreatCount,
      correlated_findings: correlatedFindingCount,
    },
  });

  return NextResponse.json({
    success: true,
    cached: false,
    source: modelSource,
    inherited_threats: inheritedCount,
    new_threats: newCount,
    empirically_observed_threats: observedThreatCount,
    correlated_findings: correlatedFindingCount,
    data: { ...(inserted.model_data as any), id: inserted.id },
  });
}

