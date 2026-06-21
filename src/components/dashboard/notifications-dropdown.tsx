"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Check, CheckCheck, AlertTriangle, TrendingUp, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AgentNotification } from "@/lib/supabase/types";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function relativeTime(isoDate: string | null): string {
  if (!isoDate) return "";
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function notificationIcon(type: AgentNotification["type"]) {
  switch (type) {
    case "poam_expiry":
      return <AlertTriangle className="h-4 w-4 text-amber-400" />;
    case "score_change":
      return <TrendingUp className="h-4 w-4 text-emerald-400" />;
    case "task_deadline":
      return <Clock className="h-4 w-4 text-primary" />;
    default:
      return <Bell className="h-4 w-4 text-slate-400" />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function NotificationsDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("agent_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.warn("[notifications] fetch error:", error);
        return;
      }

      setNotifications(data ?? []);
      setUnreadCount((data ?? []).filter((n) => !n.read).length);
    } catch (err) {
      console.warn("[notifications] unexpected error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  // Initial load
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Set up realtime sync
  useRealtimeSync("agent_notifications", () => {
    fetchNotifications();
  });

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  // Mark single notification as read
  async function markAsRead(id: string) {
    try {
      await supabase
        .from("agent_notifications")
        .update({ read: true })
        .eq("id", id);

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.warn("[notifications] markAsRead error:", err);
    }
  }

  // Mark all as read
  async function markAllAsRead() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("agent_notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.warn("[notifications] markAllAsRead error:", err);
    }
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) fetchNotifications();
        }}
        className="relative rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-[#0f172a]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        {unreadCount === 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-white/10 bg-[#1e293b]/95 shadow-2xl backdrop-blur-xl sm:w-96">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-primary hover:bg-white/5 transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-1 p-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-3">
                    <div className="h-8 w-8 animate-shimmer rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-3/4 animate-shimmer rounded" />
                      <div className="h-3 w-1/3 animate-shimmer rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-10">
                <Bell className="mb-2 h-8 w-8 text-slate-600" />
                <p className="text-sm text-text-muted">No notifications</p>
              </div>
            ) : (
              <div className="p-1">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (!n.read) markAsRead(n.id);
                    }}
                    className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-white/5 ${
                      !n.read ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
                      {notificationIcon(n.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-tight ${!n.read ? "font-medium text-white" : "text-slate-300"}`}>
                        {n.title}
                      </p>
                      {n.content && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">
                          {n.content}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-text-muted">
                        {relativeTime(n.created_at)}
                      </p>
                    </div>
                    {!n.read && (
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
