"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Info } from "lucide-react";
import type { FmeaItem } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SortField = "rpn" | "severity" | "occurrence" | "detection";
type SortDir = "asc" | "desc";

interface FmeaTableProps {
  items: FmeaItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Header Tooltip
// ─────────────────────────────────────────────────────────────────────────────

function HeaderTooltip({ content }: { content: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <Info className="h-3.5 w-3.5 text-text-muted/60 cursor-help" />
      {show && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 w-52 -translate-x-1/2 rounded-xl border border-border-glass bg-bg-card px-3 py-2 text-[11px] font-normal normal-case tracking-normal text-text-secondary shadow-xl">
          {content}
        </span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RPN Bar
// ─────────────────────────────────────────────────────────────────────────────

function RpnBar({ value }: { value: number }) {
  const pct = Math.min((value / 1000) * 100, 100);
  const color =
    value >= 200
      ? "from-red-500 to-red-400"
      : value >= 100
        ? "from-amber-500 to-amber-400"
        : "from-emerald-500 to-emerald-400";
  const textColor =
    value >= 200
      ? "text-red-400"
      : value >= 100
        ? "text-amber-400"
        : "text-emerald-400";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${textColor}`}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort Header
// ─────────────────────────────────────────────────────────────────────────────

function SortHeader({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  tooltip,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (f: SortField) => void;
  tooltip?: string;
}) {
  const isActive = currentField === field;
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onSort(field)}
        className="group flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary"
      >
        {label}
        <span className="text-text-muted/60">
          {isActive ? (
            currentDir === "asc" ? (
              <ChevronUp className="h-3.5 w-3.5 stroke-[1.5]" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 stroke-[1.5]" />
            )
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 stroke-[1.5] opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </span>
      </button>
      {tooltip && <HeaderTooltip content={tooltip} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FMEA Table
// ─────────────────────────────────────────────────────────────────────────────

export function FmeaTable({ items }: FmeaTableProps) {
  const [sortField, setSortField] = useState<SortField>("rpn");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showAll, setShowAll] = useState(false);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "rpn":
          cmp = a.rpn - b.rpn;
          break;
        case "severity":
          cmp = a.severity - b.severity;
          break;
        case "occurrence":
          cmp = a.occurrence - b.occurrence;
          break;
        case "detection":
          cmp = a.detection - b.detection;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [items, sortField, sortDir]);

  const displayed = showAll ? sorted : sorted.slice(0, 20);

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="border-b border-border-glass px-6 py-4">
        <h3 className="text-lg font-semibold text-text-primary">
          FMEA Analysis
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          {items.length} failure mode{items.length !== 1 ? "s" : ""} analyzed —
          sorted by Risk Priority Number
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-glass">
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                Failure Mode
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="Sev"
                  field="severity"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                  tooltip="Severity: Impact if the failure occurs (1=lowest, 10=highest)"
                />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="Occ"
                  field="occurrence"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                  tooltip="Occurrence: How often the failure is likely to occur (1=lowest, 10=highest)"
                />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="Det"
                  field="detection"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                  tooltip="Detection: Ability to detect the failure before impact (1=easy to detect, 10=hard to detect)"
                />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="RPN"
                  field="rpn"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted lg:table-cell">
                Recommended Action
              </th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((item) => (
              <tr
                key={item.threat_id}
                className="border-b border-border-glass transition-colors hover:bg-black/[0.02] dark:hover:bg-white/5"
              >
                <td className="px-6 py-3.5 text-sm text-text-secondary">
                  {item.failure_mode}
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-sm font-semibold tabular-nums text-text-primary">
                    {item.severity}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-sm font-semibold tabular-nums text-text-primary">
                    {item.occurrence}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-sm font-semibold tabular-nums text-text-primary">
                    {item.detection}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <RpnBar value={item.rpn} />
                </td>
                <td className="hidden px-4 py-3.5 text-sm text-text-secondary lg:table-cell">
                  {item.recommended_action}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show All / Show Top 20 */}
      {items.length > 20 && (
        <div className="border-t border-border-glass px-6 py-3 text-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs font-medium text-primary hover:text-primary-hover transition-colors"
          >
            {showAll
              ? "Show Top 20"
              : `Show All (${items.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
