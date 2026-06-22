import {
  ShieldCheck,
  FileText,
  ClipboardCheck,
  TrendingUp,
  LayoutDashboard,
  ArrowRight,
} from "lucide-react";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { StatsCard } from "@/components/dashboard/stats-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { GoalsWidget } from "@/components/dashboard/goals-widget";
import { createClient } from "@/lib/supabase/server";
import { RealtimeRefresher } from "@/components/dashboard/realtime-refresher";
import { getFrameworkScores, getEvaluationSummary } from "@/lib/data/compliance-data";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";


export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getDashboardStats() {
  try {
    const supabase = await createClient();

    const [
      frameworksResult,
      docsResult,
      assessmentsResult,
      scoreResult,
      frameworkScores,
      evaluationSummary,
    ] = await Promise.all([
      // Distinct framework count from compliance_assessments
      supabase.from("compliance_assessments").select("framework_code"),
      // Total documents
      supabase
        .from("compliance_documents")
        .select("id", { count: "exact", head: true }),
      // Total assessments
      supabase
        .from("compliance_assessments")
        .select("id", { count: "exact", head: true }),
      // Latest score from intelligence_snapshots
      supabase
        .from("intelligence_snapshots")
        .select("snapshot_data")
        .eq("snapshot_type", "scorecard")
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
      // Compliance data layer (Supabase → Standard API → mock)
      getFrameworkScores(),
      getEvaluationSummary(),
    ]);

    // Count distinct frameworks — prefer Supabase, fall back to compliance-data
    const distinctFrameworks = frameworksResult.data
      ? new Set(frameworksResult.data.map((r) => r.framework_code)).size
      : 0;
    const frameworkCount =
      distinctFrameworks > 0
        ? distinctFrameworks.toString()
        : frameworkScores.length > 0
          ? frameworkScores.length.toString()
          : "0";

    const docsCount = docsResult.count ?? 0;
    const assessmentsCount = assessmentsResult.count ?? 0;

    // Extract score — prefer Supabase snapshot, fall back to compliance-data avg
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
  } catch (err) {
    console.warn("[dashboard] getDashboardStats error, using fallback:", err);
    return {
      frameworks: "0",
      documents: "0",
      assessments: "0",
      score: "—",
    };
  }
}

