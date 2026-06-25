"use client";

import { useState, useEffect, useCallback, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  Calendar,
  CheckCircle2,
  Shield,
} from "lucide-react";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { RiskSummaryCards } from "@/components/risk/risk-summary-cards";
import { RiskMatrix } from "@/components/risk/risk-matrix";
import { StrideRadar } from "@/components/risk/stride-radar";
import { ThreatTable } from "@/components/risk/threat-table";
import { FmeaTable } from "@/components/risk/fmea-table";
import { ReviewPanel } from "@/components/risk/review-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ThreatModelRecord,
  ThreatModelData,
  ThreatModelStatus,
  SeverityLevel,
} from "@/lib/supabase/types";

// ─────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────────────────────

const TABS = ["Overview", "Threats", "FMEA", "Gaps", "Review"] as const;
type Tab = (typeof TABS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Status badge helpers
// ─────────────────────────────────────────────────────────────────────────────

const statusVariant: Record<ThreatModelStatus, "warning" | "info" | "success" | "danger"> = {
  draft: "warning",
  reviewed: "info",
  approved: "success",
  rejected: "danger",
};

const statusLabel: Record<ThreatModelStatus, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  approved: "Approved",
  rejected: "Rejected",
};

const priorityVariant: Record<SeverityLevel, "danger" | "warning" | "info" | "success"> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "success",
};

const effortColors: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  high: "bg-red-500/15 text-red-400 border-red-500/25",
};

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="w-full space-y-8 animate-pulse">
      <div className="h-4 w-48 rounded bg-white/5" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="h-6 w-72 rounded-lg bg-white/5" />
          <div className="h-4 w-96 rounded bg-white/5" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-20 rounded-full bg-white/10" />
          <div className="h-8 w-20 rounded-full bg-white/10" />
        </div>
      </div>
      <div className="flex gap-4 border-b border-white/5 pb-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 w-20 rounded bg-white/5" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card h-32 p-6">
            <div className="h-11 w-11 rounded-full bg-white/10" />
            <div className="mt-5 h-6 w-16 rounded bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

