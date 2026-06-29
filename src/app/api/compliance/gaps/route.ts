// src/app/api/compliance/gaps/route.ts
// Returns top compliance gaps sorted by confidence (ascending = lowest confidence first)

import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { EvidenceEvaluation } from "@/lib/supabase/types";
import { getTopGaps } from "@/lib/data/compliance-data";
import type { GapItem } from "@/lib/data/compliance-data";
import { ihosEngine } from "@/lib/ihos-engine";
import type { Gap } from "@/lib/ihos-engine";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 20;
    const domain = searchParams.get("domain");

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Primary: try ihos-engine gap detection
    try {
      const engineResponse = await ihosEngine.detectGaps({
        product_version: 'latest',
        target_frameworks: ['iso27001', 'lgpd'],
      });

      if (engineResponse.gaps && engineResponse.gaps.length > 0) {
        const engineGaps = engineResponse.gaps
          .filter((g: Gap) => !domain || g.affected_controls.some((c: string) => c.toUpperCase().startsWith(domain.toUpperCase())))
          .slice(0, limit)
          .map((g: Gap) => ({
            code: g.affected_controls[0] ?? g.id,
            domain: g.affected_controls[0]?.split('.')[0] ?? 'UNKNOWN',
            name: g.title,
            confidence: priorityToConfidence(g.priority),
            status: g.priority === 'critical' ? 'critical' : g.priority === 'high' ? 'high' : g.priority === 'medium' ? 'medium' : 'low',
            missingElements: g.remediation_suggestion ? [g.remediation_suggestion] : [],
            auditorNotes: g.description,
            gapType: g.gap_type,
          }));

        return NextResponse.json({
          source: "engine" as const,
          total: engineGaps.length,
          gaps: engineGaps,
          engineSummary: engineResponse.summary,
        });
      }
    } catch (engineErr) {
      logger.warn("ihos-engine gap detection failed, falling back to database", {
        context: "compliance/gaps",
        error: engineErr
      });
    }

    // Query non-compliant evaluations ordered by lowest confidence first
    let query = (supabase as any)
      .from("evidence_evaluations")
      .select("*")
      .eq("is_compliant", false)
      .order("confidence_score", { ascending: true })
      .limit(limit);

    if (domain) {
      query = query.eq("domain_code", domain.toUpperCase());
    }

    const { data: rawGaps, error } = await query;
    const gaps = rawGaps as EvidenceEvaluation[] | null;

    if (error) {
      logger.error("Gaps query failed", { context: "compliance/gaps", error: error });
    }

    if (!error && gaps && gaps.length > 0) {
      return NextResponse.json({
        source: "database",
        total: gaps.length,
        gaps: gaps.map((g) => ({
          code: g.control_code,
          domain: g.domain_code,
          name: g.control_name,
          confidence: g.confidence_score ?? 0,
          status: confidenceToSeverity(g.confidence_score ?? 0),
          missingElements: g.missing_elements ?? [],
          auditorNotes: g.auditor_notes,
          evaluatedAt: g.evaluated_at,
        })),
      });
    }

    // Fallback: return data using async getter
    const gapsData = await getTopGaps();
    const filteredGaps = domain
      ? gapsData.filter((g: GapItem) => g.domain === domain.toUpperCase())
      : gapsData;

    return NextResponse.json({
      source: "static",
      total: filteredGaps.length,
      gaps: filteredGaps.slice(0, limit),
    });
  } catch (error) {
    logger.error("Gaps fetch failed", { context: "compliance/gaps", error: error });
    return NextResponse.json(
      {
        error: "Failed to fetch compliance gaps",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Maps confidence score to a severity label.
 * Lower confidence = higher severity (more critical gap).
 */
function confidenceToSeverity(
  confidence: number
): "critical" | "high" | "medium" | "low" {
  if (confidence <= 25) return "critical";
  if (confidence <= 40) return "high";
  if (confidence <= 60) return "medium";
  return "low";
}

/**
 * Maps engine priority to a numeric confidence score.
 */
function priorityToConfidence(priority: string): number {
  switch (priority) {
    case 'critical': return 10;
    case 'high': return 30;
    case 'medium': return 50;
    case 'low': return 75;
    default: return 50;
  }
}
