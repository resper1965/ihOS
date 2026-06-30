"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import type { GapItem } from "@/lib/data/compliance-data";
import { HelpTooltip } from "./help-tooltip";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SortField = "code" | "domain" | "name" | "confidence" | "status";
type SortDir = "asc" | "desc";

const statusOrder: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: GapItem["status"] }) {
  const config = {
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
  }[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {status === "critical" && (
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
// Confidence Bar
// ─────────────────────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 70
      ? "from-accent to-accent"
      : value >= 40
        ? "from-amber-500 to-amber-400"
        : "from-red-500 to-red-400";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span
        className={`text-xs font-semibold tabular-nums ${
          value >= 70 ? "text-emerald-600 dark:text-emerald-400" : value >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
        }`}
      >
        {value}%
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
  className = "",
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const isActive = currentField === field;

  return (
    <button
      onClick={() => onSort(field)}
      className={`group flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-text-primary ${className}`}
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
// Gap Table (exported)
// ─────────────────────────────────────────────────────────────────────────────

interface GapTableProps {
  gaps: GapItem[];
}

export function GapTable({ gaps }: GapTableProps) {
  const [sortField, setSortField] = useState<SortField>("confidence");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    const copy = [...gaps];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "code":
          cmp = a.code.localeCompare(b.code);
          break;
        case "domain":
          cmp = a.domain.localeCompare(b.domain);
          break;
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "confidence":
          cmp = a.confidence - b.confidence;
          break;
        case "status":
          cmp = statusOrder[a.status] - statusOrder[b.status];
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [gaps, sortField, sortDir]);

  return (
    <div className="glass-card overflow-hidden">
      <div className="border-b border-border-glass px-6 py-4">
        <h3 className="text-lg font-semibold text-text-primary">
          Top Compliance Gaps
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          Non-compliant controls sorted by confidence — lowest = most critical
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-glass">
              <th className="px-6 py-3 text-left">
                <SortHeader
                  label="Control"
                  field="code"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="Domain"
                  field="domain"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader
                  label="Name"
                  field="name"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-4 py-3 text-left">
                <div className="flex items-center gap-1.5">
                  <SortHeader
                    label="Status"
                    field="status"
                    currentField={sortField}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <HelpTooltip content="Gap severity (Critical/High/Medium/Low) based on regulatory impact and absence of controls." />
                </div>
              </th>
              <th className="px-4 py-3 text-left">
                <div className="flex items-center gap-1.5">
                  <SortHeader
                    label="Confidence"
                    field="confidence"
                    currentField={sortField}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  <HelpTooltip content="AI statistical confidence (0-100%) in the response, calculated from the precision of evidence and policies found." />
                </div>
              </th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((gap) => {
              const isExpanded = expandedRow === gap.code;
              return (
                <tr key={gap.code} className="group">
                  <td colSpan={6} className="p-0">
                    {/* Main row */}
                    <button
                      onClick={() =>
                        setExpandedRow(isExpanded ? null : gap.code)
                      }
                      className={`flex w-full items-center border-b transition-colors duration-200 ${
                        isExpanded
                          ? "border-border-glass bg-black/[0.03] dark:bg-white/[0.03]"
                          : "border-border-glass hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                      }`}
                    >
                      <span className="w-[140px] shrink-0 px-6 py-3.5 text-left">
                        <span className="font-mono text-sm font-semibold text-primary">
                          {gap.code}
                        </span>
                      </span>
                      <span className="w-[80px] shrink-0 px-4 py-3.5 text-left">
                        <span className="rounded-md bg-black/5 dark:bg-white/5 px-2 py-0.5 text-xs font-medium text-text-muted">
                          {gap.domain}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1 px-4 py-3.5 text-left">
                        <span className="text-sm text-text-secondary">
                          {gap.name}
                        </span>
                      </span>
                      <span className="w-[120px] shrink-0 px-4 py-3.5 text-left">
                        <StatusBadge status={gap.status} />
                      </span>
                      <span className="w-[130px] shrink-0 px-4 py-3.5 text-left">
                        <ConfidenceBar value={gap.confidence} />
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
                    {isExpanded && gap.missingElements && (
                      <div className="border-b border-border-glass bg-black/[0.02] dark:bg-white/[0.02] px-10 py-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                          Missing Elements
                        </p>
                        <ul className="space-y-1.5">
                          {gap.missingElements.map((el, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400/60" />
                              {el}
                            </li>
                          ))}
                        </ul>
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
