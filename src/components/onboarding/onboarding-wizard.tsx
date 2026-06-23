"use client";

import { useState } from "react";
import {
  ShieldCheck,
  FileText,
  ClipboardCheck,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  X,
  Check,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────────
// Steps definition
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    id: "welcome",
    title: "Welcome to ihOS",
    subtitle: "Compliance intelligence for Ionic Health",
    icon: Sparkles,
    iconColor: "text-primary",
    iconBg: "from-primary/20 to-accent/20",
    description:
      "ihOS is the central governance, risk, and compliance operating system for Ionic Health. In just a few steps, you will be monitoring frameworks such as LGPD, ISO 27001, ISO 27701, and more.",
    action: null,
  },
  {
    id: "framework",
    title: "Choose Your Frameworks",
    subtitle: "Step 1 of 4",
    icon: ShieldCheck,
    iconColor: "text-emerald-400",
    iconBg: "from-accent/20 to-cyan-500/20",
    description:
      "Access the Compliance page to view the scorecard of available frameworks. The system automatically monitors LGPD, HIPAA, ISO 27001, ISO 27701, and EU GDPR.",
    action: { label: "View Compliance", href: "/compliance" },
  },
  {
    id: "documents",
    title: "Upload Your Documents",
    subtitle: "Step 2 of 4",
    icon: FileText,
    iconColor: "text-cyan-400",
    iconBg: "from-primary/20 to-primary/20",
    description:
      "Upload your ISMS policies, procedures, and evidence. The system will automatically index and make these documents available for AI query and compliance assessments.",
    action: { label: "Go to Documents", href: "/documents" },
  },
  {
    id: "assessment",
    title: "Create Your First Assessment",
    subtitle: "Step 3 of 4",
    icon: ClipboardCheck,
    iconColor: "text-amber-400",
    iconBg: "from-amber-500/20 to-orange-500/20",
    description:
      "Compliance assessments record progress against each framework control. You can import answers via spreadsheet or fill them out manually.",
    action: { label: "View Assessments", href: "/assessments" },
  },
  {
    id: "chat",
    title: "Chat with the AI Assistant",
    subtitle: "Step 4 of 4",
    icon: MessageSquare,
    iconColor: "text-violet-400",
    iconBg: "from-violet-500/20 to-purple-500/20",
    description:
      "The ihOS AI assistant analyzes your documents, assessments, and compliance data in real time. Ask about gaps, scores, or request an executive summary.",
    action: { label: "Open Chat", href: "/chat" },
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  onComplete: () => Promise<void>;
  onDismiss: () => void;
}

export function OnboardingWizard({ onComplete, onDismiss }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [completing, setCompleting] = useState(false);

  const current = STEPS[step];
  const Icon = current.icon;
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  const handleComplete = async () => {
    setCompleting(true);
    await onComplete();
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onDismiss()}
    >
      {/* Modal */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#1e293b] shadow-2xl shadow-black/40">
        {/* Close */}
        <button
          onClick={onDismiss}
          className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Progress bar */}
        <div className="h-1 w-full bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Content */}
        <div className="px-8 pb-8 pt-8">
          {/* Icon */}
          <div
            className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${current.iconBg}`}
          >
            <Icon className={`h-7 w-7 ${current.iconColor}`} />
          </div>

          {/* Step indicator */}
          {!isFirst && (
            <p className="mb-1 text-xs font-medium text-slate-500 uppercase tracking-wide">
              {current.subtitle}
            </p>
          )}

          <h2 className="mb-3 text-xl font-bold text-white">{current.title}</h2>
          <p className="mb-8 text-sm leading-relaxed text-slate-400">{current.description}</p>

          {/* Step dots */}
          <div className="mb-8 flex items-center gap-2">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === step
                    ? "w-6 bg-primary"
                    : i < step
                    ? "w-2 bg-emerald-500"
                    : "w-2 bg-white/10"
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {!isFirst && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-400 hover:bg-white/5 hover:text-white transition-all"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}

            {current.action && (
              <Link
                href={current.action.href}
                className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primary hover:bg-primary/20 hover:text-primary transition-all"
                onClick={onDismiss}
              >
                {current.action.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}

            <button
              onClick={isLast ? handleComplete : () => setStep((s) => s + 1)}
              disabled={completing}
              className="ml-auto flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/20 hover:from-primary hover:to-accent transition-all disabled:opacity-60"
            >
              {completing ? (
                "Completing..."
              ) : isLast ? (
                <>
                  <Check className="h-4 w-4" /> Finish
                </>
              ) : (
                <>
                  Next <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
