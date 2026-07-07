// src/app/api/cron/defectdojo-sync/route.ts
// Periodic sync of DefectDojo findings into the ihOS compliance platform.
//
// This is the ANALYTICAL ("observed moment") posture feed. Each run:
//   1. Pulls active findings per linked DefectDojo product
//      (defectdojo_product_links; falls back to DEFECTDOJO_PRODUCT_ID).
//   2. Resolves each finding onto the SCF spine via scf_framework_mappings
//      (fail-closed: unmapped findings are reported, never guessed).
//   3. Upserts defectdojo_findings and rebuilds runtime_control_signals.
//   4. For SCF controls now observed VIOLATED whose documental verdict is
//      `conforming`, invalidates the control_evaluation_cache entry (forcing
//      re-verification on the next assessment) and notifies admins.
// The documental verdict itself is never rewritten by this route.
//
// runtime_control_signals / defectdojo_product_links are newer than the
// generated Supabase types, so `any` is intentional here (same rationale as
// threat-modeling/route.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { createDefectDojoClient, type DDFinding } from '@/lib/integrations/defectdojo/client';
import { mapFindingToControls } from '@/lib/integrations/defectdojo/mapper';
import { resolveScfMappings, scfControlsForFinding } from '@/lib/integrations/defectdojo/scf-resolver';
import { summarizeSignals, type RuntimeSignal } from '@/lib/posture/observed-status';
import { routeNotification } from '@/lib/integrations/notification-router';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 300;

const PAGE_SIZE = 200;
const MAX_PAGES = 5; // 1,000 findings per product per run

interface SyncTarget {
  ddProductId: number;
  productVersionId: string | null;
}

async function resolveSyncTargets(supabase: any): Promise<SyncTarget[]> {
  const { data, error } = await supabase
    .from('defectdojo_product_links')
    .select('dd_product_id, product_version_id')
    .eq('is_active', true);

  if (!error && data && data.length > 0) {
    return (data as any[]).map((row) => ({
      ddProductId: row.dd_product_id,
      productVersionId: row.product_version_id ?? null,
    }));
  }

  if (error) {
    logger.warn('defectdojo_product_links unavailable, falling back to env', {
      context: 'cron/defectdojo-sync',
      meta: { error: error.message },
    });
  }

  const productIdRaw = process.env.DEFECTDOJO_PRODUCT_ID;
  const productId = productIdRaw ? parseInt(productIdRaw, 10) : NaN;
  return Number.isNaN(productId) ? [] : [{ ddProductId: productId, productVersionId: null }];
}

