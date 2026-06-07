"use client";

import { useState } from "react";
import { TrendingUp, Zap } from "lucide-react";
import type { RoiItem } from "@/lib/data/compliance-data";

// ─────────────────────────────────────────────────────────────────────────────
// ROI Priority List (exported)
// ─────────────────────────────────────────────────────────────────────────────

interface RoiPriorityProps {
  items: RoiItem[];
}

function getRoiColor(roi: number): string {
  if (roi >= 3) return "text-emerald-400";
  if (roi >= 1) return "text-amber-400";
  return "text-blue-400";
}

function getRoiBarColor(roi: number): string {
  if (roi >= 3) return "from-emerald-600 to-emerald-400";
  if (roi >= 1) return "from-amber-600 to-amber-400";
  return "from-blue-600 to-blue-400";
}

export function RoiPriority({ items }: RoiPriorityProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxRoi = Math.max(...items.map((i) => i.roi));

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20">
          <TrendingUp className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            ROI Priority Path
          </h3>
          <p className="text-sm text-text-muted">
            Top 10 controls to implement next — ranked by multi-framework impact
          </p>
        </div>
      </div>

      {/* List */}
      <div className="divide-y divide-white/5">
        {items.map((item, idx) => {
          const isHovered = hoveredIdx === idx;
          const barWidth = (item.roi / maxRoi) * 100;

          return (
            <div
              key={item.code}
              className={`group flex items-center gap-4 px-6 py-3.5 transition-colors duration-200 ${
                isHovered ? "bg-white/[0.03]" : ""
              }`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Rank */}
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums transition-all duration-300 ${
                  idx < 3
                    ? "bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 text-emerald-400"
                    : "bg-white/5 text-text-muted"
                }`}
              >
                {idx + 1}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-blue-400">
                    {item.code}
                  </span>
                  <span className="text-sm text-text-secondary truncate">
                    {item.name}
                  </span>
                </div>
                {/* Framework badges */}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.frameworks.map((fw) => (
                    <span
                      key={fw}
                      className="rounded-md border border-white/5 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-text-muted"
                    >
                      {fw}
                    </span>
                  ))}
                </div>
              </div>

              {/* ROI bar + value */}
              <div className="flex w-44 shrink-0 items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${getRoiBarColor(item.roi)} transition-all duration-700 ease-out ${
                      isHovered ? "brightness-125" : ""
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Zap className={`h-3.5 w-3.5 ${getRoiColor(item.roi)}`} />
                  <span
                    className={`text-sm font-bold tabular-nums ${getRoiColor(item.roi)}`}
                  >
                    {item.roi.toFixed(1)}×
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
