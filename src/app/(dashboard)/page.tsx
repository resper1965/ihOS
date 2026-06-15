import {
  ShieldCheck,
  FileText,
  ClipboardCheck,
  TrendingUp,
} from "lucide-react";
import { StatsCard } from "@/components/dashboard/stats-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { GoalsWidget } from "@/components/dashboard/goals-widget";
import { createClient } from "@/lib/supabase/server";
import { RealtimeRefresher } from "@/components/dashboard/realtime-refresher";
import { getFrameworkScores, getEvaluationSummary } from "@/lib/data/compliance-data";

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
        if (diffMin < 1) time = "agora";
        else if (diffMin < 60) time = `há ${diffMin} min`;
        else if (diffMin < 1440) time = `há ${Math.floor(diffMin / 60)}h`;
        else time = `há ${Math.floor(diffMin / 1440)}d`;

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

// ─────────────────────────────────────────────────────────────────────────────
// Fallback data
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_ACTIVITY = [
  { action: "Avaliação ISO 27001 atualizada", time: "há 2 min", type: "assessment" as const },
  { action: "Análise de gaps TX-RAMP concluída", time: "há 15 min", type: "analysis" as const },
  { action: "Documento SOC 2 Type II enviado", time: "há 1h", type: "document" as const },
  { action: "Mapeamento HIPAA revisado", time: "há 3h", type: "review" as const },
  { action: "Score NIST CSF atualizado para 92%", time: "há 5h", type: "score" as const },
];

// ─────────────────────────────────────────────────────────────────────────────
// Page (async Server Component)
// ─────────────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const [stats, recentActivity] = await Promise.all([
    getDashboardStats(),
    getRecentActivity(),
  ]);

  const activities = recentActivity ?? FALLBACK_ACTIVITY;

  const STATS = [
    {
      label: "Total Frameworks",
      value: stats.frameworks,
      icon: ShieldCheck,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Documentos Analisados",
      value: stats.documents,
      icon: FileText,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      label: "Avaliações Ativas",
      value: stats.assessments,
      icon: ClipboardCheck,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      label: "Score de Compliance",
      value: stats.score,
      icon: TrendingUp,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
  ] as const;

  return (
    <div className="w-full space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Bem-vindo ao{" "}
          <span className="gradient-text">ihOS</span>
        </h1>
        <p className="mt-1 text-text-secondary">
          Sua visão consolidada de compliance e governança.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <StatsCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            color={stat.color}
            bgColor={stat.bgColor}
          />
        ))}
      </div>

      {/* Feed & Goals grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActivityFeed activities={activities} />
        <GoalsWidget />
      </div>

      <RealtimeRefresher />
    </div>
  );
}
