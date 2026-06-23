"use client";

import Link from "next/link";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { useEffect, useState, useCallback } from "react";
import {
  ClipboardCheck,
  Plus,
  Search,
  Zap,
  ScanSearch,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useVersion } from "@/lib/context/version-context";
import { DEFAULT_FRAMEWORKS } from "@/lib/assessment/frameworks";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AssessmentRecord {
  id: string;
  name: string;
  status: string;
  mode: string;
  sales_channel: string | null;
  product_version_id: string | null;
  frameworks: string[];
  total_controls: number;
  compliant_controls: number;
  missing_controls: number;
  framework_scores: Array<{
    frameworkId: string;
    score: number;
    implementedCount: number;
    totalRequired: number;
    missingControls: string[];
  }>;
  created_at: string | null;
  completed_at: string | null;
}

interface EvidenceEvaluation {
  id: string;
  control_code: string;
  control_name: string;
  is_compliant: boolean;
  confidence_score: number;
  needs_review: boolean;
  auditor_notes: string | null;
  domain_code: string | null;
  evidence_sources: any | null;
}

// ---------------------------------------------------------------------------
// Run Assessment Modal
// ---------------------------------------------------------------------------
function RunAssessmentModal({
  open,
  onClose,
  onComplete,
  productVersionId,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  productVersionId?: string | null;
}) {
  const [mode, setMode] = useState<"quick" | "deep">("quick");
  const [salesChannel, setSalesChannel] = useState<string>("all");
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>(
    DEFAULT_FRAMEWORKS.map((f) => f.id)
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleFramework = (id: string) => {
    setSelectedFrameworks((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress("Initializing assessment engine...");

    try {
      const res = await fetch("/api/assessments/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frameworks: selectedFrameworks,
          mode,
          salesChannel: salesChannel === "all" ? null : salesChannel,
          productVersionId,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Assessment failed");
      }

      setResult(json.data);
      setProgress("Assessment complete!");
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setProgress("");
    } finally {
      setRunning(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary">
            Run Compliance Assessment
          </h2>
          <button
            onClick={onClose}
            disabled={running}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            ✕
          </button>
        </div>

        {!result ? (
          <>
            {/* Mode Selection */}
            <div className="mb-6">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
                Scan Mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMode("quick")}
                  className={`flex items-center gap-3 rounded-xl border p-4 transition-all ${
                    mode === "quick"
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-border-glass bg-white/5 hover:bg-white/[0.07]"
                  }`}
                >
                  <Zap
                    className={`h-5 w-5 ${
                      mode === "quick" ? "text-emerald-400" : "text-text-muted"
                    }`}
                  />
                  <div className="text-left">
                    <div className="text-sm font-medium text-text-primary">
                      Quick Scan
                    </div>
                    <div className="text-xs text-text-muted">
                      Only controls with RAG evidence (~2 min)
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setMode("deep")}
                  className={`flex items-center gap-3 rounded-xl border p-4 transition-all ${
                    mode === "deep"
                      ? "border-primary/50 bg-primary/10"
                      : "border-border-glass bg-white/5 hover:bg-white/[0.07]"
                  }`}
                >
                  <ScanSearch
                    className={`h-5 w-5 ${
                      mode === "deep" ? "text-primary" : "text-text-muted"
                    }`}
                  />
                  <div className="text-left">
                    <div className="text-sm font-medium text-text-primary">
                      Deep Scan
                    </div>
                    <div className="text-xs text-text-muted">
                      All 1,468 SCF controls (~5 min)
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Sales Channel */}
            <div className="mb-6">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
                Privacy Context (Sales Channel)
              </label>
              <div className="relative">
                <select
                  value={salesChannel}
                  onChange={(e) => setSalesChannel(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-border-glass bg-white/5 py-2.5 pl-4 pr-10 text-sm text-text-primary outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all" className="bg-[#1e293b] text-white">All Channels (combined)</option>
                  <option value="B2B_GEHC" className="bg-[#1e293b] text-white">
                    GEHC Channel (GEHC as Data Controller)
                  </option>
                  <option value="B2B_DIRECT" className="bg-[#1e293b] text-white">
                    Direct Sales (Ionic as Data Controller)
                  </option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </div>

            {/* Framework Selection */}
            <div className="mb-6">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
                Target Frameworks
              </label>
              <div className="grid grid-cols-2 gap-2">
                {DEFAULT_FRAMEWORKS.map((fw) => (
                  <button
                    key={fw.id}
                    onClick={() => toggleFramework(fw.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                      selectedFrameworks.includes(fw.id)
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border-glass bg-white/5 text-text-secondary hover:bg-white/[0.07]"
                    }`}
                  >
                    <div
                      className={`h-3 w-3 rounded-sm border ${
                        selectedFrameworks.includes(fw.id)
                          ? "border-primary bg-primary"
                          : "border-text-muted"
                      }`}
                    >
                      {selectedFrameworks.includes(fw.id) && (
                        <CheckCircle2 className="h-3 w-3 text-white" />
                      )}
                    </div>
                    {fw.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                <XCircle className="inline h-4 w-4 mr-1" />
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={onClose} disabled={running}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleRun}
                disabled={running || selectedFrameworks.length === 0}
                icon={
                  running ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )
                }
              >
                {running ? progress : "Run Assessment"}
              </Button>
            </div>
          </>
        ) : (
          /* Results Summary */
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 mb-4">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Assessment Complete</span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="rounded-xl bg-white/5 p-3 text-center">
                <div className="text-2xl font-bold text-text-primary">
                  {result.totalControlsEvaluated}
                </div>
                <div className="text-xs text-text-muted">Controls Evaluated</div>
              </div>
              <div className="rounded-xl bg-emerald-500/10 p-3 text-center">
                <div className="text-2xl font-bold text-emerald-400">
                  {result.totalControlsCompliant}
                </div>
                <div className="text-xs text-text-muted">Compliant</div>
              </div>
              <div className="rounded-xl bg-red-500/10 p-3 text-center">
                <div className="text-2xl font-bold text-red-400">
                  {result.totalControlsMissing}
                </div>
                <div className="text-xs text-text-muted">Missing</div>
              </div>
            </div>

            {/* Framework Scores */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Framework Scores
              </h3>
              {result.frameworkScores?.map((fs: any) => {
                const fw = DEFAULT_FRAMEWORKS.find((f) => f.id === fs.frameworkId);
                return (
                  <div
                    key={fs.frameworkId}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2.5"
                  >
                    <span className="text-sm text-text-primary">
                      {fw?.name || fs.frameworkId}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-text-muted">
                        {fs.implementedCount}/{fs.totalRequired} controls
                      </span>
                      <span
                        className={`text-sm font-bold ${
                          fs.score >= 70
                            ? "text-emerald-400"
                            : fs.score >= 40
                            ? "text-amber-400"
                            : "text-red-400"
                        }`}
                      >
                        {fs.score}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-4">
              <Button variant="primary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AssessmentsPage() {
  const { activeVersion, versions } = useVersion();
  const [search, setSearch] = useState("");
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [evidenceMap, setEvidenceMap] = useState<Record<string, EvidenceEvaluation[]>>({});
  const [evidenceLoading, setEvidenceLoading] = useState<string | null>(null);

  const toggleExpand = useCallback(async (assessmentId: string) => {
    if (expandedId === assessmentId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(assessmentId);

    // Skip fetch if we already have data cached
    if (evidenceMap[assessmentId]) return;

    setEvidenceLoading(assessmentId);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('evidence_evaluations')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('control_code');

      if (error) {
        console.error('[Assessments] evidence fetch error:', error.message);
      }
      setEvidenceMap((prev) => ({ ...prev, [assessmentId]: (data ?? []) as EvidenceEvaluation[] }));
    } catch {
      setEvidenceMap((prev) => ({ ...prev, [assessmentId]: [] }));
    } finally {
      setEvidenceLoading(null);
    }
  }, [expandedId, evidenceMap]);

  const fetchAssessments = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("assessments")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[Assessments] fetch error:", error.message);
        setAssessments([]);
        return;
      }

      setAssessments(data || []);
    } catch {
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssessments();
  }, [fetchAssessments]);

  const filtered = assessments.filter((a) => {
    const matchesSearch = a.name
      .toLowerCase()
      .includes(search.toLowerCase());
    if (activeVersion) {
      return matchesSearch && a.product_version_id === activeVersion.id;
    }
    return matchesSearch;
  });

  const getOverallScore = (record: AssessmentRecord): number => {
    const scores = record.framework_scores || [];
    if (scores.length === 0) return 0;
    const sum = scores.reduce((acc, s) => acc + (s.score || 0), 0);
    return Math.round(sum / scores.length);
  };

  return (
    <div className="w-full space-y-8">
      <PageTitleRegistrar
        title={
          <>
            Compliance{" "}
            <span className="text-emerald-400">Assessments</span>
          </>
        }
        subtitle="Run and monitor compliance scans powered by the Standard GRC Engine."
        icon={<ClipboardCheck className="h-4 w-4 text-primary" />}
      />

      <div className="flex items-center justify-between gap-4">
        {/* Search */}
        <div className="relative max-w-md flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
            <Search className="h-4 w-4 text-text-muted" />
          </div>
          <input
            type="text"
            placeholder="Search assessments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search assessments"
            className="w-full rounded-xl border border-border-glass bg-white/5 py-2.5 pl-10 pr-4 text-sm text-text-primary outline-none transition-all duration-300 focus:border-primary/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <Button
          id="run-assessment-btn"
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setModalOpen(true)}
        >
          Run Assessment
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card h-full p-6 animate-pulse">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/10" />
                  <div className="space-y-2">
                    <div className="h-4 w-40 rounded bg-white/10" />
                    <div className="h-3 w-56 rounded bg-white/5" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <div className="glass-card flex flex-col items-center justify-center p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 mb-4">
            <ScanSearch className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            No assessments yet
          </h3>
          <p className="text-sm text-text-muted max-w-sm">
            Run your first compliance scan to evaluate your ISMS documents
            against SCF controls across multiple frameworks.
          </p>
          <Button
            variant="primary"
            className="mt-6"
            icon={<Zap className="h-4 w-4" />}
            onClick={() => setModalOpen(true)}
          >
            Run First Assessment
          </Button>
        </div>
      )}

      {/* Assessment Cards */}
      {!loading && filtered.length > 0 && (
        <div id="assessments-history-list" className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {filtered.map((item) => {
            const overallScore = getOverallScore(item);
            const progress =
              item.total_controls > 0
                ? Math.round(
                    (item.compliant_controls / item.total_controls) * 100
                  )
                : 0;
            const isExpanded = expandedId === item.id;
            const evidenceRows = evidenceMap[item.id];
            const isEvidenceLoading = evidenceLoading === item.id;

            return (
              <div key={item.id} className="group block">
                <div className={`glass-card h-full p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 ${isExpanded ? 'border-[#53c4cd]/30 shadow-lg shadow-[#53c4cd]/5' : ''}`}>
                  <div className="flex items-start justify-between">
                    <Link
                      href={`/assessments/${item.id}`}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 shrink-0">
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-text-primary group-hover:text-primary transition-colors leading-tight truncate">
                            {item.name}
                          </h3>
                          <Badge
                            variant="info"
                            className="text-[9px] bg-primary/10 text-primary border border-primary/20 py-0 px-1 font-mono uppercase shrink-0"
                          >
                            {item.mode}
                          </Badge>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          {(item.frameworks || []).length} frameworks ·{" "}
                          {item.sales_channel || "All channels"} ·{" "}
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={
                          item.status === "completed" ? "success" : "info"
                        }
                        dot
                      >
                        {item.status === "completed" ? "Complete" : "Running"}
                      </Badge>
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="rounded-lg p-1.5 hover:bg-white/10 transition-colors text-text-muted hover:text-[#53c4cd]"
                        aria-label={isExpanded ? "Collapse evidence" : "Expand evidence"}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Framework score pills */}
                  {item.framework_scores && item.framework_scores.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.framework_scores.map((fs) => {
                        const fw = DEFAULT_FRAMEWORKS.find(
                          (f) => f.id === fs.frameworkId
                        );
                        return (
                          <span
                            key={fs.frameworkId}
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium ${
                              fs.score >= 70
                                ? "bg-emerald-500/10 text-emerald-400"
                                : fs.score >= 40
                                ? "bg-amber-500/10 text-amber-400"
                                : "bg-red-500/10 text-red-400"
                            }`}
                          >
                            {fw?.name || fs.frameworkId}: {fs.score}%
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Progress and Stats */}
                  <div className="mt-4 space-y-4">
                    <Progress
                      value={progress}
                      label="Control Compliance"
                      size="sm"
                    />
                    <div className="flex justify-between border-t border-white/5 pt-4 text-xs text-text-secondary">
                      <div>
                        <span className="text-text-muted block">
                          Overall Score
                        </span>
                        <span
                          className={`font-semibold text-sm ${
                            overallScore >= 70
                              ? "text-emerald-400"
                              : overallScore >= 40
                              ? "text-amber-400"
                              : "text-red-400"
                          }`}
                        >
                          {overallScore}%
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-text-muted block">
                          Compliant / Total
                        </span>
                        <span className="font-semibold text-text-primary text-sm">
                          {item.compliant_controls} / {item.total_controls}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── Expandable Evidence Evaluations ─────────────── */}
                  {isExpanded && (
                    <div className="mt-5 border-t border-[#53c4cd]/20 pt-5 animate-in fade-in slide-in-from-top-2 duration-200">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-[#53c4cd] mb-3">
                        Evidence Evaluations
                      </h4>

                      {isEvidenceLoading && (
                        <div className="flex items-center gap-2 py-6 justify-center text-text-muted text-sm">
                          <Loader2 className="h-4 w-4 animate-spin text-[#53c4cd]" />
                          Loading evaluations…
                        </div>
                      )}

                      {!isEvidenceLoading && evidenceRows && evidenceRows.length === 0 && (
                        <p className="text-xs text-text-muted text-center py-4">
                          No evidence evaluations recorded for this assessment.
                        </p>
                      )}

                      {!isEvidenceLoading && evidenceRows && evidenceRows.length > 0 && (
                        <div className="overflow-x-auto rounded-lg border border-[#53c4cd]/10">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-[#53c4cd]/10 text-[#53c4cd]">
                                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Control Code</th>
                                <th className="px-3 py-2 text-left font-semibold">Control Name</th>
                                <th className="px-3 py-2 text-center font-semibold">Status</th>
                                <th className="px-3 py-2 text-center font-semibold">Confidence</th>
                                <th className="px-3 py-2 text-left font-semibold">Auditor Notes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {evidenceRows.map((ev) => {
                                // ✅ = is_compliant
                                // ❌ = !is_compliant && confidence === 0
                                // ⚠️ = needs_review
                                let statusIcon: React.ReactNode;
                                let statusLabel: string;
                                if (ev.is_compliant) {
                                  statusIcon = <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
                                  statusLabel = "Compliant";
                                } else if (ev.needs_review) {
                                  statusIcon = <AlertTriangle className="h-4 w-4 text-amber-400" />;
                                  statusLabel = "Needs Review";
                                } else {
                                  statusIcon = <XCircle className="h-4 w-4 text-red-400" />;
                                  statusLabel = "Non-Compliant";
                                }

                                return (
                                  <tr
                                    key={ev.id}
                                    className="hover:bg-white/[0.03] transition-colors"
                                  >
                                    <td className="px-3 py-2.5 font-mono text-[#53c4cd] font-medium whitespace-nowrap">
                                      {ev.control_code}
                                    </td>
                                    <td className="px-3 py-2.5 text-text-primary max-w-[200px] truncate">
                                      {ev.control_name}
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                      <span className="inline-flex items-center gap-1" title={statusLabel}>
                                        {statusIcon}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                      <span
                                        className={`font-semibold ${
                                          ev.confidence_score >= 70
                                            ? "text-emerald-400"
                                            : ev.confidence_score >= 40
                                            ? "text-amber-400"
                                            : "text-red-400"
                                        }`}
                                      >
                                        {ev.confidence_score}%
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-text-secondary max-w-[250px] truncate" title={ev.auditor_notes || undefined}>
                                      {ev.auditor_notes || "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <RunAssessmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onComplete={fetchAssessments}
        productVersionId={activeVersion?.id}
      />
    </div>
  );
}
