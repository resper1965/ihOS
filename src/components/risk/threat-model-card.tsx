"use client";

import { Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ThreatModelSummary, ThreatModelStatus } from "@/lib/supabase";

interface ThreatModelCardProps {
  model: ThreatModelSummary;
  onView?: () => void;
  onReport?: () => void;
}

const statusVariant: Record<ThreatModelStatus, "warning" | "info" | "success" | "danger"> = {
  draft: "warning",
  reviewed: "info",
  approved: "success",
  rejected: "danger",
};

const statusBorderColor: Record<ThreatModelStatus, string> = {
  draft: "border-l-amber-500",
  reviewed: "border-l-blue-500",
  approved: "border-l-emerald-500",
  rejected: "border-l-red-500",
};

const statusLabel: Record<ThreatModelStatus, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  approved: "Approved",
  rejected: "Rejected",
};

export function ThreatModelCard({ model, onView, onReport }: ThreatModelCardProps) {
  const formattedDate = new Date(model.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className={`glass-card border-l-4 ${statusBorderColor[model.status]} p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-primary">
          {model.model_id}
        </span>
        <Badge variant={statusVariant[model.status]}>
          {statusLabel[model.status]}
        </Badge>
      </div>

      {/* Body */}
      <div className="mt-3 space-y-1">
        <p className="text-sm text-text-secondary">
          <span className="text-text-muted">Version:</span>{" "}
          {model.product_version}
        </p>
        <p className="text-sm text-text-secondary">
          <span className="text-text-muted">Created:</span> {formattedDate}
        </p>
      </div>

      {/* Stats Row */}
      <div className="mt-4 grid grid-cols-4 gap-3 border-t border-border-glass pt-3">
        {[
          { label: "Threats", value: model.threat_count },
          { label: "Gaps", value: model.gap_count },
          { label: "Recs", value: model.recommendation_count },
          { label: "Avg RPN", value: model.avg_rpn.toFixed(1) },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <p className="text-sm font-bold text-text-primary tabular-nums">
              {stat.value}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 flex justify-end gap-2 border-t border-border-glass pt-3">
        {onReport && (
          <Button
            variant="secondary"
            size="sm"
            icon={<FileText className="h-3.5 w-3.5" />}
            onClick={onReport}
          >
            Report
          </Button>
        )}
        {onView && (
          <Button
            variant="primary"
            size="sm"
            icon={<Eye className="h-3.5 w-3.5" />}
            onClick={onView}
          >
            View
          </Button>
        )}
      </div>
    </div>
  );
}
