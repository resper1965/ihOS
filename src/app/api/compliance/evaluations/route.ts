// src/app/api/compliance/evaluations/route.ts
// Returns evidence evaluation summary and details
// Supports query params: ?domain=PRI&status=non_compliant&limit=50

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { EvidenceEvaluation } from "@/lib/supabase/types";
import {
  getEvaluationSummary,
  getDomainBreakdown,
} from "@/lib/data/compliance-data";
import type { EvaluationSummary, DomainBreakdown } from "@/lib/data/compliance-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const domain = searchParams.get("domain");
    const status = searchParams.get("status"); // "compliant" | "non_compliant"
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 50;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Build query with filters
    let query = (supabase as any)
      .from("evidence_evaluations")
      .select("*")
      .order("confidence_score", { ascending: true })
      .limit(limit);

    if (domain) {
      query = query.eq("domain_code", domain.toUpperCase());
    }

    if (status === "compliant") {
      query = query.eq("is_compliant", true);
    } else if (status === "non_compliant") {
      query = query.eq("is_compliant", false);
    }

    const { data: rawEvaluations, error } = await query;
    const evaluations = rawEvaluations as EvidenceEvaluation[] | null;

    if (error) {
      console.error("[API] evidence_evaluations query error:", error);
    }

    if (!error && evaluations && evaluations.length > 0) {
      // Compute summary from all evaluations (unfiltered)
      const { data: rawAllEvals } = await (supabase as any)
        .from("evidence_evaluations")
        .select("*");
      const allEvals = rawAllEvals as EvidenceEvaluation[] | null;

      const total = allEvals?.length ?? 0;
      const compliant = allEvals?.filter((e) => e.is_compliant).length ?? 0;
      const nonCompliant = total - compliant;
      const avgConfidence =
        total > 0
          ? Math.round(
              ((allEvals?.reduce((sum, e) => sum + (e.confidence_score ?? 0), 0) ?? 0) /
                total) *
                10
            ) / 10
          : 0;

      return NextResponse.json({
        source: "database",
        summary: {
          total,
          compliant,
          nonCompliant,
          avgConfidence,
        },
        filters: {
          domain: domain ?? null,
          status: status ?? null,
          limit,
        },
        evaluations: evaluations.map((e) => ({
          id: e.id,
          code: e.control_code,
          domain: e.domain_code,
          name: e.control_name,
          isCompliant: e.is_compliant,
          confidence: e.confidence_score,
          missingElements: e.missing_elements ?? [],
          auditorNotes: e.auditor_notes,
          evaluatedAt: e.evaluated_at,
        })),
      });
    }

    // Fallback: return hardcoded data
    // Fallback: return data using async getters
    const [summary, domains] = await Promise.all([
      getEvaluationSummary(),
      getDomainBreakdown(),
    ]);

    const filteredDomains = domain
      ? domains.filter((d: DomainBreakdown) => d.domain === domain.toUpperCase())
      : domains;

    return NextResponse.json({
      source: "static",
      summary,
      filters: {
        domain: domain ?? null,
        status: status ?? null,
        limit,
      },
      evaluations: filteredDomains.map((d: DomainBreakdown) => ({
        domain: d.domain,
        fullName: d.fullName,
        total: d.total,
        compliant: d.compliant,
        complianceRate: d.rate,
      })),
    });
  } catch (error) {
    console.error("[API] /compliance/evaluations error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch compliance evaluations",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
