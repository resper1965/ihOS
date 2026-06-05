import {
  ShieldCheck,
  FileText,
  ClipboardCheck,
  TrendingUp,
} from "lucide-react";
import { StatsCard } from "@/components/dashboard/stats-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";

const STATS = [
  {
    label: "Total Frameworks",
    value: "231",
    change: "+12",
    icon: ShieldCheck,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    label: "Documents Analyzed",
    value: "187",
    change: "+24",
    icon: FileText,
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    label: "Active Assessments",
    value: "43",
    change: "+5",
    icon: ClipboardCheck,
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  {
    label: "Compliance Score",
    value: "94.2%",
    change: "+2.1%",
    icon: TrendingUp,
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
] as const;

const RECENT_ACTIVITY = [
  {
    action: "ISO 27001 assessment updated",
    time: "2 min ago",
    type: "assessment" as const,
  },
  {
    action: "TX-RAMP gap analysis completed",
    time: "15 min ago",
    type: "analysis" as const,
  },
  {
    action: "SOC 2 Type II document uploaded",
    time: "1 hour ago",
    type: "document" as const,
  },
  {
    action: "HIPAA control mapping reviewed",
    time: "3 hours ago",
    type: "review" as const,
  },
  {
    action: "NIST CSF score updated to 92%",
    time: "5 hours ago",
    type: "score" as const,
  },
] as const;

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Bem-vindo ao{" "}
          <span className="gradient-text">ihOS</span>
        </h1>
        <p className="mt-1 text-text-secondary">
          Sua visão consolidada de compliance e governança.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <StatsCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            change={stat.change}
            icon={stat.icon}
            color={stat.color}
            bgColor={stat.bgColor}
          />
        ))}
      </div>

      {/* Recent Activity */}
      <ActivityFeed activities={RECENT_ACTIVITY} />
    </div>
  );
}

