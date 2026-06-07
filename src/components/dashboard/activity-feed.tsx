import { Clock } from "lucide-react";

interface ActivityItem {
  action: string;
  time: string;
  type: "assessment" | "analysis" | "document" | "review" | "score";
}

interface ActivityFeedProps {
  activities: readonly ActivityItem[] | ActivityItem[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <div className="glass-card p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Atividades Recentes</h2>
        <button className="text-sm text-primary transition-colors hover:text-primary-hover">
          Ver todas
        </button>
      </div>
      <div className="space-y-1">
        {activities.map((item, i) => (
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
  );
}
