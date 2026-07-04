"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useVersion } from "@/lib/context/version-context";
import {
  Settings,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Check,
  AlertCircle,
  Search,
  ChevronDown,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GenerateThreatModelModalProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (model: any) => void;
}

type WizardStep = 1 | 2 | 3;

const AVAILABLE_FRAMEWORKS = [
  "ISO 27001",
  "LGPD",
  "SOC 2",
  "HIPAA",
  "NIST CSF",
  "GDPR",
  "PCI DSS",
  "ISO 27701",
];

const DEFAULT_FRAMEWORKS = ["ISO 27001", "LGPD"];

const PROGRESS_STAGES = [
  "Analyzing documents...",
  "Identifying threats...",
  "FMEA correlation...",
  "Gap detection...",
  "Generating recommendations...",
];

// ─────────────────────────────────────────────────────────────────────────────
// Step Indicator
// ─────────────────────────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps = [
    { num: 1, label: "Configure" },
    { num: 2, label: "Confirm" },
    { num: 3, label: "Generate" },
  ];

  return (
    <div className="mb-6 flex items-center justify-center">
      {steps.map((step, i) => (
        <div key={step.num} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                step.num < currentStep
                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                  : step.num === currentStep
                    ? "bg-primary text-white shadow-lg shadow-primary/25"
                    : "bg-white/10 text-text-muted"
              }`}
            >
              {step.num < currentStep ? (
                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
              ) : (
                step.num
              )}
            </div>
            <span
              className={`mt-1 text-[10px] font-medium ${
                step.num <= currentStep ? "text-text-primary" : "text-text-muted"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`mx-3 h-0.5 w-12 rounded-full transition-all duration-500 ${
                step.num < currentStep ? "bg-emerald-500/50" : "bg-white/10"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate Threat Model Modal
// ─────────────────────────────────────────────────────────────────────────────

export function GenerateThreatModelModal({
  open,
  onClose,
  onGenerated,
}: GenerateThreatModelModalProps) {
  const { versions, activeVersion } = useVersion();
  const [step, setStep] = useState<WizardStep>(1);
  const [version, setVersion] = useState("");
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>(DEFAULT_FRAMEWORKS);
  const [frameworkSearch, setFrameworkSearch] = useState("");
  const [progress, setProgress] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [allDocs, setAllDocs] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [forceReevaluate, setForceReevaluate] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);
  // Version-readiness signals: null = unknown (still loading, or the lineage
  // migration isn't applied yet) — the corresponding checklist row is hidden.
  const [deltaCount, setDeltaCount] = useState<number | null>(null);
  const [baselineState, setBaselineState] = useState<"linked" | "none" | null>(null);

  // Load versions and fetch docs when modal opens
  useEffect(() => {
    if (open) {
      // Set initial version based on active version or first version
      if (activeVersion) {
        setVersion(activeVersion.version_code);
      } else if (versions.length > 0) {
        setVersion(versions[0].version_code);
      } else {
        setVersion("");
      }

      // Fetch documents to dynamically count them
      async function fetchDocs() {
        setLoadingDocs(true);
        try {
          const supabase = createClient();
          const { data, error } = await supabase
            .from("compliance_documents")
            .select("id, product_version_id, filename, status")
            .eq("status", "published");
          if (!error && data) {
            setAllDocs(data);
          }
        } catch (err) {
          console.error("[GenerateThreatModelModal] Error fetching docs:", err);
        } finally {
          setLoadingDocs(false);
        }
      }
      fetchDocs();
    } else {
      // Reset state when modal closes
      setStep(1);
      setVersion("");
      setSelectedFrameworks(DEFAULT_FRAMEWORKS);
      setFrameworkSearch("");
      setProgress(0);
      setStageIdx(0);
      setError(null);
      setIsGenerating(false);
      setAllDocs([]);
      setForceReevaluate(false);
      setGenResult(null);
      setDeltaCount(null);
      setBaselineState(null);
    }
  }, [open, activeVersion, versions]);

  // Derived dynamic document count & checklist
  const selectedVersionObj = versions.find((v) => v.version_code === version);
  const selectedVersionId = selectedVersionObj?.id;

  // Version-readiness: accumulated feature deltas + previous-version baseline.
  // Both queries tolerate missing tables/columns (lineage migration not yet
  // applied) by leaving the signal at null, which hides the checklist row.
  useEffect(() => {
    if (!open || !selectedVersionId) {
      setDeltaCount(null);
      setBaselineState(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      try {
        const { count, error: deltaErr } = await supabase
          .from("product_version_deltas")
          .select("id", { count: "exact", head: true })
          .eq("product_version_id", selectedVersionId);
        if (!cancelled) setDeltaCount(deltaErr ? null : (count ?? 0));

        const { data: pv, error: pvErr } = await supabase
          .from("product_versions")
          .select("previous_version_id")
          .eq("id", selectedVersionId)
          .single();
        if (pvErr || !(pv as any)?.previous_version_id) {
          if (!cancelled) setBaselineState(pvErr ? null : "none");
          return;
        }
        const { data: prev } = await supabase
          .from("product_versions")
          .select("version_code")
          .eq("id", (pv as any).previous_version_id)
          .single();
        const prevCode = (prev as any)?.version_code;
        if (!prevCode) {
          if (!cancelled) setBaselineState("none");
          return;
        }
        const { count: modelCount } = await supabase
          .from("threat_models")
          .select("id", { count: "exact", head: true })
          .eq("product_version", prevCode);
        if (!cancelled) setBaselineState((modelCount ?? 0) > 0 ? "linked" : "none");
      } catch {
        if (!cancelled) {
          setDeltaCount(null);
          setBaselineState(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedVersionId]);
  const applicableDocs = allDocs.filter(
    (doc) =>
      doc.product_version_id === null ||
      (selectedVersionObj && doc.product_version_id === selectedVersionObj.id)
  );
  const applicableDocsCount = applicableDocs.length;

  const hasSAD = applicableDocs.some((doc) =>
    /sad|architect|arquitetura/i.test(doc.filename || "")
  );
  const hasSRS = applicableDocs.some((doc) =>
    /srs|requirement|requisito/i.test(doc.filename || "")
  );
  const hasTI = applicableDocs.some((doc) =>
    /psi|infra|operac|ti/i.test(doc.filename || "")
  );

  // Progress animation for step 3
  useEffect(() => {
    if (step !== 3 || !isGenerating) return;

    const stageInterval = setInterval(() => {
      setStageIdx((prev) => (prev + 1) % PROGRESS_STAGES.length);
    }, 3000);

    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 2, 90));
    }, 300);

    return () => {
      clearInterval(stageInterval);
      clearInterval(progressInterval);
    };
  }, [step, isGenerating]);

  const filteredFrameworks = AVAILABLE_FRAMEWORKS.filter((fw) =>
    fw.toLowerCase().includes(frameworkSearch.toLowerCase())
  );

  function toggleFramework(fw: string) {
    setSelectedFrameworks((prev) =>
      prev.includes(fw)
        ? prev.filter((f) => f !== fw)
        : [...prev, fw]
    );
  }

  const handleGenerate = useCallback(async () => {
    setStep(3);
    setIsGenerating(true);
    setError(null);
    setProgress(0);
    setStageIdx(0);

    try {
      const res = await fetch("/api/threat-modeling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_version: version,
          target_frameworks: selectedFrameworks,
          force_reevaluate: forceReevaluate,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Generation failed (${res.status})`);
      }

      const result = await res.json();
      setGenResult(result);
      setProgress(100);
      setIsGenerating(false);
    } catch (err) {
      setIsGenerating(false);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    }
  }, [version, selectedFrameworks, forceReevaluate]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Generate Threat Model"
      maxWidth="max-w-xl"
    >
      <StepIndicator currentStep={step} />

      {/* ──── Step 1: Configure ──── */}
      {step === 1 && (
        <div className="space-y-5">
          {/* Product Version */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
              Product Version
            </label>
            <div className="relative">
              <select
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full appearance-none rounded-xl border border-border-glass bg-white/5 px-4 py-2.5 pr-10 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all duration-300 dark:[color-scheme:dark] [&>option]:bg-bg-card [&>option]:text-text-primary"
              >
                <option value="" disabled>Select a version...</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.version_code}>
                    {v.product_name} ({v.version_code})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          </div>

          {/* Frameworks */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
              Target Frameworks
            </label>

            {/* Search */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={frameworkSearch}
                onChange={(e) => setFrameworkSearch(e.target.value)}
                placeholder="Search frameworks..."
                className="w-full rounded-lg border border-border-glass bg-white/5 py-2 pl-9 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Checkbox list */}
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-border-glass bg-white/[0.02] p-2">
              {filteredFrameworks.map((fw) => {
                const isChecked = selectedFrameworks.includes(fw);
                return (
                  <label
                    key={fw}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-white/5"
                  >
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-200 ${
                        isChecked
                          ? "border-primary bg-primary"
                          : "border-white/20 bg-white/5"
                      }`}
                    >
                      {isChecked && (
                        <Check className="h-3 w-3 text-white stroke-[3]" />
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleFramework(fw)}
                      className="sr-only"
                    />
                    <span className="text-text-secondary">{fw}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Document count hint */}
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
            <Settings className="h-4 w-4 text-primary shrink-0" />
            {loadingDocs ? (
              <p className="text-xs text-text-secondary flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                Calculating available documents...
              </p>
            ) : (
              <p className="text-xs text-text-secondary">
                <span className="font-semibold text-primary">{applicableDocsCount}</span> documents available for version {version || "selected version"} (global + version-specific)
              </p>
            )}
          </div>

          {/* Document Checklist */}
          {!loadingDocs && version && (
            <div className="rounded-xl border border-white/5 bg-white/[0.01] p-3.5 space-y-2 text-xs">
              <p className="font-semibold text-text-secondary uppercase tracking-wider text-[10px] mb-1">
                Required Documents Checklist
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Solution Architecture (SAD)</span>
                  <span className={hasSAD ? "text-emerald-400 font-medium" : "text-amber-500 font-medium"}>
                    {hasSAD ? "✓ Detected" : "✗ Missing"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Requirements Spec (SRS/SDS)</span>
                  <span className={hasSRS ? "text-emerald-400 font-medium" : "text-amber-500 font-medium"}>
                    {hasSRS ? "✓ Detected" : "✗ Missing"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">IT Operations/Infrastructure</span>
                  <span className={hasTI ? "text-emerald-400 font-medium" : "text-slate-500 font-medium"}>
                    {hasTI ? "✓ Detected" : "— Optional"}
                  </span>
                </div>
                {deltaCount !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">New features extracted (deltas)</span>
                    <span className={deltaCount > 0 ? "text-emerald-400 font-medium" : "text-amber-500 font-medium"}>
                      {deltaCount > 0 ? `✓ ${deltaCount} detected` : "✗ None"}
                    </span>
                  </div>
                )}
                {baselineState !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">Previous-version baseline (inheritance)</span>
                    <span className={baselineState === "linked" ? "text-emerald-400 font-medium" : "text-slate-500 font-medium"}>
                      {baselineState === "linked" ? "✓ Linked" : "— Not configured"}
                    </span>
                  </div>
                )}
              </div>
              {deltaCount === 0 && (
                <p className="text-[10px] text-amber-500/80 leading-relaxed pt-1.5 border-t border-white/5">
                  ⚠️ No feature deltas were extracted for this version — feature-level threat
                  coverage may be incomplete. Upload the version&apos;s SAD/SRS (with the version
                  selected in Application Scope) so new features are detected.
                </p>
              )}
              {baselineState === "none" && (
                <p className="text-[10px] text-slate-400/80 leading-relaxed pt-1.5 border-t border-white/5">
                  ℹ️ Without a previous-version baseline, all threats will appear as new. Set the
                  version&apos;s previous version in Settings → Versions (and approve its model) to
                  enable inherited-vs-new labelling.
                </p>
              )}
              {(!hasSAD || !hasSRS) && (
                <p className="text-[10px] text-amber-500/80 leading-relaxed pt-1.5 border-t border-white/5">
                  ⚠️ Generating models without SAD/SRS may produce generic results. We recommend uploading these files in the Documents manager first.
                </p>
              )}
            </div>
          )}

          {/* Next button */}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!version.trim() || selectedFrameworks.length === 0}
            onClick={() => setStep(2)}
            icon={<ChevronRight className="h-4 w-4" />}
          >
            Next
          </Button>
        </div>
      )}

      {/* ──── Step 2: Confirm ──── */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Summary */}
          <div className="rounded-xl border border-border-glass bg-white/[0.02] p-4 space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Product Version
              </p>
              <p className="mt-0.5 text-sm font-medium text-text-primary">
                {version}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Frameworks
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {selectedFrameworks.map((fw) => (
                  <Badge key={fw} variant="info">
                    {fw}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Estimated Time
              </p>
              <p className="mt-0.5 text-sm text-text-secondary">~2-5 minutes</p>
            </div>
          </div>

          {/* Force re-evaluation */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border-glass bg-white/5 p-3">
            <input
              type="checkbox"
              checked={forceReevaluate}
              onChange={(e) => setForceReevaluate(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 accent-primary"
            />
            <span className="text-xs">
              <span className="block font-medium text-text-primary">Force re-analysis</span>
              <span className="block text-text-muted mt-0.5">
                By default, if nothing changed in this version&apos;s extracted features since the
                last analysis, the persisted model is reused without calling the GRC engine. Check
                this to regenerate from scratch.
              </span>
            </span>
          </label>

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              variant="ghost"
              size="md"
              onClick={() => setStep(1)}
              icon={<ChevronLeft className="h-4 w-4" />}
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={handleGenerate}
            >
              Generate Threat Model
            </Button>
          </div>
        </div>
      )}

      {/* ──── Step 3: Progress ──── */}
      {step === 3 && (
        <div className="space-y-5">
          {error ? (
            /* Error state */
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
                <AlertCircle className="h-7 w-7 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  Generation Failed
                </p>
                <p className="mt-1 text-xs text-text-muted">{error}</p>
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={handleGenerate}
              >
                Retry
              </Button>
            </div>
          ) : progress >= 100 && genResult ? (
            /* Success state — say exactly what happened and what to do next */
            <div className="space-y-4">
              <div className="text-center space-y-3">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                  <Check className="h-7 w-7 text-emerald-400 stroke-[2.5]" />
                </div>
                <p className="text-sm font-semibold text-text-primary">
                  {genResult.cached ? "Analysis Reused — No Product Changes" : "Threat Model Generated"}
                </p>
              </div>

              {genResult.cached ? (
                <div className="rounded-xl border border-primary/10 bg-primary/5 px-3 py-2.5 text-xs text-text-secondary leading-relaxed">
                  Nothing changed in this version&apos;s extracted features since the last analysis,
                  so the persisted model was returned without calling the GRC engine. Use{" "}
                  <span className="font-medium text-text-primary">Force re-analysis</span> if you
                  need a regeneration anyway.
                </div>
              ) : (
                (genResult.inherited_threats ?? 0) + (genResult.new_threats ?? 0) > 0 && (
                  <div className="rounded-xl border border-border-glass bg-white/[0.03] px-3 py-2.5 text-xs text-text-secondary leading-relaxed">
                    Compared against the previous version&apos;s baseline:{" "}
                    <span className="font-semibold text-slate-300">{genResult.inherited_threats}</span>{" "}
                    inherited threat(s) ·{" "}
                    <span className="font-semibold text-emerald-400">{genResult.new_threats}</span>{" "}
                    new to this version. Focus your review on the new ones (badged in the threat
                    catalog).
                  </div>
                )
              )}

              {Array.isArray(genResult.data?.limitations) && genResult.data.limitations.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                    Coverage limitations
                  </p>
                  {genResult.data.limitations.map((l: string, i: number) => (
                    <p key={i} className="text-xs text-text-secondary leading-relaxed">
                      • {l}
                    </p>
                  ))}
                </div>
              )}

              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => {
                  onGenerated(genResult);
                  onClose();
                }}
              >
                View Threat Model
              </Button>
            </div>
          ) : (
            /* Loading state */
            <div className="text-center space-y-5">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-7 w-7 text-primary animate-spin" />
              </div>

              {/* Progress bar */}
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-text-secondary">
                    {PROGRESS_STAGES[stageIdx]}
                  </span>
                  <span className="font-semibold tabular-nums text-text-primary">
                    {Math.round(progress)}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-text-muted">
                This may take 2-5 minutes. Please don&apos;t close this dialog.
              </p>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
