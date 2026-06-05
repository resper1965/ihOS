import {
  ShieldCheck,
  FileText,
  ClipboardCheck,
  TrendingUp,
  ArrowUpRight,
  Clock,
} from "lucide-react";

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
          <div
            key={stat.label}
            className="glass-card group cursor-default p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/5"
          >
            <div className="flex items-start justify-between">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.bgColor}`}
              >
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <span className="flex items-center gap-0.5 rounded-lg bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                {stat.change}
                <ArrowUpRight className="h-3 w-3" />
              </span>
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
              <p className="mt-1 text-sm text-text-secondary">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="glass-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          <button className="text-sm text-primary transition-colors hover:text-primary-hover">
            View all
          </button>
        </div>
        <div className="space-y-1">
          {RECENT_ACTIVITY.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl px-4 py-3 transition-all duration-200 hover:bg-white/5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
                  <Clock className="h-4 w-4 text-text-muted" />
                </div>
                <span className="text-sm text-text-primary">{item.action}</span>
              </div>
              <span className="shrink-0 text-xs text-text-muted">
                {item.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
