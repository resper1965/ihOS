import type { Metadata } from "next";
import {
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { EvidenceSummary } from "@/components/dashboard/evidence-summary";
import { GapTable } from "@/components/dashboard/gap-table";
import { RealtimeRefresher } from "@/components/dashboard/realtime-refresher";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import {
  getEvaluationSummary,
  getTopGaps,
  getDomainBreakdown,
} from "@/lib/data/compliance-data";
import { collectCoverage } from "@/lib/compliance/coverage";
import { getCachedScfVersionId } from "@/lib/standard-api/sync/catalog";

export const metadata: Metadata = {
  title: "Compliance Intelligence — ihOS",
  description:
    "Crosswalk coverage per curated framework, plus evidence evaluation and gap analysis.",
};

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Page (async Server Component)
// ─────────────────────────────────────────────────────────────────────────────

export default async function CompliancePage() {
  const scfVersionId = await getCachedScfVersionId();
  const coverage = await collectCoverage(scfVersionId);
  const [evaluationSummary, topGaps, domainBreakdown] = await Promise.all([
    getEvaluationSummary(),
    getTopGaps(),
    getDomainBreakdown(),
  ]);
  const curatedCount = coverage.filter((c) => c.status === "projected").length;

  const quickStats = [
    {
      label: "Monitored Frameworks",
      value: curatedCount.toString(),
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
        title={<>Compliance <span className="text-primary">Intelligence</span></>}
        subtitle={`Crosswalk coverage for ${curatedCount} curated frameworks`}
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

      {/* Framework Coverage */}
      <section id="compliance-scorecards">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-text-primary">
            Framework Coverage
          </h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {curatedCount} curated
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coverage.map((c) => (
            <div
              key={c.localCode}
              className="glass-card border border-border-glass bg-bg-card p-5"
            >
              <p className="text-sm font-semibold text-text-primary">{c.name}</p>
              {c.status === "undecided" ? (
                <p className="mt-2 text-xs text-text-secondary">
                  No curated identity — a person must decide which vendor
                  framework this means.
                </p>
              ) : c.status === "error" ? (
                <p className="mt-2 text-xs text-danger">
                  Could not be read: {c.note ?? "unknown error"}
                </p>
              ) : c.reason === "no_requirements_mapped" ? (
                <p className="mt-2 text-xs text-text-secondary">
                  Curated, but its crosswalk has no rows at this catalogue
                  version — nothing can be said about its coverage yet.
                </p>
              ) : (
                <div className="mt-3 space-y-1 text-xs text-text-secondary">
                  <p>
                    Requirements:{" "}
                    <span className="font-semibold text-text-primary">
                      {c.requirementsTotal}
                    </span>
                  </p>
                  <p>
                    Unrecorded:{" "}
                    <span className="font-semibold text-text-primary">
                      {c.requirementsUnrecorded}
                    </span>
                  </p>
                  <p>
                    Unevaluated:{" "}
                    <span className="font-semibold text-text-primary">
                      {c.requirementsUnevaluated}
                    </span>
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-text-muted">
          Curation policy{" "}
          {coverage.find((c) => c.status === "projected")?.policyVersion ?? "—"},
          owned by{" "}
          {coverage.find((c) => c.status === "projected")?.policyOwner ?? "—"}.
          Catalogue version {scfVersionId}.
        </p>
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

      {/* The ROI widget was removed on 2026-09-09. getRoiPath asks the vendor
          about ["ISO 27701", "HIPAA", "ISO 27001"] — hardcoded phrase-format
          names the vendor abandoned on 2026-09-08 (FINDINGS_2026-09-09.md B9),
          one of which we quarantined for matching three frameworks at once. It
          has almost certainly rendered nothing since. Repairing it means reading
          the codes from framework_identity_curation, which is vendor
          integration, not information architecture. See the design doc §5.3. */}

      <RealtimeRefresher />
    </div>
  );
}
