"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ReviewableQA, ReviewStatus, RAGReference } from "@/lib/chat/questionnaire-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Check,
  X,
  Edit3,
  Download,
  FileSpreadsheet,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCheck,
  XCircle,
  BookOpen,
} from "lucide-react";

// ── Props ────────────────────────────────────────────────────────────────────

interface QuestionnaireReviewProps {
  items: ReviewableQA[];
  onUpdateAnswer: (questionId: string, newAnswer: string) => void;
  onSetStatus: (questionId: string, status: ReviewStatus) => void;
  onApproveAll: () => void;
  onPromoteAndDownload: () => void;
  onClose: () => void;
  isProcessing: boolean;
  progress: number;
  processingLabel?: string;
  fileName?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function confidenceBadge(score: number) {
  if (score > 80) return { variant: "success" as const, label: "High" };
  if (score >= 50) return { variant: "warning" as const, label: "Medium" };
  return { variant: "danger" as const, label: "Low" };
}

function statusIcon(status: ReviewStatus) {
  switch (status) {
    case "approved":
      return <Check className="h-3.5 w-3.5 text-emerald-400" />;
    case "edited":
      return <Edit3 className="h-3.5 w-3.5 text-amber-400" />;
    case "rejected":
      return <X className="h-3.5 w-3.5 text-red-400" />;
    default:
      return null;
  }
}

// ── Reference Row ────────────────────────────────────────────────────────────

function ReferenceList({ references }: { references: RAGReference[] }) {
  if (references.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {references.map((ref, i) => (
        <div
          key={`${ref.chunkId}-${i}`}
          className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs"
        >
          <BookOpen className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <span className="font-medium text-text-primary">
              {ref.documentTitle}
            </span>
            {ref.sectionTitle && (
              <span className="text-text-muted"> › {ref.sectionTitle}</span>
            )}
            <p className="mt-0.5 line-clamp-2 text-text-muted">{ref.excerpt}</p>
          </div>
          <span className="shrink-0 tabular-nums text-text-muted">
            {Math.round(ref.similarity * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Review Row ───────────────────────────────────────────────────────────────

function ReviewRow({
  item,
  index,
  onUpdateAnswer,
  onSetStatus,
}: {
  item: ReviewableQA;
  index: number;
  onUpdateAnswer: (id: string, text: string) => void;
  onSetStatus: (id: string, status: ReviewStatus) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.finalAnswer);
  const [showRefs, setShowRefs] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea on edit
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  const handleSaveEdit = useCallback(() => {
    onUpdateAnswer(item.questionId, editValue);
    setIsEditing(false);
  }, [onUpdateAnswer, item.questionId, editValue]);

  const handleCancelEdit = useCallback(() => {
    setEditValue(item.finalAnswer);
    setIsEditing(false);
  }, [item.finalAnswer]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") handleCancelEdit();
      if (e.key === "Enter" && e.ctrlKey) handleSaveEdit();
    },
    [handleCancelEdit, handleSaveEdit],
  );

  const conf = confidenceBadge(item.confidenceScore);
  const isRejected = item.status === "rejected";

  return (
    <div
      className={`
        animate-in fade-in slide-in-from-bottom-2 duration-300
        rounded-xl border transition-all
        ${
          isRejected
            ? "border-red-500/20 bg-red-950/10 opacity-60"
            : item.status === "approved"
              ? "border-emerald-500/15 bg-emerald-950/5"
              : item.status === "edited"
                ? "border-amber-500/15 bg-amber-950/5"
                : "border-border-glass bg-transparent"
        }
      `}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: "backwards" }}
    >
      {/* Main row content */}
      <div className="flex items-start gap-3 p-4">
        {/* Row number */}
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs font-medium tabular-nums text-text-muted">
          {index + 1}
        </span>

        {/* Question + Answer */}
        <div className="min-w-0 flex-1 space-y-2">
          {/* Question */}
          <p className="text-sm font-medium leading-snug text-text-primary">
            {item.questionText}
          </p>

          {/* Answer */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                ref={textareaRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={3}
                className="w-full resize-y rounded-lg border border-primary/30 bg-bg-dark/50 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
                placeholder="Edit answer..."
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary/20 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/30 transition-colors"
                >
                  <Check className="h-3 w-3" />
                  Save
                  <span className="text-text-muted ml-1">(Ctrl+Enter)</span>
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1 text-xs text-text-muted hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-text-secondary">
              {item.finalAnswer}
            </p>
          )}

          {/* References toggle */}
          {item.references.length > 0 && (
            <button
              onClick={() => setShowRefs(!showRefs)}
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors"
            >
              <BookOpen className="h-3 w-3" />
              {item.references.length} reference{item.references.length > 1 ? "s" : ""}
              {showRefs ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          )}
          {showRefs && <ReferenceList references={item.references} />}
        </div>

        {/* Confidence + Status */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant={conf.variant} dot>
            {item.confidenceScore}% · {conf.label}
          </Badge>
          {item.status !== "pending" && (
            <span className="inline-flex items-center gap-1 text-xs text-text-muted">
              {statusIcon(item.status)}
              {item.status === "approved"
                ? "Approved"
                : item.status === "edited"
                  ? "Edited"
                  : "Rejected"}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col gap-1">
          <button
            onClick={() => onSetStatus(item.questionId, "approved")}
            disabled={item.status === "approved"}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-all hover:bg-emerald-500/15 hover:text-emerald-400 disabled:opacity-30"
            title="Approve"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              setEditValue(item.finalAnswer);
              setIsEditing(true);
            }}
            disabled={isEditing}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-all hover:bg-amber-500/15 hover:text-amber-400 disabled:opacity-30"
            title="Edit"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() =>
              onSetStatus(
                item.questionId,
                item.status === "rejected" ? "pending" : "rejected",
              )
            }
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-all hover:bg-red-500/15 hover:text-red-400"
            title={item.status === "rejected" ? "Restore" : "Reject"}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function QuestionnaireReview({
  items,
  onUpdateAnswer,
  onSetStatus,
  onApproveAll,
  onPromoteAndDownload,
  onClose,
  isProcessing,
  progress,
  processingLabel,
  fileName,
}: QuestionnaireReviewProps) {
  const approvedCount = items.filter(
    (i) => i.status === "approved" || i.status === "edited",
  ).length;
  const rejectedCount = items.filter((i) => i.status === "rejected").length;
  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-8 pb-8">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={!isProcessing ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="
          relative z-10 w-full max-w-5xl
          glass-card border border-white/10 bg-slate-950/90 shadow-2xl
          animate-in fade-in slide-in-from-bottom-4 duration-300
        "
      >
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
              <FileSpreadsheet className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Questionnaire Review
              </h2>
              {fileName && (
                <p className="text-xs text-text-muted">{fileName}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Stats */}
            <div className="hidden items-center gap-2 sm:flex">
              <Badge variant="success">{approvedCount} approved</Badge>
              <Badge variant="danger">{rejectedCount} rejected</Badge>
              <Badge variant="neutral">{pendingCount} pending</Badge>
            </div>

            <button
              onClick={onClose}
              disabled={isProcessing}
              className="rounded-lg p-1.5 text-text-muted hover:bg-white/10 hover:text-text-primary transition-colors disabled:opacity-40"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Processing overlay ────────────────────────────────── */}
        {isProcessing && (
          <div className="border-b border-white/5 px-6 py-4">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-text-secondary">
                {processingLabel ?? "Processing..."}
              </span>
            </div>
            <Progress value={progress} size="sm" showPercentage />
          </div>
        )}

        {/* ── Items list ───────────────────────────────────────── */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          <div className="space-y-3">
            {items.map((item, i) => (
              <ReviewRow
                key={item.questionId}
                item={item}
                index={i}
                onUpdateAnswer={onUpdateAnswer}
                onSetStatus={onSetStatus}
              />
            ))}
          </div>

          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-text-muted">
              <FileSpreadsheet className="mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">No questions found.</p>
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 border-t border-white/5 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<CheckCheck className="h-3.5 w-3.5" />}
              onClick={onApproveAll}
              disabled={isProcessing}
            >
              Approve All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<XCircle className="h-3.5 w-3.5" />}
              onClick={onClose}
              disabled={isProcessing}
            >
              Cancel
            </Button>
          </div>

          <Button
            variant="primary"
            size="md"
            icon={<Download className="h-4 w-4" />}
            onClick={onPromoteAndDownload}
            disabled={isProcessing || approvedCount + items.filter((i) => i.status === "edited").length === 0}
            loading={isProcessing}
          >
            Promote & Download ({approvedCount} answers)
          </Button>
        </div>
      </div>
    </div>
  );
}
