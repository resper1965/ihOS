import type { Metadata } from "next";
import {
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { ComplianceScorecard } from "@/components/dashboard/compliance-scorecard";
import { EvidenceSummary } from "@/components/dashboard/evidence-summary";
import { GapTable } from "@/components/dashboard/gap-table";
import { RoiPriority } from "@/components/dashboard/roi-priority";
import { RealtimeRefresher } from "@/components/dashboard/realtime-refresher";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import {
  getFrameworkScores,
  getEvaluationSummary,
  getTopGaps,
  getRoiPath,
  getDomainBreakdown,
} from "@/lib/data/compliance-data";

export const metadata: Metadata = {
  title: "Compliance Intelligence — ihOS",
  description:
    "Real-time compliance posture across LGPD, HIPAA, TX-RAMP, ISO 27001, and EU GDPR. Gap analysis, evidence evaluation, and ROI-driven remediation priorities.",
};

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Page (async Server Component)
// ─────────────────────────────────────────────────────────────────────────────

export default async function CompliancePage() {
  const [frameworkScores, evaluationSummary, topGaps, roiPath, domainBreakdown] =
    await Promise.all([
      getFrameworkScores(),
      getEvaluationSummary(),
      getTopGaps(),
      getRoiPath(),
      getDomainBreakdown(),
    ]);

  const quickStats = [
    {
      label: "Monitored Frameworks",
      value: frameworkScores.length.toString(),
      icon: ShieldCheck,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Evaluated Evidence",
      value: evaluationSummary.total.toString(),
      icon: BarChart3,
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/10",
    },
    {
      label: "Open Gaps",
      value: evaluationSummary.nonCompliant.toString(),
      icon: AlertTriangle,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
    },
    {
      label: "Average Confidence",
      value: `${evaluationSummary.avgConfidence}%`,
      icon: TrendingUp,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
    },
  ];

  return (
    <div className="w-full space-y-8">
      <PageTitleRegistrar
        title={<>Compliance <span className="text-emerald-400">Intelligence</span></>}
        subtitle={`Real-time posture across ${frameworkScores.length} frameworks`}
        icon={<ShieldCheck className="h-4 w-4 text-primary" />}
      />

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {quickStats.map((stat) => (
          <div
            key={stat.label}
            className="glass-card group flex items-center gap-4 p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/5"
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.bgColor}`}
            >
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-text-primary">
                {stat.value}
              </p>
              <p className="text-xs text-text-muted">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Compliance Scorecard */}
      <section id="compliance-scorecards">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-text-primary">
            Framework Scores
          </h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {frameworkScores.length} active
          </span>
        </div>
        <ComplianceScorecard frameworks={frameworkScores} />
      </section>

      {/* Evidence Evaluation + Domain Breakdown */}
      <section>
        <EvidenceSummary
          evaluation={evaluationSummary}
          domains={domainBreakdown}
        />
      </section>

      {/* Top Gaps Table */}
      <section id="compliance-gaps-table">
        <GapTable gaps={topGaps} />
      </section>

      {/* ROI Priority Path */}
      <section id="remediation-roi-card">
        <RoiPriority items={roiPath} />
      </section>

      <RealtimeRefresher />
    </div>
  );
}
