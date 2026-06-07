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
    <div className="space-y-2">
      {sorted.map((d) => {
        const isHovered = hoveredDomain === d.domain;
        return (
          <div
            key={d.domain}
            className="group"
            onMouseEnter={() => setHoveredDomain(d.domain)}
            onMouseLeave={() => setHoveredDomain(null)}
          >
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
                <span className="tabular-nums text-text-muted">
                  {d.compliant}/{d.total}
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
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
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
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Donut + Stats */}
      <div className="glass-card p-6">
        <h3 className="mb-5 text-lg font-semibold text-text-primary">
          Evidence Evaluation
        </h3>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <DonutChart
            compliant={evaluation.compliant}
            nonCompliant={evaluation.nonCompliant}
            total={evaluation.total}
          />
          <div className="flex flex-1 flex-col justify-center gap-4">
            <StatPill
              label="Compliant"
              value={evaluation.compliant}
              color="bg-emerald-400"
            />
            <StatPill
              label="Non-Compliant"
              value={evaluation.nonCompliant}
              color="bg-red-400"
            />
            <StatPill
              label="Total Evaluated"
              value={evaluation.total}
              color="bg-blue-400"
            />
            <div className="mt-1 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <p className="text-xs text-text-muted">Avg. Confidence</p>
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
          Domain Breakdown
        </h3>
        <DomainBarChart domains={domains} />
      </div>
    </div>
  );
}
