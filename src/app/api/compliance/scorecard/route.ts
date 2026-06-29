// src/app/api/compliance/scorecard/route.ts
// Returns compliance scores for all frameworks
// Source: intelligence_snapshots (scorecard type) + fallback to hardcoded data

import { logger } from '@/lib/logger';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  IntelligenceSnapshot,
  EvidenceEvaluation,
  ScfFrameworkMapping,
} from "@/lib/supabase/types";
import { getFrameworkScores, calculateFrameworkScoresLocally } from "@/lib/data/compliance-data";

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

    // Fallback: calculate scorecard locally using centralized calculator
    try {
      const computedScores = await calculateFrameworkScoresLocally(supabase);
      if (computedScores && computedScores.length > 0) {
        return NextResponse.json({
          source: "computed",
          generatedAt: new Date().toISOString(),
          frameworks: computedScores,
        });
      }
    } catch (calcError) {
      logger.error("Local scorecard calculation failed", { context: "compliance/scorecard", error: calcError });
    }

    // Final fallback: get framework scores using the async getter
    const scores = await getFrameworkScores();
    return NextResponse.json({
      source: "static",
      generatedAt: new Date().toISOString(),
      frameworks: scores,
    });
  } catch (error) {
    logger.error("Scorecard fetch failed", { context: "compliance/scorecard", error: error });
    return NextResponse.json(
      {
        error: "Failed to fetch compliance scorecard",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
