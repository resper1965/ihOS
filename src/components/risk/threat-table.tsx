"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Filter } from "lucide-react";
import type { StrideThreat, StrideCategory, SeverityLevel } from "@/lib/supabase/types";
import { STRIDE_LABELS } from "@/lib/supabase/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SortField = "rpn" | "severity" | "category";
type SortDir = "asc" | "desc";

interface ThreatTableProps {
  threats: StrideThreat[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIDE Category Badge
// ─────────────────────────────────────────────────────────────────────────────

const strideBadgeStyles: Record<StrideCategory, { bg: string; text: string }> = {
  S: { bg: "bg-red-500/15", text: "text-red-400" },
  T: { bg: "bg-orange-500/15", text: "text-orange-400" },
  R: { bg: "bg-amber-500/15", text: "text-amber-400" },
  I: { bg: "bg-cyan-500/15", text: "text-cyan-400" },
  D: { bg: "bg-purple-500/15", text: "text-purple-400" },
  E: { bg: "bg-rose-500/15", text: "text-rose-400" },
};

function StrideBadge({ category }: { category: StrideCategory }) {
  const style = strideBadgeStyles[category];
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${style.bg} ${style.text}`}
      title={STRIDE_LABELS[category]}
    >
      {category}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Severity Badge
// ─────────────────────────────────────────────────────────────────────────────

const severityConfig: Record<SeverityLevel, { bg: string; text: string; dot: string; label: string }> = {
  critical: {
    bg: "bg-red-500/15 border-red-500/25",
    text: "text-red-600 dark:text-red-400",
    dot: "bg-red-500 dark:bg-red-400",
    label: "Critical",
  },
  high: {
    bg: "bg-orange-500/15 border-orange-500/25",
    text: "text-orange-600 dark:text-orange-400",
    dot: "bg-orange-500 dark:bg-orange-400",
    label: "High",
  },
  medium: {
    bg: "bg-amber-500/15 border-amber-500/25",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500 dark:bg-amber-400",
    label: "Medium",
  },
  low: {
    bg: "bg-primary/15 border-primary/25",
    text: "text-cyan-600 dark:text-primary",
    dot: "bg-cyan-500 dark:bg-primary",
    label: "Low",
  },
};

function SeverityBadge({ severity }: { severity: SeverityLevel }) {
  const config = severityConfig[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {severity === "critical" && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${config.dot}`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${config.dot}`} />
      </span>
      {config.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RPN Bar
// ─────────────────────────────────────────────────────────────────────────────

function RpnBar({ value, max = 1000 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
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
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
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
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const isActive = currentField === field;
  return (
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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Threat Table
// ─────────────────────────────────────────────────────────────────────────────

const severityOrder: Record<SeverityLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const categoryOrder: Record<StrideCategory, number> = {
  S: 0,
  T: 1,
  R: 2,
  I: 3,
  D: 4,
  E: 5,
};

export function ThreatTable({ threats }: ThreatTableProps) {
  const [sortField, setSortField] = useState<SortField>("rpn");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<StrideCategory | "all">("all");
  const [filterSeverity, setFilterSeverity] = useState<SeverityLevel | "all">("all");

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    let result = threats;
    if (filterCategory !== "all") {
      result = result.filter((t) => t.stride_category === filterCategory);
    }
    if (filterSeverity !== "all") {
      result = result.filter((t) => t.severity === filterSeverity);
    }
    return result;
  }, [threats, filterCategory, filterSeverity]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "rpn":
          cmp = a.rpn - b.rpn;
          break;
        case "severity":
          cmp = severityOrder[a.severity] - severityOrder[b.severity];
          break;
        case "category":
          cmp = categoryOrder[a.stride_category] - categoryOrder[b.stride_category];
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortField, sortDir]);

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="border-b border-border-glass px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">
              Threat Catalog
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              {sorted.length} threat{sorted.length !== 1 ? "s" : ""} identified
            </p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-text-muted" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as StrideCategory | "all")}
              className="rounded-lg border border-border-glass bg-white/5 px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="all">All Categories</option>
              {(Object.keys(STRIDE_LABELS) as StrideCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {cat} — {STRIDE_LABELS[cat]}
                </option>
              ))}
            </select>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value as SeverityLevel | "all")}
              className="rounded-lg border border-border-glass bg-white/5 px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-glass">
              <th className="px-6 py-3 text-left">
                <SortHeader
                  label="STRIDE"
                  field="category"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                Title
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted lg:table-cell">
                Component
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="Severity"
                  field="severity"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
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
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((threat) => {
              const isExpanded = expandedRow === threat.id;
              return (
                <tr key={threat.id} className="group">
                  <td colSpan={6} className="p-0">
                    {/* Main row */}
                    <button
                      onClick={() =>
                        setExpandedRow(isExpanded ? null : threat.id)
                      }
                      className={`flex w-full items-center border-b transition-colors duration-200 ${
                        isExpanded
                          ? "border-border-glass bg-black/[0.03] dark:bg-white/[0.03]"
                          : "border-border-glass hover:bg-black/[0.02] dark:hover:bg-white/5"
                      }`}
                    >
                      <span className="w-[70px] shrink-0 px-6 py-3.5 text-left">
                        <StrideBadge category={threat.stride_category} />
                      </span>
                      <span className="min-w-0 flex-1 px-4 py-3.5 text-left">
                        <span className="text-sm text-text-secondary">
                          {threat.title}
                        </span>
                      </span>
                      <span className="hidden w-[140px] shrink-0 px-4 py-3.5 text-left lg:block">
                        <span className="rounded-md bg-black/5 dark:bg-white/5 px-2 py-0.5 text-xs font-medium text-text-muted">
                          {threat.affected_component}
                        </span>
                      </span>
                      <span className="w-[120px] shrink-0 px-4 py-3.5 text-left">
                        <SeverityBadge severity={threat.severity} />
                      </span>
                      <span className="w-[140px] shrink-0 px-4 py-3.5 text-left">
                        <RpnBar value={threat.rpn} />
                      </span>
                      <span className="w-10 shrink-0 px-4 py-3.5 text-center">
                        <ChevronDown
                          className={`h-4 w-4 stroke-[1.5] text-text-muted transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </span>
                    </button>

                    {/* Expanded row */}
                    {isExpanded && (
                      <div className="border-b border-border-glass bg-black/[0.02] dark:bg-white/[0.02] px-10 py-4 space-y-4">
                        {/* Description */}
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
                            Description
                          </p>
                          <p className="text-sm text-text-secondary leading-relaxed">
                            {threat.description}
                          </p>
                        </div>

                        {/* Mitigations */}
                        {threat.mitigations.length > 0 && (
                          <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
                              Mitigations
                            </p>
                            <ul className="space-y-1.5">
                              {threat.mitigations.map((m, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-2 text-sm text-text-secondary"
                                >
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/60" />
                                  {m}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Related Controls */}
                        {threat.related_controls.length > 0 && (
                          <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
                              Related Controls
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {threat.related_controls.map((c) => (
                                <span
                                  key={c}
                                  className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
