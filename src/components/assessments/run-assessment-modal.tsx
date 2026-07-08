"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Zap,
  ScanSearch,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Search,
  AlertTriangle,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRunAssessment } from "@/hooks/queries/use-assessments";
import { useVersion } from "@/lib/context/version-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface RunAssessmentModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  productVersionId?: string | null;
  frameworks: Array<{ framework_code: string; framework_name: string }>;
  loadingFrameworks: boolean;
}

// ---------------------------------------------------------------------------
// RunAssessmentModal
// ---------------------------------------------------------------------------
export function RunAssessmentModal({
  open,
  onClose,
  onComplete,
  productVersionId,
  frameworks,
  loadingFrameworks,
}: RunAssessmentModalProps) {
  const { salesChannel: globalChannel } = useVersion();
  const [mode, setMode] = useState<"quick" | "deep">("quick");
  const [salesChannel, setSalesChannel] = useState<string>("all");
  const [forceReevaluate, setForceReevaluate] = useState(false);
  const [frameworkSearch, setFrameworkSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([
    "iso27001",
    "soc2",
    "hipaa",
    "nist_800_53",
    "iso27701",
    "fedramp",
  ]);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // T008: Use React Query mutation instead of raw fetch
  const runAssessment = useRunAssessment();

  useEffect(() => {
    if (open) {
      setMode("quick");
      // Default to the Context Bar's commercial scope (NPR v3); the user can
      // still switch to the internal aggregate ("all") explicitly.
      setSalesChannel(globalChannel ?? "all");
      setForceReevaluate(false);
      setFrameworkSearch("");
      setDebouncedSearch("");
      setSelectedFrameworks([
        "iso27001",
        "soc2",
        "hipaa",
        "nist_800_53",
        "iso27701",
        "fedramp",
      ]);
      setProgress("");
      setResult(null);
      setError(null);
    }
  }, [open, globalChannel]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(frameworkSearch), 150);
    return () => clearTimeout(timer);
  }, [frameworkSearch]);

  const toggleFramework = (code: string) => {
    setSelectedFrameworks((prev) =>
      prev.includes(code) ? prev.filter((f) => f !== code) : [...prev, code]
    );
  };

  const filteredFrameworks = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return frameworks.filter((fw) =>
      (fw.framework_code || "").toLowerCase().includes(term) ||
      (fw.framework_name || "").toLowerCase().includes(term)
    );
  }, [frameworks, debouncedSearch]);

  const resolveFwName = (id: string) => {
    const match = frameworks.find((f) => f.framework_code === id);
    if (match) return match.framework_name;
    const oldMapping: Record<string, string> = {
      iso27001: "ISO/IEC 27001:2022",
      soc2: "SOC 2 Type II",
      hipaa: "HIPAA",
      nist_800_53: "NIST 800-53",
      iso27701: "ISO/IEC 27701:2019",
      fedramp: "FedRAMP",
    };
    return oldMapping[id] || id;
  };

  const handleRun = () => {
    setError(null);
    setResult(null);
    setProgress("Initializing assessment engine...");

    runAssessment.mutate(
      {
        frameworks: selectedFrameworks,
        mode,
        salesChannel: salesChannel === "all" ? null : salesChannel,
        productVersionId,
        forceReevaluate,
      },
      {
        onSuccess: (data) => {
          setResult(data);
          setProgress("Assessment complete!");
          onComplete();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : "Unknown error");
          setProgress("");
        },
      }
    );
  };

  const running = runAssessment.isPending;

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
                  className="w-full appearance-none rounded-xl border border-border-glass bg-white/5 py-2.5 pl-4 pr-10 text-sm text-text-primary outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 dark:[color-scheme:dark] [&>option]:bg-bg-card [&>option]:text-text-primary"
                >
                  <option value="all" className="bg-bg-card text-text-primary">All Channels (combined)</option>
                  <option value="B2B_GEHC" className="bg-bg-card text-text-primary">
                    GEHC Channel (GEHC as Data Controller)
                  </option>
                  <option value="B2B_DIRECT" className="bg-bg-card text-text-primary">
                    Direct Sales (Ionic as Data Controller)
                  </option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </div>

            {/* Force Re-evaluation */}
            <div className="mb-6">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border-glass bg-white/5 p-3">
                <input
                  type="checkbox"
                  checked={forceReevaluate}
                  onChange={(e) => setForceReevaluate(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 accent-primary"
                />
                <span className="text-xs">
                  <span className="block font-medium text-text-primary">
                    Force re-evaluation
                  </span>
                  <span className="block text-text-muted mt-0.5">
                    By default, controls with no documentation changes since their last evaluation are reused
                    from the persisted cache. Check this to re-query RAG and the Standard GRC Engine API for
                    every control.
                  </span>
                </span>
              </label>
            </div>

            {/* Framework Selection */}
            <div className="mb-6">
              <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
                Target Frameworks
              </label>

              {/* Framework Search Input */}
              <div className="relative mb-3">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Search className="h-3.5 w-3.5 text-text-muted" />
                </div>
                <input
                  type="text"
                  placeholder="Search all 272 SCF standard frameworks..."
                  value={frameworkSearch}
                  onChange={(e) => setFrameworkSearch(e.target.value)}
                  className="w-full rounded-xl border border-border-glass bg-white/5 py-2 pl-9 pr-4 text-xs text-text-primary outline-none transition-all focus:border-primary/50 focus:bg-white/[0.07] focus:ring-1 focus:ring-primary/20"
                />
              </div>

              {loadingFrameworks ? (
                <div className="flex items-center gap-2 py-8 justify-center text-text-muted text-xs">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Loading SCF standard frameworks...
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto border border-border-glass rounded-xl p-3 bg-white/5 space-y-2">
                  {filteredFrameworks.length === 0 ? (
                    <div className="text-center py-6 text-xs text-text-muted">
                      No matching frameworks found.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {filteredFrameworks.map((fw) => {
                        const isSelected = selectedFrameworks.includes(fw.framework_code);
                        return (
                          <button
                            key={fw.framework_code}
                            type="button"
                            onClick={() => toggleFramework(fw.framework_code)}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                              isSelected
                                ? "border-primary/40 bg-primary/10 text-primary font-medium"
                                : "border-border-glass bg-white/5 text-text-secondary hover:bg-white/[0.07]"
                            }`}
                          >
                            <div
                              className={`h-3.5 w-3.5 rounded-sm border shrink-0 flex items-center justify-center ${
                                isSelected
                                  ? "border-primary bg-primary"
                                  : "border-text-muted"
                              }`}
                            >
                              {isSelected && (
                                <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                              )}
                            </div>
                            <span className="truncate" title={fw.framework_name}>
                              {fw.framework_name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
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

            {typeof result.totalFromCache === "number" && result.totalFromCache > 0 && (
              <div className="mb-4 rounded-xl border border-primary/10 bg-primary/5 px-3 py-2 text-xs text-text-secondary">
                <span className="font-semibold text-primary">{result.totalFromCache}</span> controls reused from the
                persisted cache (no documentation changes) ·{" "}
                <span className="font-semibold text-text-primary">{result.totalFreshlyEvaluated}</span> freshly
                evaluated.
              </div>
            )}

            {/* What to do now — agentic next steps derived from this run */}
            {(() => {
              const gaps: number = result.totalGap ?? 0;
              // Missing counts every non-compliant control (hard gaps plus
              // partial/informal below the compliance threshold) — quick scans
              // can have missing > 0 with zero hard gaps.
              const missing: number = result.totalControlsMissing ?? gaps;
              const errors: number = result.totalEvaluationErrors ?? 0;
              const estimated: number = result.totalEstimated ?? 0;
              const allCached =
                (result.totalFromCache ?? 0) > 0 &&
                result.totalFromCache === result.totalControlsEvaluated;
              const steps: Array<{ tone: "action" | "warn" | "info"; text: string }> = [];
              if (errors > 0)
                steps.push({
                  tone: "warn",
                  text: `${errors} control(s) failed at the external GRC API ([EVALUATION_ERROR]) — this is NOT non-compliance. Re-run the assessment; if it persists, check the Standard API status/credentials.`,
                });
              if (estimated > 0)
                steps.push({
                  tone: "warn",
                  text: `${estimated} result(s) are estimates from degraded mode ([ESTIMATED], needs review) — treat as drafts and re-run once the GRC engine is reachable.`,
                });
              if (missing > 0)
                steps.push({
                  tone: "action",
                  text: `${missing} control(s) are not compliant${
                    gaps > 0 ? ` (${gaps} with no evidence at all)` : ""
                  } — open this assessment's evidence detail on the Assessments page and create a Goal (remediation) or POA&M entry for each one you triage.`,
                });
              if (allCached)
                steps.push({
                  tone: "info",
                  text: "All results were reused from the persisted cache — nothing changed in your documentation since the last run. Upload/reindex documents (or use Force re-evaluation) if you expected changes.",
                });
              if (steps.length === 0)
                steps.push({
                  tone: "info",
                  text: "No gaps or issues to act on. Generate a Report to snapshot this baseline.",
                });
              return (
                <div className="mb-4 rounded-xl border border-border-glass bg-white/[0.03] p-3.5">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                    <ListChecks className="h-3.5 w-3.5 text-primary" />
                    What to do now
                  </p>
                  <ul className="space-y-1.5">
                    {steps.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                        {s.tone === "warn" ? (
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                        ) : s.tone === "action" ? (
                          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 -rotate-90 text-primary" />
                        ) : (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        )}
                        <span className="text-text-secondary">{s.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {/* Framework Scores */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Framework Scores
              </h3>
              {result.frameworkScores?.map((fs: any) => {
                const fwName = resolveFwName(fs.frameworkId);
                return (
                  <div
                    key={fs.frameworkId}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2.5"
                  >
                    <span className="text-sm text-text-primary">
                      {fwName}
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
