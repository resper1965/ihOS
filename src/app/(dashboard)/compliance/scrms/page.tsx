"use client";

import React, { useState, useEffect } from "react";
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
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  const [baseline, setBaseline] = useState<ScrmsBaseline | null>(null);
  const [controls, setControls] = useState<ScrmsControl[]>([]);
  const [stats, setStats] = useState<ScrmsStats | null>(null);
  const [deltas, setDeltas] = useState<ProductDelta[]>([]);
  const [ismsStats, setIsmsStats] = useState<IsmsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [calibrating, setCalibrating] = useState(false);

  const handleRecalibrate = async () => {
    setCalibrating(true);
    try {
      const res = await fetch("/api/compliance/scrms", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchData();
      } else {
        alert(`Error: ${data.error || "Failed to recalibrate"}`);
      }
    } catch (err) {
      console.error("Error recalibrating:", err);
      alert("Failed to connect to the recalibration service.");
    } finally {
      setCalibrating(false);
    }
  };
  
  // Filtering & Search
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"PENDING" | "BASELINE">("PENDING");
  const [pptdfFilter, setPptdfFilter] = useState<string | null>(null);
  const [expandedControlId, setExpandedControlId] = useState<string | null>(null);


  // Dialog state for Rejection
  const [rejectingControl, setRejectingControl] = useState<ScrmsControl | null>(null);
  const [rationale, setRationale] = useState("");
  const [submittingReject, setSubmittingReject] = useState(false);

  // Load baseline & controls
  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/compliance/scrms");
      const data = await res.json();
      if (data.success) {
        setBaseline(data.baseline);
        setControls(data.controls);
        setStats(data.stats);
        setDeltas(data.deltas || []);
        setIsmsStats(data.ismsStats || null);
      }
    } catch (err) {
      console.error("Error loading SCRMS data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Accept DSR Control
  const handleAccept = async (id: string) => {
    try {
      const res = await fetch(`/api/compliance/scrms/controls/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" })
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch (err) {
      console.error("Error accepting DSR:", err);
    }
  };

  // Reject DSR Control (Submit)
  const handleRejectSubmit = async () => {
    if (!rejectingControl) return;
    setSubmittingReject(true);
    try {
      const res = await fetch(`/api/compliance/scrms/controls/${rejectingControl.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "rejected",
          rejection_rationale: rationale
        })
      });
      if (res.ok) {
        setRejectingControl(null);
        setRationale("");
        fetchData();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch (err) {
      console.error("Error rejecting DSR:", err);
    } finally {
      setSubmittingReject(false);
    }
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
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !baseline ? (
        <div className="glass-card flex flex-col items-center justify-center p-12 text-center">
          <AlertTriangle className="h-16 w-16 text-warning mb-4" />
          <h3 className="text-xl font-bold">No Active Program</h3>
          <p className="text-slate-300 mt-2 max-w-md">
            Please click the button below to initialize and calibrate the SCRMS GRC engine for your database.
          </p>
          <Button 
            onClick={handleRecalibrate}
            disabled={calibrating}
            className="mt-6 bg-primary hover:bg-primary-hover text-bg-dark font-semibold flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${calibrating ? "animate-spin" : ""}`} />
            {calibrating ? "Calibrating..." : "Calibrate & Seed Baseline"}
          </Button>
        </div>
      ) : (
        <>
          {/* Manual Recalibration Action Button */}
          <div className="flex justify-end mb-4">
            <Button
              onClick={handleRecalibrate}
              disabled={calibrating}
              className="bg-slate-800 hover:bg-slate-700 text-primary border border-primary/20 flex items-center gap-2 font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${calibrating ? "animate-spin" : ""}`} />
              {calibrating ? "Recalibrating..." : "Recalibrate Engine"}
            </Button>
          </div>

          {/* SCRMS Methodology & Core ISMS Status Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="md:col-span-2 glass-card border-l-4 border-emerald-400 bg-emerald-500/5 p-4 flex gap-3 items-start">
              <Info className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm text-emerald-400">SCRMS Core + Release Delta Methodology</h4>
                <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                  Compliance is validated against the global **ISMS Core** baseline (inherited organizational policies), while the release audit focuses strictly on the **technical differences** introduced by this version.
                </p>
              </div>
            </div>
            {ismsStats && (
              <div className="glass-card border-l-4 border-sky-400 bg-sky-500/5 p-4 flex flex-col justify-between">
                <div className="flex justify-between items-center text-xs font-semibold text-sky-400">
                  <span>Inherited Global ISMS Core</span>
                  <span>{ismsStats.implemented} / {ismsStats.total}</span>
                </div>
                <p className="text-[10px] text-slate-300 mt-1">Validated organizational change procedures.</p>
                <div className="w-full bg-slate-800 rounded-full h-1 mt-2">
                  <div 
                    className="bg-sky-400 h-1 rounded-full" 
                    style={{ width: `${(ismsStats.implemented / (ismsStats.total || 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* Version Deltas (Technical Diff) */}
          {deltas.length > 0 && (
            <div className="glass-card p-4 space-y-2 bg-amber-500/[0.01] border-amber-500/20 border">
              <h4 className="text-xs font-bold text-amber-400 tracking-wider uppercase">Active Technical Release Deltas (v2.2.x)</h4>
              <div className="flex flex-wrap gap-3">
                {deltas.map((delta) => (
                  <div key={delta.feature_slug} className="bg-slate-900/60 border border-white/5 rounded-xl p-3 text-xs flex flex-col justify-between max-w-sm flex-1 min-w-[250px]">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-extrabold text-slate-100">{delta.feature_slug}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${delta.risk_level === "high" ? "bg-red-500/10 text-red-400 border border-red-500/10" : "bg-amber-500/10 text-amber-400 border border-amber-500/10"}`}>{delta.risk_level} risk</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-normal">{delta.description}</p>
                    <div className="mt-2 pt-1.5 border-t border-white/5 flex gap-1 items-center">
                      <span className="text-[9px] font-semibold text-slate-400">Impacted Components:</span>
                      {delta.affected_components.map((comp) => (
                        <Badge key={comp} variant="neutral" className="text-[8px] px-1 py-0">{comp}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="glass-card p-5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
                <ShieldCheck className="h-12 w-12 text-primary" />
              </div>
              <h4 className="text-sm font-semibold text-slate-300">MCR Coverage</h4>
              <p className="text-3xl font-extrabold text-primary mt-2">
                {stats?.accepted_mcr} <span className="text-lg font-normal text-slate-300">/ {stats?.total_mcr}</span>
              </p>
              <p className="text-xs text-slate-200 mt-2">Mandatory compliance baseline (ISO 27001)</p>
            </div>
 
            <div className="glass-card p-5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
                <Target className="h-12 w-12 text-amber-400" />
              </div>
              <h4 className="text-sm font-semibold text-slate-300">DSR Recommendations</h4>
              <p className="text-3xl font-extrabold text-amber-400 mt-2">
                {stats?.accepted_dsr} <span className="text-lg font-normal text-slate-300">/ {stats?.total_dsr}</span>
              </p>
              <p className="text-xs text-slate-200 mt-2">{stats?.pending_dsr} pending reviews, {stats?.rejected_dsr} rejected</p>
            </div>

            <div className="glass-card p-5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
                <Layers className="h-12 w-12 text-emerald-400" />
              </div>
              <h4 className="text-sm font-semibold text-slate-300">MSR Score (MCR + DSR)</h4>
              <p className="text-3xl font-extrabold text-emerald-400 mt-2">
                {calculateMsrScore()}%
              </p>
              <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3">
                <div 
                  className="bg-emerald-400 h-1.5 rounded-full transition-all duration-500" 
                  style={{ width: `${calculateMsrScore()}%` }}
                ></div>
              </div>
            </div>

            <div className="glass-card p-5 relative overflow-hidden">
              <h4 className="text-sm font-semibold text-slate-300">PPTDF Scoping (Accepted)</h4>
              <div className="grid grid-cols-5 gap-1 text-center mt-3">
                <div className="bg-white/5 rounded p-1 group relative cursor-help">
                  <Users className="h-3.5 w-3.5 mx-auto text-sky-400" />
                  <span className="text-[10px] font-bold mt-1 block">{stats?.pptdf.People}</span>
                  <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black text-white text-[9px] p-1 rounded z-20 whitespace-nowrap">People</div>
                </div>
                <div className="bg-white/5 rounded p-1 group relative cursor-help">
                  <FileText className="h-3.5 w-3.5 mx-auto text-emerald-400" />
                  <span className="text-[10px] font-bold mt-1 block">{stats?.pptdf.Process}</span>
                  <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black text-white text-[9px] p-1 rounded z-20 whitespace-nowrap">Process</div>
                </div>
                <div className="bg-white/5 rounded p-1 group relative cursor-help">
                  <Cpu className="h-3.5 w-3.5 mx-auto text-amber-400" />
                  <span className="text-[10px] font-bold mt-1 block">{stats?.pptdf.Technology}</span>
                  <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black text-white text-[9px] p-1 rounded z-20 whitespace-nowrap">Technology</div>
                </div>
                <div className="bg-white/5 rounded p-1 group relative cursor-help">
                  <HardDrive className="h-3.5 w-3.5 mx-auto text-purple-400" />
                  <span className="text-[10px] font-bold mt-1 block">{stats?.pptdf.Data}</span>
                  <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black text-white text-[9px] p-1 rounded z-20 whitespace-nowrap">Data</div>
                </div>
                <div className="bg-white/5 rounded p-1 group relative cursor-help">
                  <Home className="h-3.5 w-3.5 mx-auto text-rose-400" />
                  <span className="text-[10px] font-bold mt-1 block">{stats?.pptdf.Facilities}</span>
                  <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-black text-white text-[9px] p-1 rounded z-20 whitespace-nowrap">Facilities</div>
                </div>
              </div>
            </div>
          </div>

          {/* Calibration Progress bar */}
          {activeTab === "PENDING" && (
            <div className="glass-card p-5 mb-6 space-y-3 bg-white/[0.01]">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-200">
                <span>Recommendations Calibration Status</span>
                <span>{controls.filter(c => c.classification === "DSR" && c.status !== "pending_review").length} of {controls.filter(c => c.classification === "DSR").length} reviewed ({controls.filter(c => c.classification === "DSR").length > 0 ? Math.round((controls.filter(c => c.classification === "DSR" && c.status !== "pending_review").length / controls.filter(c => c.classification === "DSR").length) * 100) : 0}%)</span>
              </div>
              <Progress 
                value={controls.filter(c => c.classification === "DSR" && c.status !== "pending_review").length} 
                max={controls.filter(c => c.classification === "DSR").length || 1} 
                showPercentage={false} 
                size="sm" 
              />
            </div>
          )}

          {/* Filters & Tabs panel */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Tabs */}
            <div className="flex bg-slate-800/40 p-1.5 rounded-xl border border-white/5 self-start">
              {(["PENDING", "BASELINE"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setPptdfFilter(null); }}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    activeTab === tab 
                      ? "bg-primary text-white shadow-sm" 
                      : "text-slate-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab === "PENDING" && `Pending Recommendations (${controls.filter(c => c.classification === "DSR" && c.status === "pending_review").length})`}
                  {tab === "BASELINE" && "Active Security Baseline (MSR)"}
                </button>
              ))}
            </div>


            {/* PPTDF & Search Filter Row */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 bg-slate-800/40 p-1 border border-white/5 rounded-xl">
                <button 
                  onClick={() => setPptdfFilter(null)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold transition-all ${!pptdfFilter ? "bg-white/10 text-white" : "text-slate-300 hover:text-white hover:bg-white/5"}`}
                >
                  All Scopes
                </button>
                {["People", "Process", "Technology", "Data", "Facilities"].map((scope) => (
                  <button
                    key={scope}
                    onClick={() => setPptdfFilter(scope)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold transition-all ${
                      pptdfFilter === scope ? "bg-primary/20 text-primary" : "text-slate-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {scope}
                  </button>
                ))}
              </div>

              <div className="relative w-full max-w-xs sm:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  placeholder="Search code, name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-slate-800/40 border-white/5"
                />
              </div>
            </div>
          </div>

          {/* Controls list */}
          <div className="space-y-4">
            {filteredControls.length === 0 ? (
              <div className="glass-card text-center p-8 text-text-muted">
                {activeTab === "PENDING" 
                  ? "All recommendations have been reviewed! Your baseline is calibrated. 🎉"
                  : "No controls match the selected filters."}
              </div>
            ) : (
              filteredControls.map((c) => {
                const isHighPriority = c.classification === "DSR" && c.dsr_score >= 75;
                const isMedPriority = c.classification === "DSR" && c.dsr_score >= 50 && c.dsr_score < 75;
                const isLowPriority = c.classification === "DSR" && c.dsr_score < 50;

                return (
                  <div key={c.id} className="glass-card hover-glow p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all duration-300">
                    <div className="space-y-2 max-w-3xl w-full">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-sm text-primary tracking-wider">{c.control_code}</span>
                        
                        {c.classification === "MCR" ? (
                          <Badge variant="info">MCR Compliance</Badge>
                        ) : (
                          <>
                            {isHighPriority && <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/10">High Priority</span>}
                            {isMedPriority && <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/10">Medium Priority</span>}
                            {isLowPriority && <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/10">Low Priority</span>}
                          </>
                        )}
                        
                        {c.dsr_factors?.delta_impact_boost && c.dsr_factors.delta_impact_boost > 0 && (
                          <Badge variant="warning" className="text-[9px] px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/10">
                            DIF Triggered (+{c.dsr_factors.delta_impact_boost} pts)
                          </Badge>
                        )}

                        {c.status === "accepted" && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Scoped in MSR
                          </span>
                        )}
                        {c.status === "rejected" && (
                          <span className="flex items-center gap-1 text-[10px] text-red-400 font-bold bg-red-500/10 px-2 py-0.5 rounded-full">
                            <XCircle className="h-3 w-3" /> Risk Accepted (Rejected)
                          </span>
                        )}
                      </div>
                      
                      <h3 className="font-extrabold text-sm text-text-primary">{c.control_name}</h3>
                      <p className="text-xs text-slate-200 leading-relaxed font-medium">{c.description}</p>
                      
                      {/* Rejection / Risk acceptance note */}
                      {c.status === "rejected" && c.rejection_rationale && (
                        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2.5 mt-2">
                          <p className="text-[10px] font-bold text-red-400">Risk Acceptance Rationale:</p>
                          <p className="text-xs text-slate-400 italic mt-0.5">"{c.rejection_rationale}"</p>
                        </div>
                      )}

                      {/* Expandable Details Wrapper */}
                      <div className="pt-1 flex items-center justify-between">
                        <button
                          onClick={() => setExpandedControlId(expandedControlId === c.id ? null : c.id)}
                          className="text-[10px] text-primary hover:underline font-semibold flex items-center gap-1 focus:outline-none"
                        >
                          <Info className="h-3 w-3" />
                          {expandedControlId === c.id ? "Hide details" : "Show implementation scope & math"}
                        </button>
                      </div>

                      {expandedControlId === c.id && (
                        <div className="space-y-2.5 bg-white/[0.02] p-3 rounded-lg border border-white/5 mt-2">
                          {/* DSR Factors detail */}
                          {c.classification === "DSR" && c.dsr_factors && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-slate-200">
                              <div><span className="font-bold text-slate-100">Coverage Gap:</span> {c.dsr_factors.domain_coverage_gap}%</div>
                              <div><span className="font-bold text-slate-100">Relevance:</span> {c.dsr_factors.industry_relevance}%</div>
                              <div><span className="font-bold text-slate-100">Risk Factor:</span> {c.dsr_factors.risk_appetite_factor}%</div>
                              <div><span className="font-bold text-slate-100">Maturity:</span> {c.dsr_factors.maturity_alignment}%</div>
                            </div>
                          )}

                          {/* PPTDF Tags */}
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-[10px] font-extrabold text-slate-300">Asset Vectors:</span>
                            {c.pptdf_scope.map((scope) => (
                              <Badge key={scope} variant="neutral" className="text-[9px] px-1.5 py-0">
                                {scope}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions (Only editable for DSR recommendations) */}
                    {c.classification === "DSR" && (
                      <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                        {c.status !== "accepted" && (
                          <Button 
                            size="sm" 
                            onClick={() => handleAccept(c.id)}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-1"
                          >
                            <Check className="h-3 w-3" /> Accept DSR
                          </Button>
                        )}
                        {c.status !== "rejected" && (
                          <Button 
                            size="sm" 
                            variant="danger"
                            onClick={() => setRejectingControl(c)}
                            className="flex items-center gap-1"
                          >
                            <X className="h-3 w-3" /> Reject
                          </Button>
                        )}
                        {(c.status === "accepted" || c.status === "rejected") && (
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => {
                              fetch(`/api/compliance/scrms/controls/${c.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: "pending_review" })
                              }).then(() => fetchData());
                            }}
                            className="text-slate-400 hover:text-white"
                          >
                            Reset Control
                          </Button>
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

      {/* Reject Modal / Risk Acceptance Dialog */}
      <Dialog 
        open={rejectingControl !== null} 
        onClose={() => setRejectingControl(null)}
        title="Risk Acceptance Review"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-slate-200 leading-relaxed font-semibold">
              You are rejecting the recommended control <strong>{rejectingControl?.control_code}</strong> ({rejectingControl?.control_name}).
            </p>
            <p className="text-[10px] text-red-300 font-semibold italic leading-relaxed">
              *ISO 27001 requires documenting a formal risk acceptance rationale if a recommended security control is not implemented.*
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400">Describe Risk Acceptance Rationale:</label>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="e.g. Workstations are fully offline and blocked via host firewall, rendering remote endpoint monitoring controls not applicable..."
              rows={4}
              className="w-full text-xs bg-slate-900 border border-white/10 rounded-xl p-3 text-text-primary focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setRejectingControl(null)}>
              Cancel
            </Button>
            <Button 
              variant="danger" 
              size="sm" 
              onClick={handleRejectSubmit}
              disabled={!rationale.trim() || submittingReject}
            >
              {submittingReject ? "Submitting..." : "Reject Control"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
