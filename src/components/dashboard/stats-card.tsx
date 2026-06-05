import { ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  label: string;
  value: string;
  change: string;
  icon: LucideIcon;
  color?: string;
  bgColor?: string;
}

export function StatsCard({
  label,
  value,
  change,
  icon: Icon,
  color = "text-primary",
  bgColor = "bg-primary/10",
}: StatsCardProps) {
  return (
    <div className="glass-card group cursor-default p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/5">
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bgColor}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <span className="flex items-center gap-0.5 rounded-lg bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
          {change}
          <ArrowUpRight className="h-3 w-3" />
        </span>
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold tracking-tight text-text-primary">{value}</p>
        <p className="mt-1 text-sm text-text-secondary">{label}</p>
      </div>
    </div>
  );
}
