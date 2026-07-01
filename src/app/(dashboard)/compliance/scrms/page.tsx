"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Target,
  RefreshCw,
  Search,
  Info,
  Users,
  Cpu,
  Layers,
  HardDrive,
  Home,
  Check,
  X
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useScrmsData,
  useRecalibrate,
  useAcceptControl,
  useRejectControl,
  scrmsKeys,
} from "@/hooks/queries/use-scrms";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";


interface DsrFactors {
  domain_coverage_gap: number;
  industry_relevance: number;
  risk_appetite_factor: number;
  maturity_alignment: number;
  control_importance_weight: number;
  delta_impact_boost?: number;
}

interface ProductDelta {
  feature_slug: string;
  description: string;
  affected_components: string[];
  risk_level: string;
}

interface IsmsStats {
  total: number;
  implemented: number;
}

interface ScrmsControl {
  id: string;
  control_code: string;
  classification: "MCR" | "DSR";
  status: "pending_review" | "accepted" | "rejected";
  rejection_rationale: string | null;
  dsr_score: number;
  dsr_factors: DsrFactors;
  pptdf_scope: string[];
  control_name: string;
  description: string;
}

interface ScrmsStats {
  total_mcr: number;
  total_dsr: number;
  accepted_mcr: number;
  accepted_dsr: number;
  pending_dsr: number;
  rejected_dsr: number;
  pptdf: {
    People: number;
    Process: number;
    Technology: number;
    Data: number;
    Facilities: number;
  };
}

interface ScrmsBaseline {
  id: string;
  name: string;
  description: string;
  status: string;
  version_code: string;
}

