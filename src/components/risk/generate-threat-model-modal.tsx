"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Check,
  AlertCircle,
  Search,
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
  const [step, setStep] = useState<WizardStep>(1);
  const [version, setVersion] = useState("");
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>(DEFAULT_FRAMEWORKS);
  const [frameworkSearch, setFrameworkSearch] = useState("");
  const [progress, setProgress] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setVersion("");
      setSelectedFrameworks(DEFAULT_FRAMEWORKS);
      setFrameworkSearch("");
      setProgress(0);
      setStageIdx(0);
      setError(null);
      setIsGenerating(false);
    }
  }, [open]);

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
          frameworks: selectedFrameworks,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Generation failed (${res.status})`);
      }

      const result = await res.json();
      setProgress(100);
      setIsGenerating(false);

      // Auto-close after 2s
      setTimeout(() => {
        onGenerated(result);
        onClose();
      }, 2000);
    } catch (err) {
      setIsGenerating(false);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    }
  }, [version, selectedFrameworks, onGenerated, onClose]);

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
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. v2.4.1"
              className="w-full rounded-xl border border-border-glass bg-white/5 px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all duration-300"
            />
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
            <p className="text-xs text-text-secondary">
              <span className="font-semibold text-primary">47</span> documents available for analysis
            </p>
          </div>

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
          ) : progress >= 100 ? (
            /* Success state */
            <div className="text-center space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                <Check className="h-7 w-7 text-emerald-400 stroke-[2.5]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  Threat Model Generated
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Redirecting in a moment...
                </p>
              </div>
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
