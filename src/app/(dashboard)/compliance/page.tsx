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
      label: "Frameworks Monitorados",
      value: frameworkScores.length.toString(),
      icon: ShieldCheck,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Evidências Avaliadas",
      value: evaluationSummary.total.toString(),
      icon: BarChart3,
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/10",
    },
    {
      label: "Gaps Abertos",
      value: evaluationSummary.nonCompliant.toString(),
      icon: AlertTriangle,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
    },
    {
      label: "Confiança Média",
      value: `${evaluationSummary.avgConfidence}%`,
      icon: TrendingUp,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-emerald-500/20">
            <ShieldCheck className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Compliance{" "}
              <span className="gradient-text">Intelligence</span>
            </h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Postura em tempo real em {frameworkScores.length} frameworks · Última sincronização: hoje
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {quickStats.map((stat) => (
          <div
            key={stat.label}
            className="glass-card group flex items-center gap-4 p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/5"
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
      <section>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-text-primary">
            Scores por Framework
          </h2>
          <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">
            {frameworkScores.length} ativos
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
      <section>
        <GapTable gaps={topGaps} />
      </section>

      {/* ROI Priority Path */}
      <section>
        <RoiPriority items={roiPath} />
      </section>
    </div>
  );
}
