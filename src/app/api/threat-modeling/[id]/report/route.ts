// src/app/api/threat-modeling/[id]/report/route.ts
// POST — generate a threat model report
// GET  — fetch the latest report for a threat model

import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ihosEngine } from '@/lib/ihos-engine';
import type {
  ThreatModelRecord,
  ThreatModelData,
  ThreatModelReportData,
  ThreatModelReportInsert,
  StrideThreat,
  SeverityLevel,
} from '@/lib/supabase/types';

// ── Helpers ─────────────────────────────────────────────────────────────────

const SEVERITY_TO_IMPACT: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  very_low: 1,
};

const LIKELIHOOD_TO_NUMBER: Record<string, number> = {
  very_high: 5,
  high: 4,
  medium: 3,
  low: 2,
  very_low: 1,
};

function computeRiskRating(criticalCount: number, highCount: number): SeverityLevel {
  if (criticalCount >= 5) return 'critical';
  if (criticalCount >= 3 || highCount >= 5) return 'high';
  if (criticalCount >= 1 || highCount >= 1) return 'medium';
  return 'low';
}

function buildRiskMatrix(threats: StrideThreat[]) {
  const cellMap = new Map<string, { likelihood: number; impact: number; count: number; threat_ids: string[] }>();

  for (const t of threats) {
    const impact = SEVERITY_TO_IMPACT[t.severity] ?? 3;
    const likelihood = LIKELIHOOD_TO_NUMBER[t.likelihood] ?? 3;
    const key = `${likelihood}-${impact}`;

    if (!cellMap.has(key)) {
      cellMap.set(key, { likelihood, impact, count: 0, threat_ids: [] });
    }
    const cell = cellMap.get(key)!;
    cell.count += 1;
    cell.threat_ids.push(t.id);
  }

  return { cells: Array.from(cellMap.values()) };
}

function buildStrideAnalysis(threats: StrideThreat[]) {
  const byCategory: Record<string, { count: number; threats: StrideThreat[] }> = {};

  for (const t of threats) {
    const cat = t.stride_category;
    if (!byCategory[cat]) {
      byCategory[cat] = { count: 0, threats: [] };
    }
    byCategory[cat].count += 1;
    byCategory[cat].threats.push(t);
  }

  return { by_category: byCategory };
}

// ── POST — generate report ──────────────────────────────────────────────────

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  // Fetch the threat model
  const { data: row, error: fetchError } = await admin
    .from('threat_models')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Threat model not found' }, { status: 404 });
  }

  const record = row as unknown as ThreatModelRecord;
  const d: ThreatModelData = record.data;
  const threats = d.threat_model?.threats ?? [];
  const fmeaItems = d.fmea?.items ?? [];
  const gaps = d.gaps ?? [];
  const recommendations = d.recommendations ?? [];

  // Compute metrics
  const totalThreats = threats.length;
  const criticalCount = threats.filter((t) => t.severity === 'critical').length;
  const highCount = threats.filter((t) => t.severity === 'high').length;
  const avgRpn = d.fmea?.summary?.avg_rpn ?? 0;
  const maxRpn = d.fmea?.summary?.max_rpn ?? 0;
  const riskRating = computeRiskRating(criticalCount, highCount);

  // Analytical axis: threats flagged empirically observed by the DefectDojo
  // correlation (stamped on model_data by the generation route).
  const observedThreats = threats.filter((t) => t.empirically_observed === true);
  const empiricalMeta = (d.metadata as Record<string, unknown> | undefined)
    ?.empirical_correlation as
    | { correlated_finding_count?: number; correlation_level?: string }
    | undefined;
  const observedSummary =
    observedThreats.length > 0
      ? {
          observed_threat_count: observedThreats.length,
          correlated_finding_count: empiricalMeta?.correlated_finding_count ?? 0,
          correlation_level: empiricalMeta?.correlation_level ?? 'stride-category',
        }
      : undefined;

  // AI narrative — try engine, fallback to static summary
  let narrative = '';
  let engineEnriched = false;
  let engineNarrative: string | undefined;

  try {
    const gapReport = await ihosEngine.generateGapReport({
      product_version: d.product_version,
      target_frameworks: d.target_frameworks,
    });
    narrative = gapReport.report;
    engineEnriched = true;
    engineNarrative = gapReport.report;
  } catch (err) {
    logger.warn("Engine narrative generation failed, using static summary", {
      context: "threat-modeling/report",
      error: err
    });
    narrative =
      `Threat modeling analysis identified ${totalThreats} threats ` +
      `(${criticalCount} critical, ${highCount} high) with an average RPN of ${avgRpn.toFixed(1)}. ` +
      `${gaps.length} compliance gaps and ${recommendations.length} recommendations were generated.`;
    if (observedSummary) {
      narrative +=
        ` ${observedSummary.observed_threat_count} threat(s) are empirically observed via active runtime findings (category-level correlation).`;
    }
  }

  const reportData: ThreatModelReportData = {
    title: `Threat Model Report — ${d.product_version}`,
    model_id: d.model_id,
    product_version: d.product_version,
    frameworks: d.target_frameworks,
    generated_at: new Date().toISOString(),
    generated_by: user.email ?? user.id,
    status: d.status,

    executive_summary: {
      total_threats: totalThreats,
      critical_count: criticalCount,
      high_count: highCount,
      avg_rpn: avgRpn,
      max_rpn: maxRpn,
      total_gaps: gaps.length,
      recommendations_count: recommendations.length,
      risk_rating: riskRating,
      narrative,
      observed: observedSummary,
    },

    risk_matrix: buildRiskMatrix(threats),
    stride_analysis: buildStrideAnalysis(threats),

    fmea_analysis: {
      items: fmeaItems,
      summary: {
        avg_rpn: avgRpn,
        critical_items: d.fmea?.summary?.critical_count ?? 0,
      },
    },

    gap_analysis: gaps,
    recommendations,

    engine_enriched: engineEnriched,
    engine_narrative: engineNarrative,
  };

  // Insert report
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertError } = await (admin as any)
    .from('threat_model_reports')
    .insert({
      threat_model_id: id,
      title: reportData.title,
      product_version: d.product_version,
      frameworks: d.target_frameworks,
      report_data: reportData,
      status: 'ready',
      generated_by: user.email ?? user.id,
    })
    .select('*')
    .single();

  if (insertError) {
    logger.error("Report insert error", { context: "threat-modeling/report", meta: { error: insertError.message } });
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 });
  }

  return NextResponse.json({ report: inserted });
}

// ── GET — get existing report ───────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('threat_model_reports')
    .select('*')
    .eq('threat_model_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error("Report fetch error", { context: "threat-modeling/report", meta: { error: error.message } });
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 });
  }

  return NextResponse.json({ report: data ?? null });
}
