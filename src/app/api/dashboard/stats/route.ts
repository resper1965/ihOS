import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFrameworkScores, getEvaluationSummary } from "@/lib/data/compliance-data";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getDashboardStats(supabase: any, versionId: string | null) {
  const frameworksQuery = supabase.from("assessments").select("frameworks");
  if (versionId) frameworksQuery.eq("product_version_id", versionId);

  const docsQuery = supabase
    .from("compliance_documents")
    .select("id", { count: "exact", head: true });
  if (versionId) docsQuery.or(`product_version_id.is.null,product_version_id.eq.${versionId}`);

  const assessmentsQuery = supabase
    .from("assessments")
    .select("id", { count: "exact", head: true });
  if (versionId) assessmentsQuery.eq("product_version_id", versionId);

  const [
    frameworksResult,
    docsResult,
    assessmentsResult,
    scoreResult,
    frameworkScores,
    evaluationSummary,
  ] = await Promise.all([
    frameworksQuery,
    docsQuery,
    assessmentsQuery,
    // Latest score from intelligence_snapshots
    supabase
      .from("intelligence_snapshots")
      .select("snapshot_data")
      .eq("snapshot_type", "scorecard")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Compliance data layer
    getFrameworkScores(),
    getEvaluationSummary(),
  ]);

  // Count distinct frameworks
  const distinctFrameworks = new Set<string>();
  if (frameworksResult.data) {
    for (const row of frameworksResult.data) {
      const fws = (row as any).frameworks;
      if (Array.isArray(fws)) {
        fws.forEach((fw: string) => distinctFrameworks.add(fw));
      }
    }
  }
  const frameworkCount =
    distinctFrameworks.size > 0
      ? distinctFrameworks.size.toString()
      : frameworkScores.length > 0
        ? frameworkScores.length.toString()
        : "0";

  const docsCount = docsResult.count ?? 0;
  const assessmentsCount = assessmentsResult.count ?? 0;

  // Extract score
  let avgScore = "—";
  if (scoreResult.data?.snapshot_data) {
    const data = scoreResult.data.snapshot_data as Record<string, any>;
    const score = data.score ?? data.overall_score;
    if (typeof score === "number") {
      avgScore = `${score}%`;
    }
  }
  if (avgScore === "—" && evaluationSummary.avgConfidence > 0) {
    avgScore = `${evaluationSummary.avgConfidence}%`;
  }

  return {
    frameworks: frameworkCount,
    documents: docsCount > 0 ? docsCount.toString() : "0",
    assessments: assessmentsCount > 0 ? assessmentsCount.toString() : "0",
    score: avgScore,
  };
}

async function getRecentActivity(supabase: any) {
  const { data: notifications, error } = await supabase
    .from("agent_notifications")
    .select("id, title, content, type, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  if (notifications && notifications.length > 0) {
    return notifications.map((n: any) => {
      // Calculate relative time
      const created = new Date(n.created_at ?? Date.now());
      const diffMs = Date.now() - created.getTime();
      const diffMin = Math.floor(diffMs / 60_000);
      let time: string;
      if (diffMin < 1) time = "just now";
      else if (diffMin < 60) time = `${diffMin}m ago`;
      else if (diffMin < 1440) time = `${Math.floor(diffMin / 60)}h ago`;
      else time = `${Math.floor(diffMin / 1440)}d ago`;

      // Map notification type to activity type
      const typeMap: Record<string, "assessment" | "analysis" | "document" | "review" | "score"> = {
        poam_expiry: "review",
        score_change: "score",
        task_deadline: "assessment",
      };

      return {
        action: n.title,
        time,
        type: typeMap[n.type] ?? ("assessment" as const),
      };
    });
  }

  return [];
}

async function getMSRBaselineData(supabase: any, versionId: string | null) {
  // 1. Fetch active baseline
  const query = supabase
    .from("msr_baselines")
    .select(`
      id,
      name,
      description,
      status,
      product_version_id,
      product_versions (
        version_code
      )
    `)
    .eq("status", "active");

  if (versionId) {
    query.eq("product_version_id", versionId);
  }

  const { data: baseline, error: baselineError } = await query
    .limit(1)
    .maybeSingle();

  if (baselineError || !baseline) {
    return null;
  }

  // 2. Fetch all controls counts for this baseline
  const { data: controls, error: controlsError } = await supabase
    .from("msr_controls")
    .select("classification, status, pptdf_scope")
    .eq("baseline_id", baseline.id);

  if (controlsError || !controls) {
    return null;
  }

  // 3. Compute stats
  let totalMCR = 0;
  let acceptedMCR = 0;
  let totalDSR = 0;
  let acceptedDSR = 0;
  let pendingDSR = 0;
  let rejectedDSR = 0;

  const pptdf = {
    People: 0,
    Process: 0,
    Technology: 0,
    Data: 0,
    Facilities: 0,
  };

  controls.forEach((c: any) => {
    const isMCR = c.classification === "MCR";
    const isDSR = c.classification === "DSR";

    if (isMCR) {
      totalMCR++;
      if (c.status === "accepted") acceptedMCR++;
    } else if (isDSR) {
      totalDSR++;
      if (c.status === "accepted") acceptedDSR++;
      else if (c.status === "pending_review") pendingDSR++;
      else if (c.status === "rejected") rejectedDSR++;
    }

    if (c.status === "accepted" && c.pptdf_scope) {
      c.pptdf_scope.forEach((scope: string) => {
        if (scope in pptdf) {
          pptdf[scope as keyof typeof pptdf]++;
        }
      });
    }
  });

  return {
    baseline: {
      id: baseline.id,
      name: baseline.name,
      description: baseline.description,
      version_code: baseline.product_versions?.version_code || "Global Baseline",
    },
    stats: {
      totalMCR,
      acceptedMCR,
      totalDSR,
      acceptedDSR,
      pendingDSR,
      rejectedDSR,
      pptdf,
    },
  };
}

// ---------------------------------------------------------------------------
// GET Route
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use the standard URL API instead of NextRequest-only `req.nextUrl` so the
    // handler works with any Request (and is unit-testable without a full
    // NextRequest).
    const versionId = new URL(req.url).searchParams.get("versionId");

    const [stats, activities, msrData] = await Promise.all([
      getDashboardStats(supabase, versionId),
      getRecentActivity(supabase).catch(() => []),
      getMSRBaselineData(supabase, versionId).catch(() => null),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        stats,
        activities,
        msrData,
      },
    });
  } catch (err: any) {
    Sentry.captureException(err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load dashboard stats" },
      { status: 500 }
    );
  }
}
