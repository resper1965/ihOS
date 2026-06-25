"use client";

import { useState } from "react";
import { Check, X, Loader2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ThreatModelStatus } from "@/lib/supabase";

interface ReviewPanelProps {
  modelId: string;
  currentStatus: ThreatModelStatus;
  onReviewSubmit: (status: ThreatModelStatus, comment: string) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline Step
// ─────────────────────────────────────────────────────────────────────────────

const STEPS: { label: string; status: ThreatModelStatus }[] = [
  { label: "Draft", status: "draft" },
  { label: "Reviewed", status: "reviewed" },
  { label: "Approved", status: "approved" },
];

function getStepIndex(status: ThreatModelStatus): number {
  if (status === "rejected") return -1;
  return STEPS.findIndex((s) => s.status === status);
}

function TimelineStep({
  label,
  state,
  isLast,
  isRejected,
}: {
  label: string;
  state: "completed" | "active" | "future";
  isLast: boolean;
  isRejected: boolean;
}) {
  return (
    <div className="flex flex-1 items-center">
      <div className="flex flex-col items-center">
        {/* Circle */}
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 ${
            state === "completed"
              ? "bg-emerald-500 shadow-lg shadow-emerald-500/25"
              : state === "active"
                ? isRejected
                  ? "bg-red-500 shadow-lg shadow-red-500/25 ring-4 ring-red-500/20"
                  : "bg-primary shadow-lg shadow-primary/25 ring-4 ring-primary/20"
                : "bg-white/10 border border-white/20"
          }`}
        >
          {state === "completed" ? (
            <Check className="h-4 w-4 text-white stroke-[2.5]" />
          ) : state === "active" && isRejected ? (
            <X className="h-4 w-4 text-white stroke-[2.5]" />
          ) : state === "active" ? (
            <Circle className="h-3 w-3 fill-white text-white" />
          ) : (
            <Circle className="h-3 w-3 text-white/40" />
          )}
        </div>
        {/* Label */}
        <span
          className={`mt-2 text-[11px] font-medium ${
            state === "completed"
              ? "text-emerald-400"
              : state === "active"
                ? isRejected
                  ? "text-red-400"
                  : "text-primary"
                : "text-text-muted"
          }`}
        >
          {isRejected && state === "active" ? "Rejected" : label}
        </span>
      </div>

      {/* Connector line */}
      {!isLast && (
        <div
          className={`mx-2 h-0.5 flex-1 rounded-full transition-all duration-500 ${
            state === "completed"
              ? "bg-emerald-500/50"
              : "bg-white/10"
          }`}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Review Panel
// ─────────────────────────────────────────────────────────────────────────────

export function ReviewPanel({ modelId, currentStatus, onReviewSubmit }: ReviewPanelProps) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<ThreatModelStatus | null>(null);

  const currentIdx = getStepIndex(currentStatus);
  const isRejected = currentStatus === "rejected";
  const isApproved = currentStatus === "approved";

  async function handleSubmit(status: ThreatModelStatus) {
    setIsSubmitting(true);
    setSubmittingAction(status);
    try {
      await onReviewSubmit(status, comment);
      setComment("");
    } finally {
      setIsSubmitting(false);
      setSubmittingAction(null);
    }
  }

  return (
    <div className="glass-card p-6">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-text-primary">
          Review Workflow
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          Model: <span className="font-mono text-primary">{modelId}</span>
        </p>
      </div>

      {/* Timeline */}
      <div className="mb-6 flex items-start">
        {STEPS.map((step, i) => {
          let state: "completed" | "active" | "future";
          if (isRejected) {
            state = i <= 0 ? "completed" : i === 1 ? "active" : "future";
          } else if (i < currentIdx) {
            state = "completed";
          } else if (i === currentIdx) {
            state = "active";
          } else {
            state = "future";
          }

          return (
            <TimelineStep
              key={step.status}
              label={step.label}
              state={state}
              isLast={i === STEPS.length - 1}
              isRejected={isRejected && i === 1}
            />
          );
        })}
      </div>

      {/* Approved state */}
      {isApproved ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <Check className="h-5 w-5 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-400">
              This model has been approved
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Comment textarea */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
              Review Comment
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add review comments..."
              className="w-full min-h-[100px] resize-none rounded-xl border border-border-glass bg-white/5 p-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all duration-300"
            />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              disabled={isSubmitting}
              onClick={() => handleSubmit("approved")}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-400 transition-all duration-300 hover:bg-emerald-500/20 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]"
            >
              {submittingAction === "approved" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Approve
            </button>

            <button
              disabled={isSubmitting}
              onClick={() => handleSubmit("reviewed")}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-400 transition-all duration-300 hover:bg-amber-500/20 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]"
            >
              {submittingAction === "reviewed" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Request Changes
            </button>

            <Button
              variant="danger"
              size="md"
              disabled={isSubmitting}
              loading={submittingAction === "rejected"}
              onClick={() => handleSubmit("rejected")}
            >
              Reject
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