async function fetchAllActiveFindings(
  ddClient: NonNullable<ReturnType<typeof createDefectDojoClient>>,
  ddProductId: number,
): Promise<{ findings: DDFinding[]; totalFromApi: number }> {
  const findings: DDFinding[] = [];
  let totalFromApi = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await ddClient.getFindings({
      product_id: ddProductId,
      active: true,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    totalFromApi = res.count;
    findings.push(...res.results);
    if (!res.next || res.results.length < PAGE_SIZE) break;
  }

  return { findings, totalFromApi };
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction && !cronSecret) {
      logger.error("CRON_SECRET is missing in production. Aborting.", { context: "cron/defectdojo-sync" });
      return NextResponse.json({ error: 'Internal configuration error' }, { status: 500 });
    }

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── DefectDojo client ───────────────────────────────────────────────────
    const ddClient = createDefectDojoClient();

    if (!ddClient) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'DefectDojo integration not configured. Set DEFECTDOJO_URL and DEFECTDOJO_API_KEY.',
      });
    }

    const supabase = createAdminClient() as any;
    const now = new Date().toISOString();

    const targets = await resolveSyncTargets(supabase);
    if (targets.length === 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'No sync targets: add rows to defectdojo_product_links or set DEFECTDOJO_PRODUCT_ID.',
      });
    }

    // ── Fetch everything first (abort keeps the previous signal set) ────────
    const fetched: Array<{ target: SyncTarget; findings: DDFinding[]; totalFromApi: number }> = [];
    for (const target of targets) {
      const { findings, totalFromApi } = await fetchAllActiveFindings(ddClient, target.ddProductId);
      fetched.push({ target, findings, totalFromApi });
    }

    // ── Resolve the SCF spine once for the whole run ────────────────────────
    const allFindings = fetched.flatMap((f) => f.findings);
    const mappedByFindingId = new Map<number, ReturnType<typeof mapFindingToControls>>();
    const isoControls: string[] = [];
    const nistControls: string[] = [];
    for (const finding of allFindings) {
      const mapped = mapFindingToControls(finding);
      mappedByFindingId.set(finding.id, mapped);
      isoControls.push(...mapped.controlCodes);
      nistControls.push(...mapped.nistControls);
    }

    const resolution = await resolveScfMappings(supabase, isoControls, nistControls);

    // ── Upsert findings + build the new runtime signal set ──────────────────
    const upsertRows: Array<Record<string, unknown>> = [];
    const signalRows: Array<Record<string, unknown>> = [];
    let unmappedFindings = 0;

    for (const { target, findings } of fetched) {
      for (const finding of findings) {
        const mapped = mappedByFindingId.get(finding.id)!;
        const scfControls = scfControlsForFinding(resolution, mapped.controlCodes, mapped.nistControls);
        if (scfControls.length === 0) unmappedFindings++;

        upsertRows.push({
          dd_finding_id: finding.id,
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          active: finding.active,
          verified: finding.verified,
          is_mitigated: finding.is_mitigated,
          mitigation: finding.mitigation,
          cwe: finding.cwe,
          cvssv3: finding.cvssv3,
          risk_accepted: finding.risk_accepted,
          sla_days_remaining: finding.sla_days_remaining,
          mapped_iso_controls: mapped.controlCodes,
          mapped_soc_criteria: mapped.socCriteria,
          mapped_nist_controls: mapped.nistControls,
          mapped_scf_controls: scfControls,
          product_version_id: target.productVersionId,
          dd_created_at: finding.created,
          synced_at: now,
        });

        for (const scfCode of scfControls) {
          signalRows.push({
            scf_control_code: scfCode,
            product_version_id: target.productVersionId,
            source: 'defectdojo',
            source_ref: String(finding.id),
            title: finding.title,
            severity: finding.severity,
            active: finding.active,
            verified: finding.verified,
            risk_accepted: finding.risk_accepted,
            is_mitigated: finding.is_mitigated,
            observed_at: finding.created,
            synced_at: now,
          });
        }
      }
    }

    if (upsertRows.length > 0) {
      const { error: upsertError } = await supabase
        .from('defectdojo_findings')
        .upsert(upsertRows, { onConflict: 'dd_finding_id' });
      if (upsertError) {
        throw new Error(`Supabase upsert failed: ${upsertError.message}`);
      }
    }

    // Findings that disappeared from the active feed were resolved/closed in
    // DefectDojo — flip them inactive so the posture doesn't show stale risk.
    const activeIds = allFindings.map((f) => f.id);
    let deactivated = 0;
    {
      let staleQuery = supabase
        .from('defectdojo_findings')
        .update({ active: false, synced_at: now })
        .eq('active', true);
      if (activeIds.length > 0) {
        staleQuery = staleQuery.not('dd_finding_id', 'in', `(${activeIds.join(',')})`);
      }
      const { data: staleRows, error: staleError } = await staleQuery.select('dd_finding_id');
      if (staleError) {
        logger.warn('Failed to deactivate stale findings', {
          context: 'cron/defectdojo-sync',
          meta: { error: staleError.message },
        });
      } else {
        deactivated = staleRows?.length ?? 0;
      }
    }

    // ── Rebuild the DefectDojo slice of runtime_control_signals ─────────────
    // All fetches succeeded, so a full rebuild is safe and keeps the stream
    // exactly in step with the source (mitigations, closures, acceptances).
    let signalsRebuilt = false;
    {
      const { error: deleteError } = await supabase
        .from('runtime_control_signals')
        .delete()
        .eq('source', 'defectdojo');

      if (deleteError) {
        // Table may not exist yet (migration pending) — findings are still
        // synced above; the observed axis just stays empty.
        logger.warn('runtime_control_signals rebuild skipped (apply 20260707000001)', {
          context: 'cron/defectdojo-sync',
          meta: { error: deleteError.message },
        });
      } else if (signalRows.length > 0) {
        const { error: insertError } = await supabase
          .from('runtime_control_signals')
          .insert(signalRows);
        if (insertError) {
          throw new Error(`runtime_control_signals insert failed: ${insertError.message}`);
        }
        signalsRebuilt = true;
      } else {
        signalsRebuilt = true;
      }
    }

    // ── Observed posture: find violated controls ────────────────────────────
    const { violated, degraded } = summarizeSignals(signalRows as unknown as RuntimeSignal[]);
    const violatedCodes = violated.map((v) => v.scfControlCode);

    // ── Cross-axis trigger: documentally `conforming` but observed violated ─
    // Invalidate those cache entries (next assessment re-verifies with fresh
    // evidence) and alert admins. Controls already known as gaps stay as-is.
    let invalidatedCacheRows = 0;
    const conflictingControls: string[] = [];

    if (violatedCodes.length > 0) {
      const { data: cacheRows } = await supabase
        .from('control_evaluation_cache')
        .select('id, control_code, evaluation')
        .in('control_code', violatedCodes);

      const conflicting = ((cacheRows ?? []) as any[]).filter(
        (row) => row.evaluation?.combinedStatus === 'conforming',
      );

      if (conflicting.length > 0) {
        conflictingControls.push(...new Set(conflicting.map((r) => r.control_code as string)));
        const { error: invalidateError } = await supabase
          .from('control_evaluation_cache')
          .delete()
          .in('id', conflicting.map((r) => r.id));
        if (invalidateError) {
          logger.warn('Cache invalidation failed', {
            context: 'cron/defectdojo-sync',
            meta: { error: invalidateError.message },
          });
        } else {
          invalidatedCacheRows = conflicting.length;
        }
      }
    }

    // One summary notification per run (not per finding) to admin operators.
    let notifiedUsers = 0;
    if (conflictingControls.length > 0) {
      const hasCritical = violated.some((v) => v.criticalOrHigh > 0);
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'ionic_user']);

      for (const admin of (admins ?? []) as Array<{ id: string }>) {
        await routeNotification({
          userId: admin.id,
          type: 'runtime_posture_violation',
          title: 'Runtime findings contradict documented posture',
          content:
            `DefectDojo sync found active Critical/High findings on ${conflictingControls.length} SCF control(s) ` +
            `currently rated conforming in documentation: ${conflictingControls.join(', ')}. ` +
            `Their cached evaluations were invalidated — the next assessment will re-verify them.`,
          severity: hasCritical ? 'critical' : 'high',
          metadata: { controls: conflictingControls, source: 'defectdojo' },
        });
        notifiedUsers++;
      }
    }

    // ── Severity summary + sync log ─────────────────────────────────────────
    const severityCounts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 };
    for (const finding of allFindings) {
      severityCounts[finding.severity] = (severityCounts[finding.severity] ?? 0) + 1;
    }

    await supabase.from('integration_sync_log').insert({
      provider: 'defectdojo',
      sync_type: 'findings',
      items_processed: allFindings.length,
      items_created: signalRows.length,
      items_updated: deactivated,
      errors: unmappedFindings > 0
        ? [{ type: 'unmapped_findings', count: unmappedFindings, unmapped_framework_controls: resolution.unmappedControls }]
        : [],
      duration_ms: Date.now() - startedAt,
    });

    return NextResponse.json({
      success: true,
      timestamp: now,
      targets: targets.map((t) => ({ dd_product_id: t.ddProductId, product_version_id: t.productVersionId })),
      total_synced: allFindings.length,
      deactivated_findings: deactivated,
      severity_counts: severityCounts,
      scf: {
        signals_written: signalRows.length,
        signals_rebuilt: signalsRebuilt,
        unmapped_findings: unmappedFindings,
        unmapped_framework_controls: resolution.unmappedControls,
      },
      observed_posture: {
        violated_controls: violatedCodes,
        degraded_controls: degraded.map((d) => d.scfControlCode),
        conflicting_conforming_controls: conflictingControls,
        invalidated_cache_rows: invalidatedCacheRows,
        notified_users: notifiedUsers,
      },
    });
  } catch (err) {
    logger.error("DefectDojo sync failed", { context: "cron/defectdojo-sync", error: err });
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
