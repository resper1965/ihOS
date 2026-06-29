// src/app/api/cron/defectdojo-sync/route.ts
// Periodic sync of DefectDojo findings into the ihOS compliance platform.

import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { createDefectDojoClient } from '@/lib/integrations/defectdojo/client';
import { mapFindingToControls } from '@/lib/integrations/defectdojo/mapper';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 120;

export async function GET(req: Request) {
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

    const productIdRaw = process.env.DEFECTDOJO_PRODUCT_ID;
    const productId = productIdRaw ? parseInt(productIdRaw, 10) : undefined;

    if (!productId || isNaN(productId)) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: 'DEFECTDOJO_PRODUCT_ID is not set or invalid. Sync skipped.',
      });
    }

    // ── Fetch findings ──────────────────────────────────────────────────────
    const findingsResponse = await ddClient.getFindings({
      product_id: productId,
      active: true,
      limit: 200,
    });

    const findings = findingsResponse.results;
    const supabase = createAdminClient() as any;
    const now = new Date().toISOString();

    // ── Map & upsert ────────────────────────────────────────────────────────
    const upsertRows: Array<Record<string, unknown>> = [];

    for (const finding of findings) {
      const mapped = mapFindingToControls(finding);

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
        dd_created_at: finding.created,
        synced_at: now,
      });
    }

    if (upsertRows.length > 0) {
      const { error: upsertError } = await supabase
        .from('defectdojo_findings')
        .upsert(upsertRows, { onConflict: 'dd_finding_id' });

      if (upsertError) {
        throw new Error(`Supabase upsert failed: ${upsertError.message}`);
      }
    }

    // ── Build severity summary ──────────────────────────────────────────────
    const severityCounts: Record<string, number> = {
      Critical: 0,
      High: 0,
      Medium: 0,
      Low: 0,
      Info: 0,
    };

    for (const finding of findings) {
      severityCounts[finding.severity] = (severityCounts[finding.severity] ?? 0) + 1;
    }

    return NextResponse.json({
      success: true,
      timestamp: now,
      product_id: productId,
      total_synced: findings.length,
      severity_counts: severityCounts,
      total_from_api: findingsResponse.count,
    });
  } catch (err) {
    logger.error("DefectDojo sync failed", { context: "cron/defectdojo-sync", error: err });
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
