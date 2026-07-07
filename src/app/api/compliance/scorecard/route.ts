// src/app/api/compliance/scorecard/route.ts
// Returns compliance scores for all frameworks
// Source: intelligence_snapshots (scorecard type) + fallback to hardcoded data
//
// Every response also carries the `observed` overlay — the analytical posture
// axis (runtime signals from DefectDojo mapped onto SCF controls, projected
// per framework via scf_framework_mappings). It is additive: the documental
// framework scores are never adjusted by it.

import { logger } from '@/lib/logger';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { IntelligenceSnapshot } from "@/lib/supabase/types";
import { getFrameworkScores, calculateFrameworkScoresLocally } from "@/lib/data/compliance-data";
import { getObservedPosture, type ObservedPostureSummary } from "@/lib/posture/observed-status";

export const dynamic = "force-dynamic";

interface ObservedOverlay {
  violatedControls: string[];
  degradedControls: string[];
  /** framework_code → count of violated SCF controls mapped to it */
  violationsByFramework: Record<string, number>;
  lastSyncedAt: string | null;
}

async function buildObservedOverlay(): Promise<ObservedOverlay> {
  const admin = createAdminClient();
  const posture: ObservedPostureSummary = await getObservedPosture(admin);

  const violatedControls = posture.violated.map((v) => v.scfControlCode);
  const degradedControls = posture.degraded.map((d) => d.scfControlCode);
  const violationsByFramework: Record<string, number> = {};

  if (violatedControls.length > 0) {
    const { data, error } = await admin
      .from("scf_framework_mappings")
      .select("framework_code, scf_control_code")
      .in("scf_control_code", violatedControls);

    if (error) {
      logger.warn("Observed overlay framework projection failed", {
        context: "compliance/scorecard",
        meta: { error: error.message },
      });
    } else {
      const perFramework = new Map<string, Set<string>>();
      for (const row of (data ?? []) as Array<{ framework_code: string; scf_control_code: string }>) {
        const set = perFramework.get(row.framework_code) ?? new Set<string>();
        set.add(row.scf_control_code);
        perFramework.set(row.framework_code, set);
      }
      for (const [framework, controls] of perFramework) {
        violationsByFramework[framework] = controls.size;
      }
    }
  }

  return {
    violatedControls,
    degradedControls,
    violationsByFramework,
    lastSyncedAt: posture.lastSyncedAt,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Analytical axis overlay — attached to every response variant below.
    // Failure degrades to an empty overlay; it never blocks the scorecard.
    let observed: ObservedOverlay = {
      violatedControls: [],
      degradedControls: [],
      violationsByFramework: {},
      lastSyncedAt: null,
    };
    try {
      observed = await buildObservedOverlay();
    } catch (overlayError) {
      logger.warn("Observed overlay unavailable", { context: "compliance/scorecard", error: overlayError });
    }

    // Try to fetch the latest scorecard snapshot
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        observed,
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
          observed,
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
      observed,
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