export default function ThreatModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [record, setRecord] = useState<ThreatModelRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [reportLoading, setReportLoading] = useState(false);

  // ── Fetch model ───────────────────────────────────────────────────────────

  const fetchModel = useCallback(async () => {
    try {
      const res = await fetch(`/api/threat-modeling/${id}`);
      if (!res.ok) throw new Error("Threat model not found");
      const json = await res.json();
      setRecord(json.model ?? null);
      setError(null);
    } catch (err) {
      console.error("[ThreatModeling] Detail fetch error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchModel();
  }, [fetchModel]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const data: ThreatModelData | null = record?.data ?? null;
  const threats = useMemo(() => data?.threat_model?.threats ?? [], [data]);
  const fmeaItems = useMemo(() => data?.fmea?.items ?? [], [data]);
  const gaps = useMemo(() => data?.gaps ?? [], [data]);
  const recommendations = useMemo(() => data?.recommendations ?? [], [data]);

  const summaryStats = useMemo(() => {
    if (!data) return { totalThreats: 0, criticalHigh: 0, avgRpn: 0, totalGaps: 0 };
    return {
      totalThreats: threats.length,
      criticalHigh: threats.filter(
        (t) => t.severity === "critical" || t.severity === "high"
      ).length,
      avgRpn: data.fmea?.summary?.avg_rpn ?? 0,
      totalGaps: gaps.length,
    };
  }, [data, threats, gaps]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGenerateReport = async () => {
    setReportLoading(true);
    try {
      const res = await fetch(`/api/threat-modeling/${id}/report`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Report generation failed");
      // On success, could navigate to reports view or show success
    } catch (err) {
      console.error("[ThreatModeling] Report generation error:", err);
    } finally {
      setReportLoading(false);
    }
  };

  const handleExportPDF = () => {
    window.open(`/api/threat-modeling/${id}/export?format=pdf`, "_blank");
  };

  const handleExportExcel = () => {
    window.open(`/api/threat-modeling/${id}/export?format=excel`, "_blank");
  };

  const handleReviewSubmit = async (status: ThreatModelStatus, comment: string) => {
    try {
      const res = await fetch(`/api/threat-modeling/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment }),
      });
      if (!res.ok) throw new Error("Review submission failed");
      await fetchModel(); // Refresh
    } catch (err) {
      console.error("[ThreatModeling] Review error:", err);
    }
  };

  // ── Loading / Error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full space-y-8">
        <PageTitleRegistrar
          title={
            <>
              Threat <span className="text-primary">Modeling</span>
            </>
          }
          subtitle="Loading threat model details..."
          icon={<AlertTriangle className="h-4 w-4 text-primary" />}
        />
        <LoadingSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="w-full space-y-8">
        <PageTitleRegistrar
          title={
            <>
              Threat <span className="text-primary">Modeling</span>
            </>
          }
          subtitle="Threat model not found"
          icon={<AlertTriangle className="h-4 w-4 text-primary" />}
        />
        <div className="glass-card flex flex-col items-center justify-center p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/20 mb-4">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            Threat model not found
          </h3>
          <p className="text-sm text-text-muted max-w-sm">
            {error ?? "The requested threat model could not be loaded."}
          </p>
          <Button
            variant="secondary"
            className="mt-6"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => router.push("/threat-modeling")}
          >
            Back to Threat Models
          </Button>
        </div>
      </div>
    );
  }

  // ── Format helpers ────────────────────────────────────────────────────────

  const formattedDate = new Date(data.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-8 pb-24">
      <PageTitleRegistrar
        title={
          <>
            Threat <span className="text-primary">Modeling</span>
          </>
        }
        subtitle={`${data.model_id} — ${data.product_version}`}
        icon={<AlertTriangle className="h-4 w-4 text-primary" />}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm font-semibold text-primary bg-primary/10 rounded-lg px-2.5 py-1">
            {data.model_id}
          </span>
          <span className="text-sm text-text-secondary">v{data.product_version}</span>
          <span className="text-xs text-text-muted">
            {data.target_frameworks?.join(", ")}
          </span>
          <Badge variant={statusVariant[data.status]} dot>
            {statusLabel[data.status]}
          </Badge>
          <span className="flex items-center gap-1.5 text-xs text-text-muted">
            <Calendar className="h-3.5 w-3.5" />
            {formattedDate}
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border-glass">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-text-secondary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ═══════════════════ TAB: Overview ═══════════════════ */}
      {activeTab === "Overview" && (
        <div className="space-y-8">
          <RiskSummaryCards
            totalThreats={summaryStats.totalThreats}
            criticalHigh={summaryStats.criticalHigh}
            avgRpn={summaryStats.avgRpn}
            totalGaps={summaryStats.totalGaps}
          />

          {threats.length > 0 && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <RiskMatrix threats={threats} />
              <StrideRadar threats={threats} />
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB: Threats ═══════════════════ */}
      {activeTab === "Threats" && (
        <div>
          {threats.length > 0 ? (
            <ThreatTable threats={threats} />
          ) : (
            <div className="glass-card flex flex-col items-center justify-center p-12 text-center">
              <Shield className="h-8 w-8 text-text-muted mb-3" />
              <p className="text-sm text-text-muted">No threats identified in this model.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB: FMEA ═══════════════════ */}
      {activeTab === "FMEA" && (
        <div>
          {fmeaItems.length > 0 ? (
            <FmeaTable items={fmeaItems} />
          ) : (
            <div className="glass-card flex flex-col items-center justify-center p-12 text-center">
              <Shield className="h-8 w-8 text-text-muted mb-3" />
              <p className="text-sm text-text-muted">No FMEA analysis available for this model.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB: Gaps ═══════════════════ */}
      {activeTab === "Gaps" && (
        <div className="space-y-8">
          {/* Gap Cards */}
          {gaps.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary">
                Compliance Gaps
                <span className="ml-2 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {gaps.length}
                </span>
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {gaps.map((gap, idx) => (
                  <div
                    key={gap.id || idx}
                    className="glass-card p-5 transition-all duration-300 hover:border-primary/20"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-primary bg-primary/10 rounded px-1.5 py-0.5">
                            {gap.gap_type}
                          </span>
                          <h4 className="font-medium text-text-primary text-sm">
                            {gap.title}
                          </h4>
                        </div>
                        <p className="text-xs text-text-secondary leading-relaxed">
                          {gap.description}
                        </p>
                      </div>
                      <Badge variant={priorityVariant[gap.priority]}>
                        {gap.priority}
                      </Badge>
                    </div>
                    {gap.affected_controls && gap.affected_controls.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {gap.affected_controls.map((ctrl) => (
                          <span
                            key={ctrl}
                            className="rounded-md bg-white/5 border border-border-glass px-2 py-0.5 text-[10px] font-mono text-text-muted"
                          >
                            {ctrl}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="glass-card flex flex-col items-center justify-center p-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-3" />
              <p className="text-sm text-text-muted">No compliance gaps identified.</p>
            </div>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary">
                Recommendations
                <span className="ml-2 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {recommendations.length}
                </span>
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {recommendations.map((rec, idx) => (
                  <div
                    key={rec.id || idx}
                    className="glass-card p-5 transition-all duration-300 hover:border-primary/20"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-1.5">
                        <h4 className="font-medium text-text-primary text-sm">
                          {rec.title}
                        </h4>
                        <p className="text-xs text-text-secondary leading-relaxed">
                          {rec.description}
                        </p>
                        {rec.frameworks && rec.frameworks.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {rec.frameworks.map((fw) => (
                              <span
                                key={fw}
                                className="rounded-full bg-white/5 border border-border-glass px-2 py-0.5 text-[10px] text-text-muted"
                              >
                                {fw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={priorityVariant[rec.priority]}>
                          {rec.priority}
                        </Badge>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            effortColors[rec.effort] ?? "bg-white/5 text-text-muted border-white/10"
                          }`}
                        >
                          {rec.effort} effort
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB: Review ═══════════════════ */}
      {activeTab === "Review" && (
        <ReviewPanel
          modelId={id}
          currentStatus={data.status}
          onReviewSubmit={handleReviewSubmit}
        />
      )}

      {/* ═══════════════════ Sticky Action Bar ═══════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-glass bg-bg-primary/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Button
            variant="ghost"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => router.push("/threat-modeling")}
          >
            Back
          </Button>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              icon={
                reportLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )
              }
              onClick={handleGenerateReport}
              disabled={data.status !== "approved" || reportLoading}
            >
              {reportLoading ? "Generating..." : "Generate Report"}
            </Button>

            <button
              onClick={handleExportPDF}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-glass bg-white/5 px-4 py-2 text-sm text-text-secondary transition-all hover:bg-white/10 hover:border-primary/40"
            >
              <FileDown className="h-4 w-4 text-primary" />
              PDF
            </button>

            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-glass bg-white/5 px-4 py-2 text-sm text-text-secondary transition-all hover:bg-white/10 hover:border-primary/40"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
              Excel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
