"use client";

import { AlertTriangle, ShieldAlert, Activity, FileWarning } from "lucide-react";

interface RiskSummaryCardsProps {
  totalThreats: number;
  criticalHigh: number;
  avgRpn: number;
  totalGaps: number;
}

const cards = [
  {
    key: "threats",
    label: "Total Threats",
    icon: AlertTriangle,
    color: "text-primary",
    border: "border-primary/15",
    bg: "from-primary/[0.08] to-accent/[0.02]",
    getValue: (p: RiskSummaryCardsProps) => String(p.totalThreats),
  },
  {
    key: "critical",
    label: "Critical / High",
    icon: ShieldAlert,
    color: "text-red-500",
    border: "border-red-500/15",
    bg: "from-red-500/[0.08] to-red-500/[0.02]",
    getValue: (p: RiskSummaryCardsProps) => String(p.criticalHigh),
  },
  {
    key: "rpn",
    label: "Avg RPN",
    icon: Activity,
    color: "text-amber-500",
    border: "border-amber-500/15",
    bg: "from-amber-500/[0.08] to-amber-500/[0.02]",
    getValue: (p: RiskSummaryCardsProps) => p.avgRpn.toFixed(1),
  },
  {
    key: "gaps",
    label: "Compliance Gaps",
    icon: FileWarning,
    color: "text-info",
    border: "border-info/15",
    bg: "from-info/[0.08] to-info/[0.02]",
    getValue: (p: RiskSummaryCardsProps) => String(p.totalGaps),
  },
] as const;

export function RiskSummaryCards(props: RiskSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className="glass-card group cursor-default p-6 hover:scale-[1.015]"
          >
            <div className="flex items-start justify-between">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-full border ${card.border} bg-gradient-to-br ${card.bg} shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]`}
              >
                <Icon className={`h-5 w-5 ${card.color} stroke-[1.8]`} />
              </div>
            </div>
            <div className="mt-5">
              <p className="text-3xl font-bold tracking-tight text-text-primary leading-none">
                {card.getValue(props)}
              </p>
              <p className="mt-2 text-xs font-medium text-text-muted flex items-center gap-1.5 uppercase tracking-wider">
                {card.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
