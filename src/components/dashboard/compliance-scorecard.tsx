"use client";

import { useState } from "react";
import type { FrameworkScore } from "@/lib/data/compliance-data";

interface ComplianceScorecardProps {
  frameworks: FrameworkScore[];
}

function getScoreColor(score: number | null): string {
  if (score === null) return "text-slate-400";
  if (score >= 80) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function getScoreBg(score: number | null): string {
  if (score === null) return "from-slate-500/20 to-slate-600/10";
  if (score >= 80) return "from-emerald-500/20 to-emerald-600/10";
  if (score >= 50) return "from-amber-500/20 to-amber-600/10";
  return "from-red-500/20 to-red-600/10";
}

function getScoreGlow(score: number | null): string {
  if (score === null) return "shadow-slate-500/5";
  if (score >= 80) return "shadow-emerald-500/10";
  if (score >= 50) return "shadow-amber-500/10";
  return "shadow-red-500/10";
}

function getProgressGradient(score: number | null): string {
  if (score === null) return "from-slate-500 to-slate-400";
  if (score >= 80) return "from-emerald-500 to-emerald-400";
  if (score >= 50) return "from-amber-500 to-amber-400";
  return "from-red-500 to-red-400";
}

function getEffectiveScore(fw: FrameworkScore): number | null {
  return fw.score ?? fw.coverage ?? null;
}

export function ComplianceScorecard({ frameworks }: ComplianceScorecardProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {frameworks.map((fw, idx) => {
        const effectiveScore = getEffectiveScore(fw);
        const isHovered = hoveredIndex === idx;

        return (
          <div
            key={fw.code}
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
            className={`
              glass-card group relative cursor-default overflow-hidden p-5
              transition-all duration-500 ease-out
              ${isHovered ? `scale-[1.03] shadow-xl ${getScoreGlow(effectiveScore)}` : ""}
            `}
          >
            {/* Top glow accent */}
            <div
              className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${getProgressGradient(effectiveScore)} transition-opacity duration-500 ${isHovered ? "opacity-100" : "opacity-40"}`}
            />

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl" role="img" aria-label={fw.name}>
                  {fw.icon}
                </span>
                <span className="text-sm font-semibold text-text-primary truncate">
                  {fw.name}
                </span>
              </div>
            </div>

            {/* Score display */}
            <div className="mt-4 flex items-baseline gap-1">
              <span className={`text-3xl font-bold tabular-nums tracking-tight ${getScoreColor(effectiveScore)}`}>
                {effectiveScore !== null ? `${effectiveScore}` : "—"}
              </span>
              {effectiveScore !== null && (
                <span className={`text-sm font-medium ${getScoreColor(effectiveScore)}`}>%</span>
              )}
            </div>

            {/* Score label */}
            <p className="mt-1 text-xs text-text-muted">
              {fw.score !== null
                ? "Score"
                : fw.coverage !== null
                  ? "Coverage"
                  : "Pending"}
            </p>

            {/* Progress bar */}
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${getProgressGradient(effectiveScore)} transition-all duration-1000 ease-out`}
                  style={{ width: `${effectiveScore ?? 0}%` }}
                />
              </div>
            </div>

            {/* Missing controls */}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-text-muted">Missing controls</span>
              <span
                className={`
                  rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums
                  ${fw.missing === 0
                    ? "bg-emerald-500/10 text-emerald-400"
                    : fw.missing < 50
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-red-500/10 text-red-400"
                  }
                `}
              >
                {fw.missing}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