export default function ScrmsPage() {
  // ── React Query: data layer ──
  const queryClient = useQueryClient();
  const { data: scrmsData, isLoading: loading } = useScrmsData();
  const recalibrate = useRecalibrate();
  const acceptControl = useAcceptControl();
  const rejectControl = useRejectControl();

  // Destructure query data with safe defaults
  const baseline = (scrmsData?.baseline as unknown as ScrmsBaseline) ?? null;
  const controls = (scrmsData?.controls as unknown as ScrmsControl[]) ?? [];
  const stats = (scrmsData?.stats as unknown as ScrmsStats) ?? null;
  const deltas = (scrmsData?.deltas as unknown as ProductDelta[]) ?? [];
  const ismsStats = (scrmsData?.ismsStats as unknown as IsmsStats) ?? null;

  // Derived state from mutations
  const calibrating = recalibrate.isPending;

  const handleRecalibrate = () => {
    recalibrate.mutate();
  };

  // Filtering & Search
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"PENDING" | "BASELINE">("PENDING");
  const [pptdfFilter, setPptdfFilter] = useState<string | null>(null);
  const [expandedControlId, setExpandedControlId] = useState<string | null>(null);


  // Dialog state for Rejection
  const [rejectingControl, setRejectingControl] = useState<ScrmsControl | null>(null);
  const [rationale, setRationale] = useState("");

  // Accept DSR Control
  const handleAccept = (id: string) => {
    acceptControl.mutate(id);
  };

  // Reject DSR Control (Submit)
  const handleRejectSubmit = () => {
    if (!rejectingControl) return;
    rejectControl.mutate(
      { controlId: rejectingControl.id, rationale },
      {
        onSuccess: () => {
          setRejectingControl(null);
          setRationale("");
        },
      }
    );
  };

  const filteredControls = controls.filter((c) => {
    // Search filter
    const matchesSearch =
      c.control_code.toLowerCase().includes(search.toLowerCase()) ||
      c.control_name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase());

    // Tab filter
    let matchesTab = true;
    if (activeTab === "PENDING") {
      matchesTab = c.classification === "DSR" && c.status === "pending_review";
    } else if (activeTab === "BASELINE") {
      matchesTab = c.classification === "MCR" || c.status === "accepted";
    }

    // PPTDF filter
    const matchesPptdf = pptdfFilter ? c.pptdf_scope.includes(pptdfFilter) : true;

    return matchesSearch && matchesTab && matchesPptdf;
  });


  // Score calculations
  const calculateMsrScore = () => {
    if (!stats) return 0;
    const totalRequired = stats.total_mcr + stats.total_dsr;
    const implemented = stats.accepted_mcr + stats.accepted_dsr;
    if (totalRequired === 0) return 0;
    return Math.round((implemented / totalRequired) * 100);
  };

  return (
    <div className="w-full space-y-6 text-text-primary">
      <PageTitleRegistrar
        title={<>SCRMS <span className="text-emerald-400">Security Baseline</span></>}
        subtitle={baseline ? `${baseline.name} — nCommand Lite ${baseline.version_code}` : "Consolidating MCRs and DSRs to build your Minimum Security Requirements (MSR)."}
        icon={<Target className="h-4 w-4 text-primary" />}
      />

      {loading ? (
        /* ── Loading State ── */
        <div className="flex h-64 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-text-muted">Loading security baseline…</p>
          </div>
        </div>

      ) : !baseline ? (
        /* ── Empty State: No Program ── */
        <div className="glass-card flex flex-col items-center justify-center gap-4 p-16 text-center">
          <div className="rounded-2xl bg-warning/10 p-5">
            <AlertTriangle className="h-12 w-12 text-warning" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-text-primary">No Active Security Program</h3>
            <p className="mt-2 max-w-md text-sm text-text-muted">
              Initialize the SCRMS engine to generate your Minimum Security Requirements baseline from the SCF catalogue.
            </p>
          </div>
          <Button
            onClick={handleRecalibrate}
            disabled={calibrating}
            className="mt-2 bg-primary hover:bg-primary-hover text-bg-dark font-semibold flex items-center gap-2 px-6 py-2.5"
          >
            <RefreshCw className={`h-4 w-4 ${calibrating ? "animate-spin" : ""}`} />
            {calibrating ? "Calibrating…" : "Calibrate & Seed Baseline"}
          </Button>
        </div>

      ) : (
        <>
          {/* ── Top Action Bar ── */}
          <div className="flex items-center justify-between">
            {/* Methodology pill */}
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-emerald-400">
                SCRMS Core + Release Delta active
              </span>
              {ismsStats && (
                <span className="ml-2 text-xs text-text-muted">
                  · ISMS Core: <strong className="text-sky-400">{ismsStats.implemented}/{ismsStats.total}</strong> inherited
                </span>
              )}
            </div>

            <Button
              onClick={handleRecalibrate}
              disabled={calibrating}
              className="flex items-center gap-2 rounded-xl border border-primary/20 bg-white/5 px-4 py-2 text-sm font-semibold text-primary hover:bg-white/10 transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${calibrating ? "animate-spin" : ""}`} />
              {calibrating ? "Recalibrating…" : "Recalibrate Engine"}
            </Button>
          </div>

          {/* ── Methodology Explainer ── */}
          <div className="glass-card p-5 flex gap-4 items-start border-l-4 border-emerald-500/60">
            <div className="mt-0.5 rounded-xl bg-emerald-500/10 p-2 shrink-0">
              <Info className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-text-primary">
                How SCRMS Works
              </h4>
              <p className="text-sm text-text-muted leading-relaxed max-w-3xl">
                Controls are split into two categories:{" "}
                <span className="font-semibold text-text-primary">MCR (Mandatory Controls)</span> — your non-negotiable ISO 27001 baseline — and{" "}
                <span className="font-semibold text-text-primary">DSR (Dynamic Recommendations)</span> — AI-scored controls specific to your product's risk profile and this release's technical changes.
                Accept or reject each DSR to build your final{" "}
                <span className="font-semibold text-emerald-400">MSR (Minimum Security Requirements)</span>.
              </p>
            </div>
          </div>

          {/* ── Active Technical Deltas ── */}
          {deltas.length > 0 && (
            <div className="glass-card p-5 space-y-4 border border-amber-500/15">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-amber-500/10 p-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-400">Active Release Deltas</h4>
                  <p className="text-xs text-text-muted">Technical changes in this release that triggered new DSR recommendations</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {deltas.map((delta) => (
                  <div
                    key={delta.feature_slug}
                    className="flex-1 min-w-[240px] max-w-sm rounded-xl border border-white/8 bg-white/[0.03] p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-text-primary">{delta.feature_slug}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        delta.risk_level === "high"
                          ? "bg-red-500/10 text-red-400 border-red-500/15"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/15"
                      }`}>
                        {delta.risk_level} risk
                      </span>
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed">{delta.description}</p>
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-white/5">
                      <span className="text-[10px] font-semibold text-text-muted mr-1">Impacts:</span>
                      {delta.affected_components.map((comp) => (
                        <Badge key={comp} variant="neutral" className="text-[9px] px-1.5 py-0">{comp}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Stats Cards ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

            {/* MCR Coverage */}
            <div className="glass-card group relative overflow-hidden p-5 cursor-default">
              <div className="absolute right-4 top-4 opacity-[0.07] transition-transform duration-300 group-hover:scale-110 group-hover:opacity-[0.12]">
                <ShieldCheck className="h-16 w-16 text-primary" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">MCR Coverage</p>
              <p className="mt-3 text-4xl font-extrabold tabular-nums text-primary">
                {stats?.accepted_mcr}
                <span className="ml-1 text-xl font-normal text-text-muted">/ {stats?.total_mcr}</span>
              </p>
              <p className="mt-2 text-xs text-text-muted">Mandatory ISO 27001 controls</p>
              <div className="mt-3 h-1 rounded-full bg-white/5">
                <div
                  className="h-1 rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${stats?.total_mcr ? ((stats.accepted_mcr / stats.total_mcr) * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* DSR Recommendations */}
            <div className="glass-card group relative overflow-hidden p-5 cursor-default">
              <div className="absolute right-4 top-4 opacity-[0.07] transition-transform duration-300 group-hover:scale-110 group-hover:opacity-[0.12]">
                <Target className="h-16 w-16 text-amber-400" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">DSR Accepted</p>
              <p className="mt-3 text-4xl font-extrabold tabular-nums text-amber-400">
                {stats?.accepted_dsr}
                <span className="ml-1 text-xl font-normal text-text-muted">/ {stats?.total_dsr}</span>
              </p>
              <div className="mt-2 flex gap-3 text-xs text-text-muted">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60 inline-block" />
                  {stats?.pending_dsr} pending
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400/60 inline-block" />
                  {stats?.rejected_dsr} rejected
                </span>
              </div>
            </div>

            {/* MSR Score */}
            <div className="glass-card group relative overflow-hidden p-5 cursor-default">
              <div className="absolute right-4 top-4 opacity-[0.07] transition-transform duration-300 group-hover:scale-110 group-hover:opacity-[0.12]">
                <Layers className="h-16 w-16 text-emerald-400" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">MSR Score</p>
              <p className="mt-3 text-4xl font-extrabold tabular-nums text-emerald-400">
                {calculateMsrScore()}
                <span className="text-xl font-normal text-text-muted">%</span>
              </p>
              <p className="mt-1 text-xs text-text-muted">Combined MCR + DSR compliance</p>
              <div className="mt-3 h-2 rounded-full bg-white/5">
                <div
                  className="h-2 rounded-full bg-emerald-400 transition-all duration-700"
                  style={{ width: `${calculateMsrScore()}%` }}
                />
              </div>
            </div>

            {/* PPTDF Breakdown */}
            <div className="glass-card p-5 cursor-default">
              <p className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-4">
                Accepted — by Scope
              </p>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: "People", icon: Users, value: stats?.pptdf.People, color: "text-sky-400", bg: "bg-sky-400/10" },
                  { label: "Process", icon: FileText, value: stats?.pptdf.Process, color: "text-emerald-400", bg: "bg-emerald-400/10" },
                  { label: "Tech", icon: Cpu, value: stats?.pptdf.Technology, color: "text-amber-400", bg: "bg-amber-400/10" },
                  { label: "Data", icon: HardDrive, value: stats?.pptdf.Data, color: "text-purple-400", bg: "bg-purple-400/10" },
                  { label: "Facility", icon: Home, value: stats?.pptdf.Facilities, color: "text-rose-400", bg: "bg-rose-400/10" },
                ].map(({ label, icon: Icon, value, color, bg }) => (
                  <div key={label} className={`flex flex-col items-center gap-1 rounded-xl ${bg} p-2`} title={label}>
                    <Icon className={`h-4 w-4 ${color}`} />
                    <span className={`text-sm font-bold tabular-nums ${color}`}>{value ?? 0}</span>
                    <span className="text-[9px] font-medium text-text-muted leading-tight text-center">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Review Progress Bar ── */}
          {activeTab === "PENDING" && stats && stats.total_dsr > 0 && (
            <div className="glass-card p-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-text-primary">Review Progress</span>
                <span className="tabular-nums font-bold text-text-muted">
                  {controls.filter(c => c.classification === "DSR" && c.status !== "pending_review").length}
                  {" / "}
                  {controls.filter(c => c.classification === "DSR").length} reviewed
                  {" · "}
                  <span className="text-primary">
                    {controls.filter(c => c.classification === "DSR").length > 0
                      ? Math.round((controls.filter(c => c.classification === "DSR" && c.status !== "pending_review").length / controls.filter(c => c.classification === "DSR").length) * 100)
                      : 0}%
                  </span>
                </span>
              </div>
              <Progress
                value={controls.filter(c => c.classification === "DSR" && c.status !== "pending_review").length}
                max={controls.filter(c => c.classification === "DSR").length || 1}
                showPercentage={false}
                size="sm"
              />
            </div>
          )}

          {/* ── Filters & Tabs ── */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Tabs */}
            <div className="flex bg-white/[0.04] p-1 rounded-xl border border-white/8 self-start gap-1">
              {(["PENDING", "BASELINE"] as const).map((tab) => {
                const count = tab === "PENDING"
                  ? controls.filter(c => c.classification === "DSR" && c.status === "pending_review").length
                  : controls.filter(c => c.classification === "MCR" || c.status === "accepted").length;
                return (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setPptdfFilter(null); }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                      activeTab === tab
                        ? "bg-primary text-white shadow-md shadow-primary/20"
                        : "text-text-muted hover:text-text-primary hover:bg-white/5"
                    }`}
                  >
                    {tab === "PENDING" ? "Pending Review" : "Active Baseline (MSR)"}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums ${
                      activeTab === tab ? "bg-white/20 text-white" : "bg-white/8 text-text-muted"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Scope + Search */}
            <div className="flex flex-wrap items-center gap-2">
              {/* PPTDF scope pills */}
              <div className="flex items-center gap-1 bg-white/[0.04] p-1 border border-white/8 rounded-xl">
                <button
                  onClick={() => setPptdfFilter(null)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !pptdfFilter
                      ? "bg-primary/15 text-primary"
                      : "text-text-muted hover:text-text-primary hover:bg-white/5"
                  }`}
                >
                  All
                </button>
                {[
                  { label: "People", icon: Users },
                  { label: "Process", icon: FileText },
                  { label: "Technology", icon: Cpu },
                  { label: "Data", icon: HardDrive },
                  { label: "Facilities", icon: Home },
                ].map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    onClick={() => setPptdfFilter(label)}
                    title={label}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      pptdfFilter === label
                        ? "bg-primary/15 text-primary"
                        : "text-text-muted hover:text-text-primary hover:bg-white/5"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search controls…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 w-full rounded-xl border border-white/8 bg-white/[0.04] px-4 py-2.5 text-sm text-text-primary outline-none transition-all duration-300 placeholder:text-text-muted focus:border-primary/50 focus:bg-transparent dark:focus:bg-transparent focus:ring-2 focus:ring-primary/20 hover:border-border-glass-hover"
                />
              </div>
            </div>
          </div>

          {/* ── Control Cards ── */}
          <div className="space-y-3">
            {filteredControls.length === 0 ? (
              <div className="glass-card flex flex-col items-center gap-3 p-12 text-center">
                <div className="rounded-2xl bg-emerald-500/10 p-4">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                </div>
                <p className="text-base font-semibold text-text-primary">
                  {activeTab === "PENDING"
                    ? "All recommendations reviewed"
                    : "No controls match the filters"}
                </p>
                <p className="text-sm text-text-muted max-w-xs">
                  {activeTab === "PENDING"
                    ? "Your security baseline is fully calibrated. No pending DSR decisions remain."
                    : "Try clearing the scope filter or search term."}
                </p>
              </div>
            ) : (
              filteredControls.map((c) => {
                const isHighPriority = c.classification === "DSR" && c.dsr_score >= 75;
                const isMedPriority  = c.classification === "DSR" && c.dsr_score >= 50 && c.dsr_score < 75;
                const isLowPriority  = c.classification === "DSR" && c.dsr_score < 50;
                const isExpanded = expandedControlId === c.id;

                // Border accent by status
                const borderClass =
                  c.status === "accepted" ? "border-l-2 border-l-emerald-500/60" :
                  c.status === "rejected" ? "border-l-2 border-l-red-500/60" :
                  "border-l-2 border-l-white/10";

                return (
                  <div
                    key={c.id}
                    className={`glass-card p-5 flex flex-col md:flex-row md:items-start gap-5 transition-all duration-200 ${borderClass} hover:bg-white/[0.03]`}
                  >
                    {/* Left: content */}
                    <div className="flex-1 min-w-0 space-y-2.5">

                      {/* Code + badges row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-extrabold text-primary tracking-wider">
                          {c.control_code}
                        </span>

                        {c.classification === "MCR"
                          ? <Badge variant="info" className="text-[10px]">Mandatory (MCR)</Badge>
                          : <>
                              {isHighPriority && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/15">
                                  <AlertTriangle className="h-2.5 w-2.5" /> High Priority
                                </span>
                              )}
                              {isMedPriority && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/15">
                                  Medium Priority
                                </span>
                              )}
                              {isLowPriority && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-text-muted border border-white/8">
                                  Low Priority
                                </span>
                              )}
                              {c.dsr_factors?.delta_impact_boost && c.dsr_factors.delta_impact_boost > 0 && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/15">
                                  +{c.dsr_factors.delta_impact_boost} pts (Release Delta)
                                </span>
                              )}
                            </>
                        }

                        {c.status === "accepted" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
                            <CheckCircle2 className="h-3 w-3" /> In MSR Baseline
                          </span>
                        )}
                        {c.status === "rejected" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/15">
                            <XCircle className="h-3 w-3" /> Risk Accepted
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-bold text-text-primary leading-snug">{c.control_name}</h3>

                      {/* Description */}
                      <p className="text-sm text-text-muted leading-relaxed">{c.description}</p>

                      {/* Rejection rationale */}
                      {c.status === "rejected" && c.rejection_rationale && (
                        <div className="rounded-xl bg-red-500/5 border border-red-500/15 p-3 space-y-1">
                          <p className="text-xs font-bold text-red-400">Risk Acceptance Rationale</p>
                          <p className="text-xs text-text-muted italic">"{c.rejection_rationale}"</p>
                        </div>
                      )}

                      {/* Expand toggle */}
                      <button
                        onClick={() => setExpandedControlId(isExpanded ? null : c.id)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-primary/70 hover:text-primary transition-colors cursor-pointer"
                      >
                        <Info className="h-3.5 w-3.5" />
                        {isExpanded ? "Hide details" : "View implementation scope & scoring"}
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="rounded-xl bg-white/[0.02] border border-white/8 p-4 space-y-3 mt-1">
                          {c.classification === "DSR" && c.dsr_factors && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {[
                                { label: "Coverage Gap", value: c.dsr_factors.domain_coverage_gap },
                                { label: "Industry Relevance", value: c.dsr_factors.industry_relevance },
                                { label: "Risk Appetite", value: c.dsr_factors.risk_appetite_factor },
                                { label: "Maturity Alignment", value: c.dsr_factors.maturity_alignment },
                              ].map(({ label, value }) => (
                                <div key={label} className="space-y-1">
                                  <p className="text-[10px] font-semibold text-text-muted">{label}</p>
                                  <p className="text-sm font-bold text-text-primary tabular-nums">{value}%</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {c.pptdf_scope.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 items-center pt-2 border-t border-white/5">
                              <span className="text-[10px] font-semibold text-text-muted">Asset Vectors:</span>
                              {c.pptdf_scope.map((scope) => (
                                <Badge key={scope} variant="neutral" className="text-[9px] px-1.5 py-0">{scope}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    {c.classification === "DSR" && (
                      <div className="flex flex-row md:flex-col items-center gap-2 shrink-0 self-end md:self-start pt-1">
                        {c.status !== "accepted" && (
                          <Button
                            size="sm"
                            onClick={() => handleAccept(c.id)}
                            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg font-semibold text-xs px-3 py-2 cursor-pointer transition-all"
                          >
                            <Check className="h-3.5 w-3.5" /> Accept DSR
                          </Button>
                        )}
                        {c.status !== "rejected" && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setRejectingControl(c)}
                            className="flex items-center gap-1.5 rounded-lg font-semibold text-xs px-3 py-2 cursor-pointer transition-all"
                          >
                            <X className="h-3.5 w-3.5" /> Reject
                          </Button>
                        )}
                        {(c.status === "accepted" || c.status === "rejected") && (
                          <button
                            onClick={() => {
                              fetch(`/api/compliance/scrms/controls/${c.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: "pending_review" }),
                              }).then(() => queryClient.invalidateQueries({ queryKey: scrmsKeys.all }));
                            }}
                            className="text-xs text-text-muted hover:text-text-primary underline underline-offset-2 cursor-pointer transition-colors"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ── Risk Acceptance Dialog ── */}
      <Dialog
        open={rejectingControl !== null}
        onClose={() => setRejectingControl(null)}
        title="Risk Acceptance Review"
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-red-500/5 border border-red-500/15 p-4 space-y-1.5">
            <p className="text-sm font-semibold text-text-primary">
              Rejecting{" "}
              <span className="font-mono text-red-400">{rejectingControl?.control_code}</span>{" "}
              — {rejectingControl?.control_name}
            </p>
            <p className="text-xs text-text-muted leading-relaxed">
              ISO 27001 requires a formal risk acceptance rationale whenever a recommended control is not implemented.
              This will be recorded in your audit trail.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-text-muted">Risk Acceptance Rationale</label>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="e.g. Workstations are fully offline and blocked via host firewall, rendering remote endpoint monitoring controls not applicable…"
              rows={4}
              className="w-full resize-none rounded-xl bg-white/[0.03] border border-white/10 p-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-red-500/50 transition-colors"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setRejectingControl(null)} className="cursor-pointer">
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleRejectSubmit}
              disabled={!rationale.trim() || rejectControl.isPending}
              className="cursor-pointer"
            >
              {rejectControl.isPending ? "Submitting…" : "Confirm Risk Acceptance"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
