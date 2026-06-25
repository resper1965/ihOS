"use client";

import { useState, useMemo } from "react";
import type { StrideThreat, StrideCategory } from "@/lib/supabase";
import { STRIDE_LABELS } from "@/lib/supabase";

interface StrideRadarProps {
  threats: StrideThreat[];
}

const CATEGORIES: StrideCategory[] = ["S", "T", "R", "I", "D", "E"];
const CENTER = 150;
const MAX_RADIUS = 110;
const LEVELS = [0.33, 0.66, 1];

function getPoint(index: number, radius: number): [number, number] {
  const angle = (Math.PI * 2 * index) / 6 - Math.PI / 2;
  return [CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)];
}

function polygonPoints(radius: number): string {
  return CATEGORIES.map((_, i) => getPoint(i, radius).join(",")).join(" ");
}

export function StrideRadar({ threats }: StrideRadarProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const counts = useMemo(() => {
    const map: Record<StrideCategory, number> = { S: 0, T: 0, R: 0, I: 0, D: 0, E: 0 };
    for (const t of threats) {
      if (map[t.stride_category] !== undefined) {
        map[t.stride_category]++;
      }
    }
    return map;
  }, [threats]);

  const maxCount = useMemo(
    () => Math.max(...Object.values(counts), 1),
    [counts]
  );

  const dataPoints = useMemo(
    () =>
      CATEGORIES.map((cat, i) => {
        const ratio = counts[cat] / maxCount;
        const radius = Math.max(ratio * MAX_RADIUS, 8);
        return getPoint(i, radius);
      }),
    [counts, maxCount]
  );

  const dataPolygon = dataPoints.map((p) => p.join(",")).join(" ");

  const labelPoints = CATEGORIES.map((_, i) => getPoint(i, MAX_RADIUS + 28));

  return (
    <div className="glass-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-text-primary">
          STRIDE Distribution
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          Threat count per category
        </p>
      </div>

      <div className="relative mx-auto w-full max-w-[300px]">
        <svg viewBox="0 0 300 300" className="w-full">
          <defs>
            <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: "#3DC2C2", stopOpacity: 0.2 }} />
              <stop offset="100%" style={{ stopColor: "#3DC2C2", stopOpacity: 0.05 }} />
            </linearGradient>
          </defs>

          {/* Concentric grid hexagons */}
          {LEVELS.map((level) => (
            <polygon
              key={level}
              points={polygonPoints(MAX_RADIUS * level)}
              fill="none"
              stroke="currentColor"
              className="text-white/10"
              strokeWidth="1"
            />
          ))}

          {/* Axis lines from center */}
          {CATEGORIES.map((_, i) => {
            const [x, y] = getPoint(i, MAX_RADIUS);
            return (
              <line
                key={i}
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
                stroke="currentColor"
                className="text-white/10"
                strokeWidth="1"
              />
            );
          })}

          {/* Data area */}
          <polygon
            points={dataPolygon}
            fill="url(#radarFill)"
            stroke="#3DC2C2"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {dataPoints.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={hoveredIdx === i ? 6 : 4}
              fill="#3DC2C2"
              stroke="#0f172a"
              strokeWidth="2"
              className="transition-all duration-200 cursor-pointer"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}

          {/* Labels */}
          {CATEGORIES.map((cat, i) => {
            const [x, y] = labelPoints[i];
            return (
              <text
                key={cat}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-text-secondary text-[11px] font-medium"
              >
                {STRIDE_LABELS[cat]}
              </text>
            );
          })}
        </svg>

        {/* Tooltip overlay */}
        {hoveredIdx !== null && (
          <div
            className="pointer-events-none absolute z-50 rounded-xl border border-border-glass bg-bg-card px-3 py-2 shadow-xl"
            style={{
              left: `${(dataPoints[hoveredIdx][0] / 300) * 100}%`,
              top: `${(dataPoints[hoveredIdx][1] / 300) * 100}%`,
              transform: "translate(-50%, -120%)",
            }}
          >
            <p className="text-xs font-semibold text-text-primary">
              {STRIDE_LABELS[CATEGORIES[hoveredIdx]]}
            </p>
            <p className="text-xs text-text-muted">
              {counts[CATEGORIES[hoveredIdx]]} threat
              {counts[CATEGORIES[hoveredIdx]] !== 1 ? "s" : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
