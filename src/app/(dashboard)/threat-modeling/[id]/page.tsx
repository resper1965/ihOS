"use client";

import { useState, useMemo, use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useThreatModel } from "@/hooks/queries/use-threat-models";
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
import { createClient } from "@/lib/supabase/client";
import { useVersion } from "@/lib/context/version-context";
import type {
  ThreatModelRecord,
  ThreatModelData,
  ThreatModelStatus,
  SeverityLevel,
} from "@/lib/supabase/types";

// ─────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────────────────────

const TABS = ["Scope", "STRIDE", "FMEA", "Gaps", "Review"] as const;
type Tab = (typeof TABS)[number];

const TAB_STEPS: Record<Tab, { step: number; title: string; subtitle: string }> = {
  Scope: {
    step: 1,
    title: "Scope & Decompose",
    subtitle: "Identify assets, components, trust boundaries, and document sources.",
  },
  STRIDE: {
    step: 2,
    title: "Determine Threats",
    subtitle: "Map potential threats to STRIDE security categories.",
  },
  FMEA: {
    step: 3,
    title: "FMEA Risk Quantification",
    subtitle: "Quantify risk severity, occurrence, and detection likelihood.",
  },
  Gaps: {
    step: 4,
    title: "Verify & Validate",
    subtitle: "Review compliance gaps and recommended security controls.",
  },
  Review: {
    step: 5,
    title: "Sign-off & Review",
    subtitle: "Finalize, approve, or request revisions on the threat model.",
  },
};

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

  const { data: record, isLoading: loading, error: queryError, refetch } = useThreatModel(id);
  const error = queryError ? queryError.message : null;

  const [activeTab, setActiveTab] = useState<Tab>("Scope");
  const [reportLoading, setReportLoading] = useState(false);

  // Compliance documents fetching and context
  const { versions } = useVersion();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // ── Derived data ──────────────────────────────────────────────────────────

  const data: ThreatModelData | null = record?.data ?? null;
  const threats = useMemo(() => data?.threat_model?.threats ?? [], [data]);
  const fmeaItems = useMemo(() => data?.fmea?.items ?? [], [data]);
  const gaps = useMemo(() => data?.gaps ?? [], [data]);
  const recommendations = useMemo(() => data?.recommendations ?? [], [data]);

  const productVersion = useMemo(() => {
    return (record as any)?.product_version ?? (data as any)?.metadata?.product_version ?? data?.product_version ?? "unknown";
  }, [record, data]);

  const status = useMemo(() => {
    const raw = (record as any)?.status ?? (data as any)?.metadata?.status ?? data?.status ?? "draft";
    return (raw.toLowerCase().replace("modelstatus.", "")) as ThreatModelStatus;
  }, [record, data]);

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

  // Find version object from context to get its database ID
  const selectedVersionObj = useMemo(() => {
    return versions.find((v) => v.version_code === productVersion);
  }, [versions, productVersion]);

  // Load published compliance documents
  useEffect(() => {
    async function fetchDocs() {
      setLoadingDocs(true);
      try {
        const supabase = createClient();
        const { data: docData, error: docError } = await supabase
          .from("compliance_documents")
          .select("id, product_version_id, filename, file_size_bytes, doc_type, status")
          .eq("status", "published");
        if (!docError && docData) {
          setDocuments(docData);
        }
      } catch (err) {
        console.error("[ThreatModelDetailPage] Error fetching docs:", err);
      } finally {
        setLoadingDocs(false);
      }
    }
    fetchDocs();
  }, []);

  // Filter documents applicable to this product version (Global + Version-specific)
  const applicableDocs = useMemo(() => {
    if (!selectedVersionObj) return [];
    return documents.filter(
      (doc) =>
        doc.product_version_id === null ||
        doc.product_version_id === selectedVersionObj.id
    );
  }, [documents, selectedVersionObj]);

  // Identified Architecture Components (derived from threats)
  const identifiedComponents = useMemo(() => {
    const componentsMap: Record<string, { name: string; total: number; criticalHigh: number; maxRpn: number }> = {};
    
    threats.forEach((t) => {
      const compName = t.affected_component || "General / Unspecified";
      if (!componentsMap[compName]) {
        componentsMap[compName] = { name: compName, total: 0, criticalHigh: 0, maxRpn: 0 };
      }
      
      const comp = componentsMap[compName];
      comp.total += 1;
      if (t.severity === "critical" || t.severity === "high") {
        comp.criticalHigh += 1;
      }
      if (t.rpn && t.rpn > comp.maxRpn) {
        comp.maxRpn = t.rpn;
      }
    });
    
    return Object.values(componentsMap).sort(
      (a, b) => b.criticalHigh - a.criticalHigh || b.maxRpn - a.maxRpn
    );
  }, [threats]);

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
      refetch(); // Refresh using react-query refetch
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
        subtitle={`${data.model_id} — ${productVersion}`}
        icon={<AlertTriangle className="h-4 w-4 text-primary" />}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm font-semibold text-primary bg-primary/10 rounded-lg px-2.5 py-1">
            {data.model_id}
          </span>
          <span className="text-sm text-text-secondary">v{productVersion}</span>
          <span className="text-xs text-text-muted">
            {data.target_frameworks?.join(", ")}
          </span>
          <Badge variant={statusVariant[status]} dot>
            {statusLabel[status]}
          </Badge>
          <span className="flex items-center gap-1.5 text-xs text-text-muted">
            <Calendar className="h-3.5 w-3.5" />
            {formattedDate}
          </span>
        </div>
      </div>

      {/* Sequential stepper tab navigation */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 border-b border-border-glass pb-4">
        {TABS.map((tab) => {
          const info = TAB_STEPS[tab];
          const isActive = activeTab === tab;
          const isPast = TABS.indexOf(tab) < TABS.indexOf(activeTab);

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all duration-300 ${
                isActive
                  ? "bg-primary/10 border-primary/40 text-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]"
                  : isPast
                    ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                    : "bg-white/[0.02] border-white/5 text-text-muted hover:bg-white/5 hover:border-white/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                    isActive
                      ? "bg-primary text-white"
                      : isPast
                        ? "bg-emerald-500 text-white"
                        : "bg-white/10 text-text-muted"
                  }`}
                >
                  {isPast ? "✓" : info.step}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {tab}
                </span>
              </div>
              <span className={`mt-1.5 text-xs font-medium ${isActive ? "text-text-primary" : "text-text-muted"}`}>
                {info.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* ═══════════════════ STEP 1: Scope & Decompose ═══════════════════ */}
      {activeTab === "Scope" && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <RiskSummaryCards
            totalThreats={summaryStats.totalThreats}
            criticalHigh={summaryStats.criticalHigh}
            avgRpn={summaryStats.avgRpn}
            totalGaps={summaryStats.totalGaps}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Scope details */}
            <div className="glass-card p-6 space-y-4 lg:col-span-1">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
                System Boundary & Scope
              </h3>
              <div className="space-y-3 divide-y divide-white/5 text-sm">
                <div className="flex justify-between py-2">
                  <span className="text-text-muted">Model ID</span>
                  <span className="font-mono font-medium text-text-primary">{data.model_id}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-text-muted">Target Version</span>
                  <span className="font-medium text-text-primary">v{productVersion}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-text-muted">Target Frameworks</span>
                  <span className="font-medium text-text-primary text-right">
                    {data.target_frameworks?.join(", ") || "None"}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-text-muted">RAG Chunks</span>
                  <span className="font-mono text-text-primary">{data.rag_chunks_analyzed || 0} chunks</span>
                </div>
                <div className="flex justify-between py-2 font-medium">
                  <span className="text-text-muted">Status</span>
                  <Badge variant={statusVariant[status]}>
                    {statusLabel[status]}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Document checklist/sources */}
            <div className="glass-card p-6 space-y-4 lg:col-span-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
                Source Compliance Documents ({applicableDocs.length})
              </h3>
              {loadingDocs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  <span className="ml-2 text-sm text-text-muted">Loading documents...</span>
                </div>
              ) : applicableDocs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/5 text-text-muted font-medium">
                        <th className="pb-2">Filename</th>
                        <th className="pb-2">Type</th>
                        <th className="pb-2">Size</th>
                        <th className="pb-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-text-secondary">
                      {applicableDocs.map((doc) => (
                        <tr key={doc.id} className="hover:bg-white/[0.01]">
                          <td className="py-2.5 font-medium text-text-primary max-w-xs truncate" title={doc.filename}>
                            {doc.filename}
                          </td>
                          <td className="py-2.5 uppercase font-mono text-[10px]">{doc.doc_type}</td>
                          <td className="py-2.5 text-text-muted">
                            {doc.file_size_bytes
                              ? `${(doc.file_size_bytes / 1024).toFixed(0)} KB`
                              : "—"}
                          </td>
                          <td className="py-2.5 text-right">
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                              {doc.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center text-text-muted">
                  <p>No documents found for this product version.</p>
                  <p className="text-xs text-text-muted mt-1">Upload compliance documents for version v{productVersion} to see them here.</p>
                </div>
              )}
            </div>
          </div>

          {/* Identified Components */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              Identified Architecture Components ({identifiedComponents.length})
            </h3>
            {identifiedComponents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-text-muted font-medium">
                      <th className="pb-2">Component / Asset Name</th>
                      <th className="pb-2 text-center">Total Threats</th>
                      <th className="pb-2 text-center">Critical & High</th>
                      <th className="pb-2 text-center">Max RPN</th>
                      <th className="pb-2 text-right">Trust Exposure</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-text-secondary">
                    {identifiedComponents.map((comp) => {
                      const riskColor =
                        comp.criticalHigh > 0
                          ? "text-red-400"
                          : comp.maxRpn > 100
                            ? "text-amber-400"
                            : "text-emerald-400";

                      const exposureLabel =
                        comp.criticalHigh >= 3
                          ? "High Exposure"
                          : comp.criticalHigh > 0 || comp.maxRpn > 150
                            ? "Medium Exposure"
                            : "Low Exposure";

                      const exposureBg =
                        comp.criticalHigh >= 3
                          ? "bg-red-500/10 text-red-400 border-red-500/20"
                          : comp.criticalHigh > 0 || comp.maxRpn > 150
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";

                      return (
                        <tr key={comp.name} className="hover:bg-white/[0.01]">
                          <td className="py-3 font-semibold text-text-primary">
                            {comp.name}
                          </td>
                          <td className="py-3 text-center font-medium font-mono text-sm">
                            {comp.total}
                          </td>
                          <td className="py-3 text-center font-medium font-mono text-sm text-red-400">
                            {comp.criticalHigh}
                          </td>
                          <td className="py-3 text-center font-medium font-mono text-sm">
                            {comp.maxRpn}
                          </td>
                          <td className="py-3 text-right">
                            <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-medium ${exposureBg}`}>
                              {exposureLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-text-muted text-sm">
                No components identified in threat scenarios.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════ STEP 2: STRIDE Threats ═══════════════════ */}
      {activeTab === "STRIDE" && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1 glass-card p-6 flex flex-col justify-center">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">
                STRIDE Threat Distribution
              </h3>
              <StrideRadar threats={threats} />
            </div>
            <div className="lg:col-span-2 space-y-4">
              {threats.length > 0 ? (
                <ThreatTable threats={threats} />
              ) : (
                <div className="glass-card flex flex-col items-center justify-center p-12 text-center h-full">
                  <Shield className="h-8 w-8 text-text-muted mb-3" />
                  <p className="text-sm text-text-muted">No threats identified in this model.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ STEP 3: FMEA Risk ═══════════════════ */}
      {activeTab === "FMEA" && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1 glass-card p-6 flex flex-col justify-center">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">
                Risk Matrix (Likelihood vs Severity)
              </h3>
              <RiskMatrix threats={threats} />
            </div>
            <div className="lg:col-span-2 space-y-4">
              {fmeaItems.length > 0 ? (
                <FmeaTable items={fmeaItems} />
              ) : (
                <div className="glass-card flex flex-col items-center justify-center p-12 text-center h-full">
                  <Shield className="h-8 w-8 text-text-muted mb-3" />
                  <p className="text-sm text-text-muted">No FMEA analysis available for this model.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ STEP 4: Gap Assessment ═══════════════════ */}
      {activeTab === "Gaps" && (
        <div className="space-y-8 animate-in fade-in duration-300">
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

      {/* ═══════════════════ STEP 5: Sign-off & Review ═══════════════════ */}
      {activeTab === "Review" && (
        <div className="animate-in fade-in duration-300">
          <ReviewPanel
            modelId={id}
            currentStatus={status}
            onReviewSubmit={handleReviewSubmit}
          />
        </div>
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
              disabled={status !== "approved" || reportLoading}
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
