"use client";

import { useState } from "react";
import type { EvaluationSummary, DomainBreakdown } from "@/lib/data/compliance-data";

// ─────────────────────────────────────────────────────────────────────────────
// Donut Chart (SVG)
// ─────────────────────────────────────────────────────────────────────────────

function DonutChart({
  compliant,
  nonCompliant,
  total,
}: {
  compliant: number;
  nonCompliant: number;
  total: number;
}) {
  const compliantPct = (compliant / total) * 100;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const compliantArc = (compliantPct / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="160" height="160" viewBox="0 0 140 140" className="transform -rotate-90">
        {/* Background ring */}
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="rgba(239,68,68,0.15)"
          strokeWidth="14"
        />
        {/* Compliant arc */}
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="url(#donut-gradient)"
          strokeWidth="14"
          strokeDasharray={`${compliantArc} ${circumference - compliantArc}`}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="donut-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-text-primary">
          {compliantPct.toFixed(0)}%
        </span>
        <span className="text-xs text-text-muted">Compliant</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat Pill
// ─────────────────────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-3 w-3 rounded-full ${color}`} />
      <div>
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-sm font-semibold tabular-nums text-text-primary">{value}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain Bar Chart (CSS only)
// ─────────────────────────────────────────────────────────────────────────────

function DomainBarChart({ domains }: { domains: DomainBreakdown[] }) {
  const [hoveredDomain, setHoveredDomain] = useState<string | null>(null);
  const sorted = [...domains].sort((a, b) => a.rate - b.rate);

  return (
    <div className="space-y-4">
      {sorted.map((d) => {
        const isHovered = hoveredDomain === d.domain;
        return (
          <div
            key={d.domain}
            className="group"
            onMouseEnter={() => setHoveredDomain(d.domain)}
            onMouseLeave={() => setHoveredDomain(null)}
          >
            {/* Domain Header */}
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center gap-2">
                <span className="w-8 font-mono font-semibold text-text-muted">{d.domain}</span>
                <span
                  className={`text-text-secondary transition-colors duration-200 ${isHovered ? "text-text-primary" : ""}`}
                >
                  {d.fullName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums text-text-muted text-[10px]">
                  {d.compliant}/{d.total} compliant
                </span>
                <span
                  className={`w-10 text-right font-semibold tabular-nums ${
                    d.rate >= 50 ? "text-emerald-400" : d.rate >= 30 ? "text-amber-400" : "text-red-400"
                  }`}
                >
                  {d.rate}%
                </span>
              </div>
            </div>

            {/* Overall Conforming Progress Bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  d.rate >= 50
                    ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                    : d.rate >= 30
                      ? "bg-gradient-to-r from-amber-600 to-amber-400"
                      : "bg-gradient-to-r from-red-600 to-red-400"
                } ${isHovered ? "brightness-125" : ""}`}
                style={{ width: `${d.rate}%` }}
              />
            </div>

            {/* Dual Phase Micro-Bars */}
            <div className="flex items-center gap-4 mt-1.5 text-[10px] text-text-muted">
              <div className="flex-1 flex items-center gap-1.5">
                <span className="shrink-0">Policies:</span>
                <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500/80 rounded-full" style={{ width: `${d.ismsRate}%` }} />
                </div>
                <span className="font-semibold tabular-nums text-text-secondary">{d.ismsRate}%</span>
              </div>
              <div className="flex-1 flex items-center gap-1.5">
                <span className="shrink-0">Evidence:</span>
                <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500/80 rounded-full" style={{ width: `${d.evidenceRate}%` }} />
                </div>
                <span className="font-semibold tabular-nums text-text-secondary">{d.evidenceRate}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence Summary (exported)
// ─────────────────────────────────────────────────────────────────────────────

interface EvidenceSummaryProps {
  evaluation: EvaluationSummary;
  domains: DomainBreakdown[];
}

export function EvidenceSummary({ evaluation, domains }: EvidenceSummaryProps) {
  // Aggregate overall phase stats from domains breakdown
  const totalControls = domains.reduce((sum, d) => sum + d.total, 0);
  const totalIsms = domains.reduce((sum, d) => sum + d.ismsCompliantCount, 0);
  const totalEv = domains.reduce((sum, d) => sum + d.evidenceCompliantCount, 0);
  const ismsPct = totalControls > 0 ? Math.round((totalIsms / totalControls) * 100) : 0;
  const evidencePct = totalControls > 0 ? Math.round((totalEv / totalControls) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Donut + Stats */}
      <div className="glass-card p-6">
        <h3 className="mb-5 text-lg font-semibold text-text-primary">
          Dual-Phase Audit (Summary)
        </h3>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <DonutChart
            compliant={evaluation.compliant}
            nonCompliant={evaluation.nonCompliant}
            total={evaluation.total}
          />
          <div className="flex flex-1 flex-col justify-center gap-4">
            <StatPill
              label="Fully Compliant (Both Phases)"
              value={evaluation.compliant}
              color="bg-emerald-400"
            />
            <StatPill
              label="Non-Compliant (Gaps / Partial)"
              value={evaluation.nonCompliant}
              color="bg-red-400"
            />
            <StatPill
              label="Evaluated Controls"
              value={evaluation.total}
              color="bg-primary"
            />
            
            {/* Dual Phase Summary Aggregates */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5">
                <p className="text-[10px] text-text-muted">Policies (ISMS)</p>
                <p className="text-sm font-bold text-emerald-400 tabular-nums">{ismsPct}%</p>
              </div>
              <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5">
                <p className="text-[10px] text-text-muted">Technical Evidence</p>
                <p className="text-sm font-bold text-cyan-400 tabular-nums">{evidencePct}%</p>
              </div>
            </div>

            <div className="mt-1 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <p className="text-xs text-text-muted">Average Confidence</p>
              <p className="text-lg font-bold tabular-nums text-text-primary">
                {evaluation.avgConfidence}
                <span className="text-sm text-text-muted">%</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Domain Breakdown */}
      <div className="glass-card p-6">
        <h3 className="mb-5 text-lg font-semibold text-text-primary">
          Compliance by Domain (Policies vs. Evidence)
        </h3>
        <DomainBarChart domains={domains} />
      </div>
    </div>
  );
}
