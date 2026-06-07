// src/app/api/compliance/report/route.ts
// Returns the full gap analysis report as JSON
// Aggregates all data from evidence_evaluations + intelligence_snapshots

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getFrameworkScores,
  getEvaluationSummary,
  getTopGaps,
  getRoiPath,
  getDomainBreakdown,
} from "@/lib/data/compliance-data";
import type { RoiItem } from "@/lib/data/compliance-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const list = searchParams.get("list") === "true";

    const supabase = createAdminClient();

    if (list) {
      // Return a list of all pre-generated full_report snapshots
      const { data: reports, error: listError } = await supabase
        .from("intelligence_snapshots")
        .select("id, framework_code, created_at, metadata")
        .eq("snapshot_type", "full_report")
        .order("created_at", { ascending: false });

      if (listError) {
        throw listError;
      }

      return NextResponse.json({
        success: true,
        data: reports.map((r) => ({
          id: r.id.toString(), // Convert BigInt to string for safety in JSON
          title: (r.metadata as any)?.title || `Relatório de Conformidade ${r.framework_code}`,
          framework: r.framework_code || "Múltiplos Frameworks",
          createdAt: r.created_at,
          type: (r.metadata as any)?.type || "Gap Analysis",
          status: (r.metadata as any)?.status || "ready",
        })),
      });
    }

    // Try to fetch a pre-generated full_report snapshot first
    const { data: fullReport, error: reportError } = await supabase
      .from("intelligence_snapshots")
      .select("*")
      .eq("snapshot_type", "full_report")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!reportError && fullReport?.snapshot_data) {
      return NextResponse.json({
        source: "database",
        generatedAt: fullReport.created_at,
        metadata: fullReport.metadata,
        report: fullReport.snapshot_data,
      });
    }

    // Aggregate from evidence_evaluations
    const { data: evaluations, error: evalError } = await supabase
      .from("evidence_evaluations")
      .select("*")
      .order("confidence_score", { ascending: true });

    if (!evalError && evaluations && evaluations.length > 0) {
      // Compute summary
      const total = evaluations.length;
      const compliant = evaluations.filter((e) => e.is_compliant).length;
      const nonCompliant = total - compliant;
      const avgConfidence =
        Math.round(
          (evaluations.reduce((sum, e) => sum + (e.confidence_score ?? 0), 0) /
            total) *
            10
        ) / 10;

      // Build domain breakdown
      const domainMap = new Map<
        string,
        { total: number; compliant: number }
      >();
      for (const e of evaluations) {
        const d = domainMap.get(e.domain_code) ?? { total: 0, compliant: 0 };
        d.total++;
        if (e.is_compliant) d.compliant++;
        domainMap.set(e.domain_code, d);
      }

      const domains = Array.from(domainMap.entries()).map(
        ([domain, stats]) => ({
          domain,
          total: stats.total,
          compliant: stats.compliant,
          rate: Math.round((stats.compliant / stats.total) * 100),
        })
      );

      // Top gaps (non-compliant, lowest confidence)
      const gaps = evaluations
        .filter((e) => !e.is_compliant)
        .slice(0, 20)
        .map((g) => ({
          code: g.control_code,
          domain: g.domain_code,
          name: g.control_name,
          confidence: g.confidence_score,
          status: confidenceToSeverity(g.confidence_score ?? 50),
          missingElements: g.missing_elements ?? [],
          auditorNotes: g.auditor_notes,
        }));

      // Fetch ROI path if available
      const { data: roiSnapshot } = await supabase
        .from("intelligence_snapshots")
        .select("*")
        .eq("snapshot_type", "roi_path")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fetch scorecard if available
      const { data: scorecardSnapshot } = await supabase
        .from("intelligence_snapshots")
        .select("*")
        .eq("snapshot_type", "scorecard")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return NextResponse.json({
        source: "computed",
        generatedAt: new Date().toISOString(),
        report: {
          summary: {
            total,
            compliant,
            nonCompliant,
            avgConfidence,
            complianceRate: Math.round((compliant / total) * 100),
          },
          frameworks: scorecardSnapshot?.snapshot_data
            ? (scorecardSnapshot.snapshot_data as Record<string, unknown>).frameworks ?? null
            : null,
          domainBreakdown: domains,
          topGaps: gaps,
          roiPath: roiSnapshot?.snapshot_data
            ? (roiSnapshot.snapshot_data as Record<string, unknown>).roiPath ??
              roiSnapshot.snapshot_data
            : null,
          evaluationCount: total,
        },
      });
    }

    // Final fallback: return data as structured report using the async getters
    const [scores, summary, gaps, roi, domains] = await Promise.all([
      getFrameworkScores(),
      getEvaluationSummary(),
      getTopGaps(),
      getRoiPath(),
      getDomainBreakdown(),
    ]);

    return NextResponse.json({
      source: "static",
      generatedAt: new Date().toISOString(),
      report: {
        summary: {
          ...summary,
          complianceRate: Math.round(
            (summary.compliant / summary.total) * 100
          ),
        },
        frameworks: scores,
        domainBreakdown: domains,
        topGaps: gaps,
        roiPath: roi.map((item: RoiItem) => ({
          controlId: item.code,
          controlName: item.name,
          roiScore: item.roi,
          frameworks: item.frameworks,
        })),
        evaluationCount: summary.total,
      },
    });
  } catch (error) {
    console.error("[API] /compliance/report error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate compliance report",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let frameworkCode = "ISO-27001";
    let title = "Relatório de Gap Analysis ISO-27001";
    try {
      const body = await req.json();
      if (body.frameworkCode) frameworkCode = body.frameworkCode;
      if (body.title) title = body.title;
    } catch (e) {
      // Ignore body parsing issues
    }

    const adminSupabase = createAdminClient();

    // Fetch evidence evaluations to compute the gaps
    const { data: evaluations, error: evalError } = await adminSupabase
      .from("evidence_evaluations")
      .select("*")
      .order("confidence_score", { ascending: true });

    if (evalError) {
      throw evalError;
    }

    // Fetch ROI path
    const { data: roiSnapshot } = await adminSupabase
      .from("intelligence_snapshots")
      .select("*")
      .eq("snapshot_type", "roi_path")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch scorecard
    const { data: scorecardSnapshot } = await adminSupabase
      .from("intelligence_snapshots")
      .select("*")
      .eq("snapshot_type", "scorecard")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Build the report data structure
    const total = evaluations?.length ?? 0;
    const compliant = evaluations?.filter((e) => e.is_compliant).length ?? 0;
    const nonCompliant = total - compliant;
    const avgConfidence = total > 0
      ? Math.round(
          ((evaluations?.reduce((sum, e) => sum + (e.confidence_score ?? 0), 0) ?? 0) /
            total) *
            10
        ) / 10
      : 0;

    const domainMap = new Map<string, { total: number; compliant: number }>();
    for (const e of evaluations ?? []) {
      const d = domainMap.get(e.domain_code) ?? { total: 0, compliant: 0 };
      d.total++;
      if (e.is_compliant) d.compliant++;
      domainMap.set(e.domain_code, d);
    }

    const domains = Array.from(domainMap.entries()).map(([domain, stats]) => ({
      domain,
      total: stats.total,
      compliant: stats.compliant,
      rate: Math.round((stats.compliant / stats.total) * 100),
    }));

    const gaps = (evaluations ?? [])
      .filter((e) => !e.is_compliant)
      .map((g) => ({
        code: g.control_code,
        domain: g.domain_code,
        name: g.control_name,
        confidence: g.confidence_score,
        status: confidenceToSeverity(g.confidence_score ?? 50),
        missingElements: g.missing_elements ?? [],
        auditorNotes: g.auditor_notes,
      }));

    const reportData = {
      summary: {
        total,
        compliant,
        nonCompliant,
        avgConfidence,
        complianceRate: total > 0 ? Math.round((compliant / total) * 100) : 0,
      },
      frameworks: scorecardSnapshot?.snapshot_data
        ? (scorecardSnapshot.snapshot_data as any).frameworks ?? null
        : null,
      domainBreakdown: domains,
      topGaps: gaps,
      roiPath: roiSnapshot?.snapshot_data
        ? (roiSnapshot.snapshot_data as any).roiPath ?? roiSnapshot.snapshot_data
        : null,
      evaluationCount: total,
    };

    // Insert the snapshot into database
    const { data: snapshot, error: insertError } = await adminSupabase
      .from("intelligence_snapshots")
      .insert({
        snapshot_type: "full_report",
        framework_code: frameworkCode,
        snapshot_data: reportData,
        metadata: {
          title,
          framework: frameworkCode,
          type: "Gap Analysis",
          status: "ready"
        }
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...snapshot,
        id: snapshot.id.toString() // Convert BigInt to string
      }
    });
  } catch (error) {
    console.error("[API] /compliance/report POST error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate compliance report",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function confidenceToSeverity(
  confidence: number
): "critical" | "high" | "medium" | "low" {
  if (confidence <= 25) return "critical";
  if (confidence <= 40) return "high";
  if (confidence <= 60) return "medium";
  return "low";
}
