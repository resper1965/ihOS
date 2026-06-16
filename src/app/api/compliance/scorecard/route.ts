// src/app/api/compliance/scorecard/route.ts
// Returns compliance scores for all frameworks
// Source: intelligence_snapshots (scorecard type) + fallback to hardcoded data

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  IntelligenceSnapshot,
  EvidenceEvaluation,
  ScfFrameworkMapping,
} from "@/lib/supabase/types";
import { getFrameworkScores } from "@/lib/data/compliance-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try to fetch the latest scorecard snapshot
    const { data: rawSnapshot, error: snapshotError } = await (supabase as any)
      .from("intelligence_snapshots")
      .select("*")
      .eq("snapshot_type", "scorecard")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const snapshot = rawSnapshot as IntelligenceSnapshot | null;

    if (!snapshotError && snapshot?.snapshot_data) {
      const snapshotData = snapshot.snapshot_data as Record<string, unknown>;
      return NextResponse.json({
        source: "database",
        generatedAt: snapshot.created_at,
        frameworks: snapshotData.frameworks ?? snapshotData,
      });
    }

    // Fallback: query evidence_evaluations + scf_framework_mappings to build scorecard
    const { data: rawEvaluations, error: evalError } = await (supabase as any)
      .from("evidence_evaluations")
      .select("*");

    const evaluations = rawEvaluations as EvidenceEvaluation[] | null;

    if (!evalError && evaluations && evaluations.length > 0) {
      // Get unique framework mappings
      const { data: rawMappings } = await (supabase as any)
        .from("scf_framework_mappings")
        .select("*");

      const mappings = rawMappings as ScfFrameworkMapping[] | null;

      // Build framework-to-controls map
      const frameworkControls = new Map<string, Set<string>>();
      if (mappings) {
        for (const m of mappings) {
          if (!frameworkControls.has(m.framework_code)) {
            frameworkControls.set(m.framework_code, new Set());
          }
          frameworkControls.get(m.framework_code)!.add(m.scf_control_code);
        }
      }

      // Build evaluation lookup
      const evalMap = new Map(evaluations.map((e) => [e.control_code, e]));

      const frameworks = Array.from(frameworkControls.entries()).map(
        ([code, controls]) => {
          const controlList = Array.from(controls);
          const evaluated = controlList.filter((c) => evalMap.has(c));
          const compliant = evaluated.filter((c) => evalMap.get(c)?.is_compliant);
          const scores = evaluated
            .map((c) => evalMap.get(c)?.confidence_score ?? 0)
            .filter((s) => s > 0);

          const avgScore =
            scores.length > 0
              ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
              : null;

          return {
            code,
            name: code,
            score: avgScore,
            coverage:
              controlList.length > 0
                ? Math.round((compliant.length / controlList.length) * 100)
                : null,
            missing: controlList.length - compliant.length,
          };
        }
      );

      return NextResponse.json({
        source: "computed",
        generatedAt: new Date().toISOString(),
        frameworks,
      });
    }

    // Final fallback: get framework scores using the async getter
    const scores = await getFrameworkScores();
    return NextResponse.json({
      source: "static",
      generatedAt: new Date().toISOString(),
      frameworks: scores,
    });
  } catch (error) {
    console.error("[API] /compliance/scorecard error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch compliance scorecard",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
