"use client";

import Link from "next/link";
import { useState, useMemo, use } from "react";
import {
  ArrowLeft,
  ShieldCheck,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  BarChart3,
  ListChecks,
  AlertTriangle,
  FileDown,
  Filter,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAssessment, useAssessmentEvidence } from "@/hooks/queries/use-assessments";
import { resolveFrameworkName } from "@/lib/assessment/framework-registry";

/* ------------------------------------------------------------------ */
/*  Tab / Stepper definitions                                          */
/* ------------------------------------------------------------------ */

const TABS = ["Overview", "Controls", "Gaps", "Export"] as const;
type Tab = (typeof TABS)[number];

const TAB_STEPS: Record<Tab, { step: number; title: string; subtitle: string; icon: React.ReactNode }> = {
  Overview: {
    step: 1,
    title: "Overview & Scores",
    subtitle: "Dashboard with framework scores, compliance metrics, and dual-phase analysis.",
    icon: <BarChart3 className="h-4 w-4" />,
  },
  Controls: {
    step: 2,
    title: "Control Analysis",
    subtitle: "Explore evaluated controls grouped by domain with evidence details.",
    icon: <ListChecks className="h-4 w-4" />,
  },
  Gaps: {
    step: 3,
    title: "Gaps & Remediation",
    subtitle: "Non-conforming controls prioritized for remediation.",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  Export: {
    step: 4,
    title: "Export & Actions",
    subtitle: "Export reports and manage assessment actions.",
    icon: <FileDown className="h-4 w-4" />,
  },
};

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type CombinedStatus = "conforming" | "partial" | "informal" | "gap" | "unknown";

interface ProcessedControl {
  code: string;
  name: string;
  domain: string;
  isCompliant: boolean;
  confidenceScore: number;
  status: CombinedStatus;
  ismsFound: boolean;
  evidenceFound: boolean;
  ismsSnippet?: string | null;
  evidenceSnippet?: string | null;
  auditorNotes?: string | null;
  needsReview: boolean;
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                          */
/* ------------------------------------------------------------------ */

function LoadingSkeleton() {
  return (
    <div className="w-full space-y-8 animate-pulse">
      <div className="h-4 w-48 rounded bg-white/5" />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-72 rounded-lg bg-white/5" />
          <div className="h-4 w-96 rounded bg-white/5" />
        </div>
      </div>
      {/* Stepper skeleton */}
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 flex-1 rounded-xl bg-white/5" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-6 space-y-4">
            <div className="h-4 w-32 rounded bg-white/5" />
            <div className="h-10 w-24 rounded bg-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<CombinedStatus, { label: string; color: string; icon: React.ReactNode; bgClass: string }> = {
  conforming: {
    label: "Conforming",
    color: "text-emerald-400",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
    bgClass: "bg-emerald-500/10 border-emerald-500/20",
  },
  partial: {
    label: "Partial",
    color: "text-amber-400",
    icon: <AlertCircle className="h-4 w-4 text-amber-400" />,
    bgClass: "bg-amber-500/10 border-amber-500/20",
  },
  informal: {
    label: "Informal",
    color: "text-blue-400",
    icon: <HelpCircle className="h-4 w-4 text-blue-400" />,
    bgClass: "bg-blue-500/10 border-blue-500/20",
  },
  gap: {
    label: "Gap",
    color: "text-red-400",
    icon: <XCircle className="h-4 w-4 text-red-400" />,
    bgClass: "bg-red-500/10 border-red-500/20",
  },
  unknown: {
    label: "Unreviewed",
    color: "text-slate-400",
    icon: <HelpCircle className="h-4 w-4 text-slate-400" />,
    bgClass: "bg-slate-500/10 border-slate-500/20",
  },
};

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CombinedStatus | "all">("all");
  const [expandedControl, setExpandedControl] = useState<string | null>(null);

  // React Query hooks
  const { data: assessment, isLoading: loadingAssessment, error: assessmentError } = useAssessment(id);
  const { data: evidence, isLoading: loadingEvidence } = useAssessmentEvidence(id);

  // Process evidence into typed controls
  const controls: ProcessedControl[] = useMemo(() => {
    if (!evidence) return [];
    return evidence.map((ev) => {
      const sources = ev.evidence_sources as any;
      const ismsPhase = sources?.ismsPhase;
      const evidencePhase = sources?.evidencePhase;

      let status: CombinedStatus = "unknown";
      if (sources?.combinedStatus) {
        status = sources.combinedStatus;
      } else if (ev.is_compliant) {
        status = "conforming";
      } else if ((ev.confidence_score ?? 0) > 50) {
        status = "partial";
      } else {
        status = "gap";
      }

      return {
        code: ev.control_code ?? ev.scf_control_code ?? "UNKNOWN",
        name: ev.control_name ?? "Unknown Control",
        domain: ev.domain_code ?? ev.control_code?.split("-")[0] ?? "UNKNOWN",
        isCompliant: ev.is_compliant,
        confidenceScore: ev.confidence_score,
        status,
        ismsFound: ismsPhase?.found ?? ev.is_compliant,
        evidenceFound: evidencePhase?.found ?? false,
        ismsSnippet: ismsPhase?.snippet,
        evidenceSnippet: evidencePhase?.snippet,
        auditorNotes: ev.auditor_notes,
        needsReview: ev.needs_review,
      };
    });
  }, [evidence]);

  // Group controls by domain
  const controlsByDomain = useMemo(() => {
    const groups: Record<string, ProcessedControl[]> = {};
    for (const ctrl of controls) {
      if (!groups[ctrl.domain]) groups[ctrl.domain] = [];
      groups[ctrl.domain].push(ctrl);
    }
    return groups;
  }, [controls]);

  // Filtered controls (for search + status filter)
  const filteredControls = useMemo(() => {
    return controls.filter((c) => {
      const matchesSearch =
        search === "" ||
        c.code.toLowerCase().includes(search.toLowerCase()) ||
        c.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [controls, search, statusFilter]);

  // Status counts
  const counts = useMemo(() => {
    const c = { conforming: 0, partial: 0, informal: 0, gap: 0, unknown: 0, total: controls.length };
    for (const ctrl of controls) c[ctrl.status]++;
    return c;
  }, [controls]);

  const isLoading = loadingAssessment || loadingEvidence;

  if (isLoading) return <LoadingSkeleton />;

  if (assessmentError || !assessment) {
    return (
      <div className="w-full space-y-4">
        <Link href="/assessments" className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Assessments
        </Link>
        <div className="glass-card p-12 text-center">
          <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text-primary">Assessment Not Found</h2>
          <p className="text-sm text-text-muted mt-2">The requested assessment could not be loaded.</p>
        </div>
      </div>
    );
  }

  const overallScore =
    assessment.framework_scores.length > 0
      ? Math.round(assessment.framework_scores.reduce((sum, fs) => sum + fs.score, 0) / assessment.framework_scores.length)
      : 0;

  return (
    <div className="w-full space-y-8">
      {/* Back navigation */}
      <Link
        href="/assessments"
        className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Assessments
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold sm:text-3xl text-text-primary">{assessment.name}</h1>
            <Badge
              variant="info"
              className="text-[9px] bg-primary/10 text-primary border border-primary/20 py-0 px-1 font-mono uppercase"
            >
              {assessment.mode}
            </Badge>
            <Badge variant={assessment.status === "completed" ? "success" : "info"} dot>
              {assessment.status === "completed" ? "Complete" : "Running"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {assessment.frameworks.length} frameworks · {assessment.sales_channel || "All channels"} ·{" "}
            {assessment.created_at ? new Date(assessment.created_at).toLocaleDateString() : "—"}
          </p>
        </div>
      </div>

      {/* ── Stepper ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {TABS.map((tab) => {
          const step = TAB_STEPS[tab];
          const isActive = activeTab === tab;
          const stepIndex = TABS.indexOf(tab);
          const activeIndex = TABS.indexOf(activeTab);
          const isPast = stepIndex < activeIndex;

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`group relative flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-300 flex-1 min-w-[160px] ${
                isActive
                  ? "border-primary/50 bg-primary/10 shadow-lg shadow-primary/5"
                  : isPast
                  ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
                  : "border-border-glass bg-white/5 hover:bg-white/[0.07]"
              }`}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-all shrink-0 ${
                  isActive
                    ? "bg-primary text-white"
                    : isPast
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-white/10 text-text-muted"
                }`}
              >
                {isPast ? <CheckCircle2 className="h-4 w-4" /> : step.step}
              </div>
              <div className="min-w-0">
                <div
                  className={`text-xs font-semibold truncate ${
                    isActive ? "text-primary" : isPast ? "text-emerald-400" : "text-text-secondary"
                  }`}
                >
                  {step.title}
                </div>
                <div className="text-[10px] text-text-muted truncate hidden sm:block">{step.subtitle}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}

      {/* ─── Step 1: Overview & Scores ──────────────────────────────────── */}
      {activeTab === "Overview" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Status distribution bar */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
              Compliance Distribution
            </h3>
            <div className="flex h-6 rounded-full overflow-hidden bg-white/5">
              {counts.conforming > 0 && (
                <div
                  className="bg-emerald-500 transition-all duration-500"
                  style={{ width: `${(counts.conforming / counts.total) * 100}%` }}
                  title={`Conforming: ${counts.conforming}`}
                />
              )}
              {counts.partial > 0 && (
                <div
                  className="bg-amber-500 transition-all duration-500"
                  style={{ width: `${(counts.partial / counts.total) * 100}%` }}
                  title={`Partial: ${counts.partial}`}
                />
              )}
              {counts.informal > 0 && (
                <div
                  className="bg-blue-500 transition-all duration-500"
                  style={{ width: `${(counts.informal / counts.total) * 100}%` }}
                  title={`Informal: ${counts.informal}`}
                />
              )}
              {counts.gap > 0 && (
                <div
                  className="bg-red-500 transition-all duration-500"
                  style={{ width: `${(counts.gap / counts.total) * 100}%` }}
                  title={`Gap: ${counts.gap}`}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-4 mt-3">
              {(["conforming", "partial", "informal", "gap"] as CombinedStatus[]).map((s) => (
                <div key={s} className="flex items-center gap-2 text-xs">
                  {STATUS_CONFIG[s].icon}
                  <span className={STATUS_CONFIG[s].color}>
                    {STATUS_CONFIG[s].label}: {counts[s]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Card title="Overall Score" icon={<ShieldCheck className="h-5 w-5 text-accent" />}>
              <div className="mt-2">
                <span className={`text-4xl font-extrabold ${overallScore >= 70 ? "text-emerald-400" : overallScore >= 40 ? "text-amber-400" : "text-red-400"}`}>
                  {overallScore}%
                </span>
              </div>
            </Card>
            <Card title="Controls Evaluated" icon={<ListChecks className="h-5 w-5 text-primary" />}>
              <div className="mt-2 space-y-2">
                <span className="text-3xl font-bold text-text-primary">{assessment.total_controls}</span>
                <Progress value={assessment.total_controls > 0 ? (assessment.compliant_controls / assessment.total_controls) * 100 : 0} size="sm" />
                <p className="text-[10px] text-text-muted">
                  {assessment.compliant_controls} compliant / {assessment.missing_controls} missing
                </p>
              </div>
            </Card>
            <Card title="ISMS Coverage" icon={<ShieldCheck className="h-5 w-5 text-blue-400" />}>
              <div className="mt-2">
                <span className="text-3xl font-bold text-blue-400">
                  {counts.total > 0 ? Math.round(((counts.conforming + counts.partial) / counts.total) * 100) : 0}%
                </span>
                <p className="text-[10px] text-text-muted mt-1">Policy documentation found</p>
              </div>
            </Card>
            <Card title="Evidence Coverage" icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}>
              <div className="mt-2">
                <span className="text-3xl font-bold text-emerald-400">
                  {counts.total > 0 ? Math.round(((counts.conforming + counts.informal) / counts.total) * 100) : 0}%
                </span>
                <p className="text-[10px] text-text-muted mt-1">Operational evidence found</p>
              </div>
            </Card>
          </div>

          {/* Framework scores */}
          {assessment.framework_scores.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
                Framework Scores
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {assessment.framework_scores.map((fs) => (
                  <div
                    key={fs.frameworkId}
                    className="flex items-center justify-between rounded-xl border border-border-glass bg-white/5 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <span className="text-sm text-text-primary font-medium truncate block">
                        {resolveFrameworkName(fs.frameworkId)}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {fs.implementedCount}/{fs.totalRequired} controls
                      </span>
                    </div>
                    <span
                      className={`text-lg font-bold shrink-0 ml-3 ${
                        fs.score >= 70 ? "text-emerald-400" : fs.score >= 40 ? "text-amber-400" : "text-red-400"
                      }`}
                    >
                      {fs.score}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 2: Control Analysis ───────────────────────────────────── */}
      {activeTab === "Controls" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Search + Filter bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-4 w-4 text-text-muted" />
              </div>
              <input
                type="text"
                placeholder="Search controls..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-border-glass bg-white/5 py-2 pl-9 pr-4 text-sm text-text-primary outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-text-muted" />
              {(["all", "conforming", "partial", "informal", "gap"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
                    statusFilter === s
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-white/5 text-text-muted border border-transparent hover:bg-white/10"
                  }`}
                >
                  {s === "all" ? `All (${counts.total})` : `${STATUS_CONFIG[s].label} (${counts[s]})`}
                </button>
              ))}
            </div>
          </div>

          {/* Controls grouped by domain */}
          <div className="glass-card divide-y divide-white/5">
            {Object.entries(controlsByDomain)
              .filter(([, ctrls]) => ctrls.some((c) => filteredControls.includes(c)))
              .map(([domain, ctrls]) => {
                const domainFiltered = ctrls.filter((c) => filteredControls.includes(c));
                return (
                  <div key={domain} className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-mono text-xs font-bold text-primary bg-primary/10 rounded px-2 py-0.5">
                        {domain}
                      </span>
                      <span className="text-xs text-text-muted">{domainFiltered.length} controls</span>
                    </div>
                    <div className="space-y-1">
                      {domainFiltered.map((ctrl) => {
                        const cfg = STATUS_CONFIG[ctrl.status];
                        const isExpanded = expandedControl === ctrl.code;
                        return (
                          <div key={ctrl.code}>
                            <button
                              onClick={() => setExpandedControl(isExpanded ? null : ctrl.code)}
                              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-white/5 transition-colors text-left"
                            >
                              <div className="shrink-0">{cfg.icon}</div>
                              <span className="font-mono text-[11px] text-primary shrink-0">{ctrl.code}</span>
                              <span className="text-sm text-text-primary truncate flex-1">{ctrl.name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                {ctrl.needsReview && <Badge variant="warning" dot>Review</Badge>}
                                <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
                                <span className="text-[10px] text-text-muted">{ctrl.confidenceScore}%</span>
                                {isExpanded ? (
                                  <ChevronUp className="h-3.5 w-3.5 text-text-muted" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
                                )}
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="ml-10 mr-3 mb-3 p-3 rounded-lg bg-white/[0.03] border border-white/5 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                {/* ISMS Phase */}
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                                      Phase 1: ISMS Policy
                                    </span>
                                    {ctrl.ismsFound ? (
                                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                    ) : (
                                      <XCircle className="h-3 w-3 text-red-400" />
                                    )}
                                  </div>
                                  <p className="text-xs text-text-muted">
                                    {ctrl.ismsSnippet || (ctrl.ismsFound ? "Policy documentation found." : "No ISMS policy documentation found.")}
                                  </p>
                                </div>
                                {/* Evidence Phase */}
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                                      Phase 2: Operational Evidence
                                    </span>
                                    {ctrl.evidenceFound ? (
                                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                    ) : (
                                      <XCircle className="h-3 w-3 text-red-400" />
                                    )}
                                  </div>
                                  <p className="text-xs text-text-muted">
                                    {ctrl.evidenceSnippet || (ctrl.evidenceFound ? "Operational evidence found." : "No operational evidence found.")}
                                  </p>
                                </div>
                                {/* Auditor Notes */}
                                {ctrl.auditorNotes && (
                                  <div className="border-t border-white/5 pt-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                                      Auditor Notes
                                    </span>
                                    <p className="text-xs text-text-secondary mt-1">{ctrl.auditorNotes}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            {filteredControls.length === 0 && (
              <div className="p-12 text-center text-sm text-text-muted">
                No controls match your search or filter criteria.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Step 3: Gaps & Remediation ──────────────────────────────────── */}
      {activeTab === "Gaps" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Summary */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Gap Analysis Summary
            </h3>
            <p className="text-xs text-text-muted mb-4">
              {counts.gap + counts.informal} controls require attention. Prioritized by missing phases.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-center">
                <div className="text-3xl font-bold text-red-400">{counts.gap}</div>
                <div className="text-xs text-text-muted mt-1">Full Gaps (both phases missing)</div>
              </div>
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-center">
                <div className="text-3xl font-bold text-amber-400">{counts.partial}</div>
                <div className="text-xs text-text-muted mt-1">Partial (evidence missing)</div>
              </div>
              <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-4 text-center">
                <div className="text-3xl font-bold text-blue-400">{counts.informal}</div>
                <div className="text-xs text-text-muted mt-1">Informal (policy missing)</div>
              </div>
            </div>
          </div>

          {/* Gap list */}
          <div className="glass-card divide-y divide-white/5">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-text-primary">Non-Conforming Controls</h3>
              <p className="text-xs text-text-muted">Sorted by severity: Gaps → Partial → Informal</p>
            </div>
            {controls
              .filter((c) => c.status !== "conforming" && c.status !== "unknown")
              .sort((a, b) => {
                const order: Record<CombinedStatus, number> = { gap: 0, partial: 1, informal: 2, conforming: 3, unknown: 4 };
                return order[a.status] - order[b.status];
              })
              .map((ctrl) => {
                const cfg = STATUS_CONFIG[ctrl.status];
                const missingPhases = [];
                if (!ctrl.ismsFound) missingPhases.push("ISMS Policy");
                if (!ctrl.evidenceFound) missingPhases.push("Operational Evidence");

                return (
                  <div key={ctrl.code} className="flex items-start gap-3 p-4">
                    <div className="shrink-0 mt-0.5">{cfg.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-primary font-bold">{ctrl.code}</span>
                        <span className="text-sm text-text-primary">{ctrl.name}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {missingPhases.map((phase) => (
                          <span
                            key={phase}
                            className="inline-flex items-center gap-1 text-[10px] rounded-md bg-red-500/10 text-red-400 px-2 py-0.5"
                          >
                            <XCircle className="h-2.5 w-2.5" />
                            Missing: {phase}
                          </span>
                        ))}
                      </div>
                      {ctrl.auditorNotes && (
                        <p className="text-xs text-text-muted mt-1 line-clamp-2">{ctrl.auditorNotes}</p>
                      )}
                    </div>
                    <Badge variant={ctrl.status === "gap" ? "danger" : ctrl.status === "partial" ? "warning" : "info"}>
                      {cfg.label}
                    </Badge>
                  </div>
                );
              })}
            {controls.filter((c) => c.status !== "conforming" && c.status !== "unknown").length === 0 && (
              <div className="p-12 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
                <p className="text-sm text-text-primary font-medium">All controls are conforming!</p>
                <p className="text-xs text-text-muted mt-1">No gaps or remediation items found.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Step 4: Export & Actions ────────────────────────────────────── */}
      {activeTab === "Export" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
              Export Options
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button className="flex items-center gap-4 rounded-xl border border-border-glass bg-white/5 p-5 hover:bg-white/[0.07] hover:border-primary/30 transition-all text-left">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <FileDown className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="font-medium text-text-primary">Export PDF Report</div>
                  <div className="text-xs text-text-muted mt-0.5">Full compliance report with control details and gaps.</div>
                </div>
              </button>
              <button className="flex items-center gap-4 rounded-xl border border-border-glass bg-white/5 p-5 hover:bg-white/[0.07] hover:border-primary/30 transition-all text-left">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
                  <FileDown className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                  <div className="font-medium text-text-primary">Export CSV</div>
                  <div className="text-xs text-text-muted mt-0.5">Controls spreadsheet for external audit tools.</div>
                </div>
              </button>
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
              Assessment Info
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-text-muted block text-xs">Assessment ID</span>
                <span className="font-mono text-text-primary text-xs">{id}</span>
              </div>
              <div>
                <span className="text-text-muted block text-xs">Mode</span>
                <span className="text-text-primary capitalize">{assessment.mode}</span>
              </div>
              <div>
                <span className="text-text-muted block text-xs">Created</span>
                <span className="text-text-primary">
                  {assessment.created_at ? new Date(assessment.created_at).toLocaleString() : "—"}
                </span>
              </div>
              <div>
                <span className="text-text-muted block text-xs">Completed</span>
                <span className="text-text-primary">
                  {assessment.completed_at ? new Date(assessment.completed_at).toLocaleString() : "—"}
                </span>
              </div>
              <div>
                <span className="text-text-muted block text-xs">Sales Channel</span>
                <span className="text-text-primary">{assessment.sales_channel || "All channels"}</span>
              </div>
              <div>
                <span className="text-text-muted block text-xs">Frameworks</span>
                <span className="text-text-primary">
                  {assessment.frameworks.map((f) => resolveFrameworkName(f)).join(", ")}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