async function getRecentActivity() {
  try {
    const supabase = await createClient();

    const { data: notifications, error } = await supabase
      .from("agent_notifications")
      .select("id, title, content, type, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    if (notifications && notifications.length > 0) {
      return notifications.map((n) => {
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

    return null; // Signal to use fallback
  } catch (err) {
    console.warn("[dashboard] getRecentActivity error:", err);
    return null;
  }
}

async function getMSRBaselineData() {
  try {
    const supabase = await createClient();

    // 1. Fetch active baseline
    const { data: baseline, error: baselineError } = await (supabase as any)
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
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (baselineError || !baseline) {
      return null;
    }

    // 2. Fetch all controls counts for this baseline
    const { data: controls, error: controlsError } = await (supabase as any)
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
        version_code: baseline.product_versions?.version_code || "v2.2.x",
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
  } catch (err) {
    console.warn("[dashboard] getMSRBaselineData error:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page (async Server Component)
// ─────────────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const [stats, recentActivity, msrData] = await Promise.all([
    getDashboardStats(),
    getRecentActivity(),
    getMSRBaselineData(),
  ]);


  const activities = recentActivity ?? [];

  const STATS = [
    {
      label: "Total Frameworks",
      value: stats.frameworks,
      icon: ShieldCheck,
      color: "text-primary",
      bgColor: "bg-primary/10",
      tooltipContent: "Quantidade de regulamentações ativas com auditorias iniciadas (ex: ISO 27001, SOC 2, TX-RAMP).",
    },
    {
      label: "Analyzed Documents",
      value: stats.documents,
      icon: FileText,
      color: "text-accent",
      bgColor: "bg-accent/10",
      tooltipContent: "Total de documentos ingeridos e indexados na base vetorial RAG (Políticas, Evidências, Relatórios).",
    },
    {
      label: "Active Assessments",
      value: stats.assessments,
      icon: ClipboardCheck,
      color: "text-warning",
      bgColor: "bg-warning/10",
      tooltipContent: "Número de auditorias em andamento ou recentemente concluídas para análise de gap.",
    },
    {
      label: "Compliance Score",
      value: stats.score,
      icon: TrendingUp,
      color: "text-accent",
      bgColor: "bg-accent/10",
      tooltipContent: "Média agregada das avaliações de conformidade de todos os frameworks monitorados.",
    },
  ] as const;

  return (
    <div className="w-full space-y-8">
      <OnboardingGate />
      <PageTitleRegistrar
        title={<>Welcome to <span className="text-emerald-400">ihOS</span></>}
        subtitle="Your consolidated view of compliance and governance."
        icon={<LayoutDashboard className="h-4 w-4 text-primary" />}
      />

      {/* Stats Grid */}
      <div id="stats-grid-dashboard" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <StatsCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            color={stat.color}
            bgColor={stat.bgColor}
            tooltipContent={stat.tooltipContent}
          />
        ))}
      </div>

      {/* SCRMS MSR Baseline Progress Section */}
      {msrData && (
        <div className="glass-card p-6 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-text-primary">
                  SCRMS Security Baseline (MSR)
                </h2>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {msrData.baseline.version_code}
                </span>
              </div>
              <p className="text-sm text-text-secondary mt-1">
                Active program: <strong className="text-text-primary">{msrData.baseline.name}</strong> — {msrData.baseline.description}
              </p>
            </div>
            <Link
              href="/compliance/scrms"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-bg-dark transition-all hover:bg-primary-hover active:scale-95"
            >
              <span>Manage Baseline & DSRs</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* MCR Progress */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">
                  Minimum Compliance Requirements (MCR)
                </span>
                <span className="text-xs text-text-secondary">
                  {msrData.stats.acceptedMCR} / {msrData.stats.totalMCR} Accepted
                </span>
              </div>
              <Progress
                value={msrData.stats.acceptedMCR}
                max={msrData.stats.totalMCR || 100}
                showPercentage={true}
                size="md"
              />
              <p className="text-xs text-text-muted">
                Mandatory controls mapped from regulatory frameworks (TX-RAMP/ISO 27001).
              </p>
            </div>

            {/* DSR Recommendations */}
            <div className="space-y-3">
              <span className="text-sm font-semibold text-text-primary block">
                Discretionary Security Requirements (DSR)
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-emerald-500/10 p-2.5 text-center border border-emerald-500/10">
                  <span className="block text-lg font-bold text-emerald-400">
                    {msrData.stats.acceptedDSR}
                  </span>
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-emerald-400/80">
                    Accepted
                  </span>
                </div>
                <div className="rounded-lg bg-amber-500/10 p-2.5 text-center border border-amber-500/10">
                  <span className="block text-lg font-bold text-amber-400">
                    {msrData.stats.pendingDSR}
                  </span>
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-amber-400/80">
                    Pending
                  </span>
                </div>
                <div className="rounded-lg bg-rose-500/10 p-2.5 text-center border border-rose-500/10">
                  <span className="block text-lg font-bold text-rose-400">
                    {msrData.stats.rejectedDSR}
                  </span>
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-rose-400/80">
                    Rejected
                  </span>
                </div>
              </div>
              <p className="text-xs text-text-muted">
                Risk-based discretionary controls dynamically scored and recommended.
              </p>
            </div>

            {/* PPTDF Coverage */}
            <div className="space-y-2">
              <span className="text-sm font-semibold text-text-primary block">
                MSR Asset Scope (PPTDF)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(msrData.stats.pptdf).map(([scope, count]) => (
                  <div
                    key={scope}
                    className="flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-xs text-text-secondary border border-white/5"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    <span className="font-medium text-text-primary">{scope}:</span>
                    <span className="font-semibold text-accent">{count}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-muted mt-2">
                Operational impact vectors for the accepted control baseline.
              </p>
            </div>
          </div>
        </div>
      )}



      {/* Feed & Goals grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div id="activity-feed-card">
          <ActivityFeed activities={activities} />
        </div>
        <div id="goals-widget-card">
          <GoalsWidget />
        </div>
      </div>

      <RealtimeRefresher />
    </div>
  );
}
