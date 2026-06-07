// src/app/api/compliance/roi/route.ts
// Returns ROI priority path from intelligence snapshots

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRoiPath } from "@/lib/data/compliance-data";
import type { RoiItem } from "@/lib/data/compliance-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Try the latest roi_path snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from("intelligence_snapshots")
      .select("*")
      .eq("snapshot_type", "roi_path")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!snapshotError && snapshot?.snapshot_data) {
      const snapshotData = snapshot.snapshot_data as Record<string, unknown>;
      const items = (snapshotData.roiPath ?? snapshotData.items ?? snapshotData) as unknown[];

      return NextResponse.json({
        source: "database",
        generatedAt: snapshot.created_at,
        metadata: snapshot.metadata,
        roiPath: items,
      });
    }

    // Fallback: fetch ROI path using the async getter
    const roi = await getRoiPath();
    return NextResponse.json({
      source: "static",
      generatedAt: new Date().toISOString(),
      roiPath: roi.map((item: RoiItem) => ({
        controlId: item.code,
        controlName: item.name,
        roiScore: item.roi,
        frameworks: item.frameworks,
      })),
    });
  } catch (error) {
    console.error("[API] /compliance/roi error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch ROI priority path",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
