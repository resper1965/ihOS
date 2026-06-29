"use client";

import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import type { EvidenceEvaluation } from "@/hooks/queries/use-assessments";

// Re-export for convenience
export type { EvidenceEvaluation };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface EvidenceTableProps {
  evaluations: EvidenceEvaluation[];
  loading: boolean;
}

// ---------------------------------------------------------------------------
// EvidenceTable
// ---------------------------------------------------------------------------
export function EvidenceTable({ evaluations, loading }: EvidenceTableProps) {
  return (
    <div className="mt-5 border-t border-[#53c4cd]/20 pt-5 animate-in fade-in slide-in-from-top-2 duration-200">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-[#53c4cd] mb-3">
        Evidence Evaluations
      </h4>

      {loading && (
        <div className="flex items-center gap-2 py-6 justify-center text-text-muted text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-[#53c4cd]" />
          Loading evaluations…
        </div>
      )}

      {!loading && evaluations && evaluations.length === 0 && (
        <p className="text-xs text-text-muted text-center py-4">
          No evidence evaluations recorded for this assessment.
        </p>
      )}

      {!loading && evaluations && evaluations.length > 0 && (
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
              {evaluations.map((ev) => {
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
  );
}
