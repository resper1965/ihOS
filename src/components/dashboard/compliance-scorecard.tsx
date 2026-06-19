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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
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
              ${isHovered ? `scale-[1.02] shadow-xl ${getScoreGlow(effectiveScore)}` : ""}
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
              <span className="ml-2 text-xs text-text-muted">Conformidade Geral (Conforme)</span>
            </div>

            {/* Dual Phase Progress Bars */}
            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-text-secondary font-medium">1. Políticas & Processos (ISMS)</span>
                  <span className="font-semibold text-emerald-400 tabular-nums">
                    {fw.ismsScore !== null ? `${fw.ismsScore}%` : "—"}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000 ease-out"
                    style={{ width: `${fw.ismsScore ?? 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-text-secondary font-medium">2. Evidências Técnicas (Operacional)</span>
                  <span className="font-semibold text-cyan-400 tabular-nums">
                    {fw.evidenceScore !== null ? `${fw.evidenceScore}%` : "—"}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-1000 ease-out"
                    style={{ width: `${fw.evidenceScore ?? 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 4-State Indicators Grid */}
            <div className="mt-4 pt-3 border-t border-white/5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                <span className="text-text-muted truncate">Conforme:</span>
                <span className="font-bold text-text-primary ml-auto tabular-nums">{fw.conformingCount ?? 0}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
                <span className="text-text-muted truncate">Parcial:</span>
                <span className="font-bold text-text-primary ml-auto tabular-nums">{fw.partialCount ?? 0}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-orange-400 shadow-sm shadow-orange-400/50" />
                <span className="text-text-muted truncate">Informal:</span>
                <span className="font-bold text-text-primary ml-auto tabular-nums">{fw.informalCount ?? 0}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400 shadow-sm shadow-red-400/50" />
                <span className="text-text-muted truncate">Gaps:</span>
                <span className="font-bold text-text-primary ml-auto tabular-nums">{fw.gapCount ?? 0}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
