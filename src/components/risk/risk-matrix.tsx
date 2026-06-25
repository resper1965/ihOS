"use client";

import { useState, useMemo } from "react";
import type { StrideThreat, SeverityLevel } from "@/lib/supabase";

interface RiskMatrixProps {
  threats: StrideThreat[];
}

const IMPACT_LABELS = ["Negligible", "Minor", "Moderate", "Major", "Critical"];
const LIKELIHOOD_LABELS = [
  "Almost Certain",
  "Likely",
  "Possible",
  "Unlikely",
  "Rare",
];

const severityToImpact: Record<SeverityLevel, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
};

const likelihoodToRow: Record<string, number> = {
  very_high: 5,
  high: 4,
  medium: 3,
  low: 2,
  very_low: 1,
};

function getCellColor(risk: number): string {
  if (risk >= 20) return "bg-red-700/30 hover:bg-red-700/40";
  if (risk >= 15) return "bg-red-500/20 hover:bg-red-500/30";
  if (risk >= 10) return "bg-orange-500/20 hover:bg-orange-500/30";
  if (risk >= 5) return "bg-amber-500/20 hover:bg-amber-500/30";
  return "bg-emerald-500/20 hover:bg-emerald-500/30";
}

function getCellTextColor(risk: number): string {
  if (risk >= 20) return "text-red-400 font-bold";
  if (risk >= 15) return "text-red-400";
  if (risk >= 10) return "text-orange-400";
  if (risk >= 5) return "text-amber-400";
  return "text-emerald-400";
}

export function RiskMatrix({ threats }: RiskMatrixProps) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const cellMap = useMemo(() => {
    const map: Record<string, StrideThreat[]> = {};
    for (const t of threats) {
      const impact = severityToImpact[t.severity] ?? 1;
      const likelihood = likelihoodToRow[t.likelihood] ?? 1;
      const key = `${likelihood}-${impact}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [threats]);

  return (
    <div className="glass-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-text-primary">
          Risk Assessment Matrix
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          Likelihood × Impact — hover for details
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[480px]" style={{ gridTemplateColumns: "120px repeat(5, 1fr)", gridTemplateRows: "auto repeat(5, 64px)" }}>
          {/* Header row */}
          <div className="flex items-end justify-center pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Likelihood ↓ / Impact →
          </div>
          {IMPACT_LABELS.map((label) => (
            <div
              key={label}
              className="flex items-end justify-center pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted"
            >
              {label}
            </div>
          ))}

          {/* Data rows — top row is highest likelihood */}
          {[5, 4, 3, 2, 1].map((likelihoodRow, rowIdx) => (
            <>
              {/* Row label */}
              <div
                key={`label-${likelihoodRow}`}
                className="flex items-center justify-end pr-3 text-xs font-medium text-text-secondary"
              >
                {LIKELIHOOD_LABELS[rowIdx]}
              </div>

              {/* Cells */}
              {[1, 2, 3, 4, 5].map((impactCol) => {
                const key = `${likelihoodRow}-${impactCol}`;
                const risk = likelihoodRow * impactCol;
                const cellThreats = cellMap[key] || [];
                const isHovered = hoveredCell === key;

                return (
                  <div
                    key={key}
                    className={`relative m-0.5 flex items-center justify-center rounded-lg border border-white/5 transition-all duration-300 cursor-default ${getCellColor(risk)}`}
                    onMouseEnter={() => setHoveredCell(key)}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    <span
                      className={`text-sm font-semibold tabular-nums ${getCellTextColor(risk)}`}
                    >
                      {cellThreats.length > 0 ? cellThreats.length : ""}
                    </span>

                    {/* Tooltip */}
                    {isHovered && cellThreats.length > 0 && (
                      <div className="absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-xl border border-border-glass bg-bg-card p-3 shadow-xl">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                          Risk Level: {risk}
                        </p>
                        <ul className="space-y-1">
                          {cellThreats.map((t) => (
                            <li
                              key={t.id}
                              className="flex items-start gap-1.5 text-xs text-text-secondary"
                            >
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                              {t.title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
