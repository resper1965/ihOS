"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  ClipboardCheck,
  FileText,
  BarChart3,
  ChevronLeft,
  Bell,
  Menu,
  Search,
  Settings,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Chat", href: "/chat", icon: MessageSquare },
  { label: "Assessments", href: "/assessments", icon: ClipboardCheck },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Reports", href: "/reports", icon: BarChart3 },
] as const;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden bg-bg-dark">
      {/* ─── Sidebar ─── */}
      <aside
        className={`glass-surface relative flex flex-col transition-all duration-300 ease-in-out ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-border-glass px-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20">
            <span className="text-sm font-bold text-white">iH</span>
          </div>
          {sidebarOpen && (
            <span className="gradient-text text-lg font-bold tracking-tight">
              ihOS
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-primary/10 text-primary shadow-sm shadow-primary/5"
                    : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                }`}
              >
                <item.icon
                  className={`h-5 w-5 shrink-0 transition-colors ${
                    isActive
                      ? "text-primary"
                      : "text-text-muted group-hover:text-text-secondary"
                  }`}
                />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border-glass p-3">
          <Link
            href="/settings"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-text-secondary transition-all duration-200 hover:bg-white/5 hover:text-text-primary"
          >
            <Settings className="h-5 w-5 shrink-0 text-text-muted" />
            {sidebarOpen && <span>Settings</span>}
          </Link>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-border-glass bg-bg-card text-text-muted shadow-md transition-all duration-200 hover:border-border-glass-hover hover:text-text-primary"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <ChevronLeft
            className={`h-3.5 w-3.5 transition-transform duration-300 ${
              sidebarOpen ? "" : "rotate-180"
            }`}
          />
        </button>
      </aside>

      {/* ─── Main Area ─── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border-glass bg-bg-dark/80 px-6 backdrop-blur-md">
          {/* Left: mobile menu + search */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-text-muted transition-colors hover:text-text-primary lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Buscar frameworks, documentos…"
                className="w-72 rounded-xl border border-border-glass bg-white/5 py-2 pl-10 pr-4 text-sm text-text-primary outline-none transition-all duration-200 placeholder:text-text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Right: notifications + avatar */}
          <div className="flex items-center gap-3">
            <button className="relative rounded-xl p-2 text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />
            </button>
            <div className="h-6 w-px bg-border-glass" />
            <button className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-xs font-bold text-white">
                IH
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium text-text-primary">
                  Ionic User
                </p>
                <p className="text-xs text-text-muted">Admin</p>
              </div>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
