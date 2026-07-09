import {
  Clock,
  ClipboardCheck,
  Search,
  FileText,
  Eye,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";

interface ActivityItem {
  action: string;
  time: string;
  type: "assessment" | "analysis" | "document" | "review" | "score";
}

interface ActivityFeedProps {
  activities: readonly ActivityItem[] | ActivityItem[];
}

const ICON_MAP = {
  assessment: { icon: ClipboardCheck, color: "text-amber-400", bgColor: "bg-amber-400/10" },
  analysis: { icon: Search, color: "text-primary", bgColor: "bg-primary/10" },
  document: { icon: FileText, color: "text-emerald-400", bgColor: "bg-emerald-400/10" },
  review: { icon: Eye, color: "text-indigo-400", bgColor: "bg-indigo-400/10" },
  score: { icon: ShieldCheck, color: "text-purple-400", bgColor: "bg-purple-400/10" },
} as const;

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <div className="glass-card p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Recent Activity</h2>
        <Link href="/compliance" className="text-sm text-primary transition-colors hover:text-primary-hover">
          View all
        </Link>
      </div>
      <div className="space-y-1">
        {(activities || []).map((item, i) => {
          const config = ICON_MAP[item.type] ?? { icon: Clock, color: "text-slate-400", bgColor: "bg-white/5" };
          const Icon = config.icon;
          return (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl px-4 py-3 transition-all duration-200 hover:bg-white/5"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${config.bgColor}`}>
                  <Icon className={`h-4 w-4 ${config.color}`} />
                </div>
                <span className="text-sm text-text-primary">{item.action}</span>
              </div>
              <span className="shrink-0 text-xs text-text-muted">
                {item.time}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
