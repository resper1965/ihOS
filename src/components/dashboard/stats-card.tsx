import { ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HelpTooltip } from "./help-tooltip";

interface StatsCardProps {
  label: string;
  value: string;
  change?: string | null;
  icon: LucideIcon;
  color?: string;
  bgColor?: string;
  tooltipContent?: string;
}

export function StatsCard({
  label,
  value,
  change,
  icon: Icon,
  color = "text-primary",
  bgColor = "bg-primary/10",
  tooltipContent,
}: StatsCardProps) {
  return (
    <div className="glass-card group cursor-default p-6 hover:scale-[1.015]">
      <div className="flex items-start justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-full border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-accent/[0.02] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]`}>
          <Icon className={`h-5 w-5 ${color} stroke-[1.8]`} />
        </div>
        {change && (
          <span className="flex items-center gap-0.5 rounded-full bg-accent/10 border border-accent/20 px-2.5 py-0.5 text-xs font-semibold text-accent shadow-sm">
            {change}
            <ArrowUpRight className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="mt-5">
        <p className="text-3xl font-bold tracking-tight text-text-primary leading-none">{value}</p>
        <p className="mt-2 text-xs font-medium text-text-muted flex items-center gap-1.5 uppercase tracking-wider">
          <span>{label}</span>
          {tooltipContent && <HelpTooltip content={tooltipContent} />}
        </p>
      </div>
    </div>
  );
}


