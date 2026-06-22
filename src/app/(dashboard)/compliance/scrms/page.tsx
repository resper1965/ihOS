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

interface DsrFactors {
  domain_coverage_gap: number;
  industry_relevance: number;
  risk_appetite_factor: number;
  maturity_alignment: number;
  control_importance_weight: number;
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
  const [loading, setLoading] = useState(true);
  
  // Filtering & Search
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"ALL" | "MCR" | "DSR" | "MSR">("ALL");
  const [pptdfFilter, setPptdfFilter] = useState<string | null>(null);

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

  // Filter logic
  const filteredControls = controls.filter((c) => {
    // Search filter
    const matchesSearch =
      c.control_code.toLowerCase().includes(search.toLowerCase()) ||
      c.control_name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase());

    // Tab filter
    let matchesTab = true;
    if (activeTab === "MCR") {
      matchesTab = c.classification === "MCR";
    } else if (activeTab === "DSR") {
      matchesTab = c.classification === "DSR";
    } else if (activeTab === "MSR") {
      matchesTab = c.status === "accepted";
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
    <div className="w-full space-y-8 text-text-primary">
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
          <p className="text-text-muted mt-2 max-w-md">
            Please run the SCRMS GRC engine calibration script (`run_scrms_calibration.py`) on your backend database to seed the active program baseline.
          </p>
        </div>
      ) : (
        <>
          {/* SCRMS Methodology Summary banner */}
          <div className="glass-card border-l-4 border-emerald-400 bg-emerald-500/5 p-4 flex gap-3 items-start">
            <Info className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm text-emerald-400">SCRMS Methodology (Compliance vs Security)</h4>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                Compliance frameworks set the floor (**MCR - Minimum Compliance Requirements**). SCRMS evaluates gaps using your RAG knowledge base and calculates risk-driven controls (**DSR - Discretionary Security Requirements**) to form your ultimate **MSR (Minimum Security Requirements)** baseline.
              </p>
            </div>
          </div>

          {/* Stats Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="glass-card p-5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
                <ShieldCheck className="h-12 w-12 text-primary" />
              </div>
              <h4 className="text-sm font-semibold text-text-muted">MCR Coverage</h4>
              <p className="text-3xl font-extrabold text-primary mt-2">
                {stats?.accepted_mcr} <span className="text-lg font-normal text-text-muted">/ {stats?.total_mcr}</span>
              </p>
              <p className="text-xs text-text-muted mt-2">Mandatory compliance baseline (ISO 27001)</p>
            </div>

            <div className="glass-card p-5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
                <Target className="h-12 w-12 text-amber-400" />
              </div>
              <h4 className="text-sm font-semibold text-text-muted">DSR Recommendations</h4>
              <p className="text-3xl font-extrabold text-amber-400 mt-2">
                {stats?.accepted_dsr} <span className="text-lg font-normal text-text-muted">/ {stats?.total_dsr}</span>
              </p>
              <p className="text-xs text-text-muted mt-2">{stats?.pending_dsr} pending reviews, {stats?.rejected_dsr} rejected</p>
            </div>

            <div className="glass-card p-5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
                <Layers className="h-12 w-12 text-emerald-400" />
              </div>
              <h4 className="text-sm font-semibold text-text-muted">MSR Score (MCR + DSR)</h4>
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
              <h4 className="text-sm font-semibold text-text-muted">PPTDF Scoping (Accepted)</h4>
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

          {/* Filters & Tabs panel */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Tabs */}
            <div className="flex bg-slate-800/40 p-1.5 rounded-xl border border-white/5 self-start">
              {(["ALL", "MCR", "DSR", "MSR"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setPptdfFilter(null); }}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab 
                      ? "bg-primary text-white shadow-sm" 
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {tab === "ALL" && "All Controls"}
                  {tab === "MCR" && "Minimum Compliance (MCR)"}
                  {tab === "DSR" && "Discretionary Risk (DSR)"}
                  {tab === "MSR" && "MSR Security Baseline"}
                </button>
              ))}
            </div>

            {/* PPTDF & Search Filter Row */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 bg-slate-800/40 p-1 border border-white/5 rounded-xl">
                <button 
                  onClick={() => setPptdfFilter(null)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${!pptdfFilter ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
                >
                  All Scopes
                </button>
                {["People", "Process", "Technology", "Data", "Facilities"].map((scope) => (
                  <button
                    key={scope}
                    onClick={() => setPptdfFilter(scope)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      pptdfFilter === scope ? "bg-primary/20 text-primary" : "text-slate-400 hover:text-white"
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
                No controls match the selected filters.
              </div>
            ) : (
              filteredControls.map((c) => (
                <div key={c.id} className="glass-card hover-glow p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all duration-300">
                  <div className="space-y-2 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-sm text-primary tracking-wider">{c.control_code}</span>
                      <Badge variant={c.classification === "MCR" ? "info" : "warning"}>
                        {c.classification === "MCR" ? "MCR Compliance" : `DSR Recommendation (Score: ${c.dsr_score})`}
                      </Badge>
                      
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
                      {c.status === "pending_review" && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="h-3 w-3" /> Pending Review
                        </span>
                      )}
                    </div>
                    
                    <h3 className="font-bold text-sm text-text-primary">{c.control_name}</h3>
                    <p className="text-xs text-text-muted leading-relaxed">{c.description}</p>
                    
                    {/* Rejection / Risk acceptance note */}
                    {c.status === "rejected" && c.rejection_rationale && (
                      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2.5 mt-2">
                        <p className="text-[10px] font-bold text-red-400">Risk Acceptance Rationale:</p>
                        <p className="text-xs text-slate-400 italic mt-0.5">"{c.rejection_rationale}"</p>
                      </div>
                    )}

                    {/* DSR Factors detail */}
                    {c.classification === "DSR" && c.dsr_factors && (
                      <div className="flex flex-wrap gap-2 text-[10px] text-slate-400 bg-white/5 p-2 rounded-lg mt-2">
                        <span className="font-bold text-slate-300">Factors:</span>
                        <span>Coverage Gap: {c.dsr_factors.domain_coverage_gap}%</span>
                        <span>·</span>
                        <span>Industry Relevance: {c.dsr_factors.industry_relevance}%</span>
                        <span>·</span>
                        <span>Risk Factor: {c.dsr_factors.risk_appetite_factor}%</span>
                        <span>·</span>
                        <span>Maturity: {c.dsr_factors.maturity_alignment}%</span>
                      </div>
                    )}

                    {/* PPTDF Tags */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[10px] font-bold text-slate-500 self-center">PPTDF:</span>
                      {c.pptdf_scope.map((scope) => (
                        <Badge key={scope} variant="neutral" className="text-[9px] px-1.5 py-0">
                          {scope}
                        </Badge>
                      ))}
                    </div>
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
              ))
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
            <p className="text-xs text-text-muted leading-relaxed">
              You are rejecting the recommended control <strong>{rejectingControl?.control_code}</strong> ({rejectingControl?.control_name}).
            </p>
            <p className="text-[10px] text-red-400/80 italic leading-relaxed">
              *TX-RAMP / ISO 27001 requires documenting a formal risk acceptance rationale if a recommended security control is not implemented.*
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
