"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Target,
  ClipboardCheck,
  FileText,
  BarChart3,
  ShieldCheck,
  ChevronLeft,
  Menu,
  Settings,
  LogOut,
  Database,
  Users,
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { signOut } from "@/lib/supabase/auth-actions";
import { NotificationsDropdown } from "@/components/dashboard/notifications-dropdown";
import { VersionProvider } from "@/lib/context/version-context";
import { VersionSwitcher } from "@/components/dashboard/version-switcher";
import { PageTitleProvider, useCurrentPageMeta } from "@/lib/context/page-title-context";
import { HelpProvider, useHelp } from "@/lib/context/help-context";
import { HelpSidebar } from "@/components/dashboard/help-sidebar";
import { HelpCircle } from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Compliance", href: "/compliance", icon: ShieldCheck },
  { label: "SCRMS (MSR)", href: "/compliance/scrms", icon: Target },
  { label: "GRC Mapping", href: "/compliance/mappings", icon: Database },
  { label: "Chat", href: "/chat", icon: MessageSquare },
  { label: "Assessments", href: "/assessments", icon: ClipboardCheck },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Reports", href: "/reports", icon: BarChart3 },
] as const;

function getRoleLabel(role: string | undefined | null): string {
  switch (role) {
    case "admin": return "Administrator";
    case "ionic_user": return "Ionic User";
    case "client_user": return "Client User";
    default: return "User";
  }
}

function getInitials(email: string | undefined | null): string {
  if (!email) return "??";
  return email.split("@")[0].slice(0, 2).toUpperCase();
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { profile, isLoading } = useUser();

  useEffect(() => {
    if (!isLoading && profile && profile.status === "pending") {
      router.replace("/pending-approval");
    }
  }, [profile, isLoading, router]);

  if (profile?.status === "pending") {
    return null; // Prevents flashing the dashboard
  }

  return (
    <VersionProvider>
      <PageTitleProvider>
        <HelpProvider>
          <div className="flex h-screen overflow-hidden bg-bg-dark relative">
            {/* Ambient background glow orbs */}
            <div className="pointer-events-none absolute -left-20 -top-20 h-[350px] w-[350px] rounded-full bg-primary/5 blur-[100px] dark:bg-primary/[0.03]" />
            <div className="pointer-events-none absolute left-[40%] top-[30%] h-[400px] w-[400px] rounded-full bg-accent/5 blur-[120px] dark:bg-accent/[0.03]" />
            <div className="pointer-events-none absolute -bottom-20 -right-20 h-[350px] w-[350px] rounded-full bg-primary/5 blur-[100px] dark:bg-primary/[0.03]" />

            {/* Sidebar */}
            <aside className={`glass-surface relative z-10 flex flex-col transition-all duration-300 ease-in-out ${sidebarOpen ? "w-64" : "w-20"}`}>
          <div className="flex h-16 items-center gap-3 border-b border-border-glass px-5">
            {sidebarOpen ? (
              <>
                <img src="/ionic-health-logo-dark.png" alt="Ionic Health" className="h-8 w-auto dark:hidden" />
                <img src="/ionic-health-logo.png" alt="Ionic Health" className="h-8 w-auto hidden dark:block" />
              </>
            ) : (
              <img src="/ionic-icon.png" alt="Ionic Health" className="h-9 w-9 shrink-0" />
            )}
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {NAV_ITEMS.map((item) => {
              const isExact = pathname === item.href;
              const isPrefix = item.href !== "/" && pathname.startsWith(item.href);
              const hasMoreSpecificMatch = NAV_ITEMS.some(
                (other) =>
                  other.href !== item.href &&
                  other.href !== "/" &&
                  pathname.startsWith(other.href) &&
                  other.href.length > item.href.length
              );
              const isActive = (isExact || isPrefix) && !hasMoreSpecificMatch;
              return (
                <Link key={item.href} href={item.href}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 border ${
                    isActive 
                      ? "bg-primary/10 text-primary border-primary/20 shadow-sm shadow-primary/5 font-semibold" 
                      : "border-transparent text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 hover:text-text-primary"
                  }`}>
                  <item.icon className={`h-5 w-5 shrink-0 stroke-[1.5] ${isActive ? "text-primary" : "text-text-muted group-hover:text-text-secondary"}`} />
                  {sidebarOpen && <span>{item.label}</span>}
                </Link>
              );
            })}
            
            {profile?.role === "admin" && (
                <Link href="/admin/users"
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    pathname.startsWith("/admin/users") ? "bg-primary/10 text-primary shadow-sm shadow-primary/5" : "text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 hover:text-text-primary"
                  }`}>
                  <Users className={`h-5 w-5 shrink-0 stroke-[1.5] ${pathname.startsWith("/admin/users") ? "text-primary" : "text-text-muted group-hover:text-text-secondary"}`} />
                  {sidebarOpen && <span>User Management</span>}
                </Link>
            )}
          </nav>

          <div className="space-y-1 border-t border-border-glass p-3">
            <Link href="/settings"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 hover:text-text-primary transition-all">
              <Settings className="h-5 w-5 shrink-0 stroke-[1.5] text-text-muted" />
              {sidebarOpen && <span>Settings</span>}
            </Link>
            <button onClick={() => signOut()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-text-secondary hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 transition-all">
              <LogOut className="h-5 w-5 shrink-0 stroke-[1.5] text-text-muted" />
              {sidebarOpen && <span>Sign Out</span>}
            </button>
          </div>

          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-border-glass bg-bg-card text-text-secondary shadow-md hover:text-text-primary transition-all"
            aria-label={sidebarOpen ? "Collapse menu" : "Expand menu"}>
            <ChevronLeft className={`h-3.5 w-3.5 stroke-[1.5] transition-transform duration-300 ${sidebarOpen ? "" : "rotate-180"}`} />
          </button>
        </aside>

        {/* Main */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <HeaderWithTitle onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
      <HelpSidebar />
      </HelpProvider>
      </PageTitleProvider>
    </VersionProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header sub-component — reads page meta from context
// ─────────────────────────────────────────────────────────────────────────────

function HeaderWithTitle({ onMenuClick }: { onMenuClick: () => void }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, profile, isLoading } = useUser();
  const meta = useCurrentPageMeta();

  const displayName = user?.email?.split("@")[0] ?? "User";
  const initials = user?.email ? user.email.split("@")[0].slice(0, 2).toUpperCase() : "??";
  const roleLabel = (() => {
    switch (profile?.role) {
      case "admin": return "Administrator";
      case "ionic_user": return "Ionic User";
      case "client_user": return "Client User";
      default: return "User";
    }
  })();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border-glass bg-bg-dark/80 px-6 backdrop-blur-md">
      {/* Left — page title */}
      <div className="flex items-center gap-4">
        <button onClick={onMenuClick} className="text-text-secondary hover:text-text-primary lg:hidden">
          <Menu className="h-5 w-5 stroke-[1.5]" />
        </button>

        {meta ? (
          <div className="flex items-center gap-3">
            {meta.icon && (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/20">
                {meta.icon}
              </div>
            )}
            <div>
              <h1 className="text-sm font-semibold leading-none text-text-primary">
                {meta.title}
              </h1>
              {meta.subtitle && (
                <p className="mt-0.5 text-xs text-text-muted">{meta.subtitle}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="h-4 w-40 animate-pulse rounded bg-black/5 dark:bg-white/5" />
        )}
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-3">
        <VersionSwitcher />
        <div className="h-6 w-px bg-border-glass" />
        <NotificationsDropdown />
        <div className="h-6 w-px bg-border-glass" />
        <HelpTrigger />
        <div className="h-6 w-px bg-border-glass" />

        <div className="relative">
          <button onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-xs font-bold text-white">
              {isLoading ? "…" : initials}
            </div>
            <div className="hidden text-left sm:block">
              {isLoading ? (
                <div className="h-4 w-24 animate-pulse rounded bg-black/5 dark:bg-white/10" />
              ) : (
                <>
                  <p className="text-sm font-medium text-text-primary">{displayName}</p>
                  <p className="text-xs text-text-muted">{roleLabel}</p>
                </>
              )}
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border-glass bg-bg-card/95 shadow-xl backdrop-blur-xl">
              <div className="border-b border-border-glass px-4 py-3">
                <p className="text-sm font-medium text-text-primary">{user?.email ?? "—"}</p>
                <p className="text-xs text-text-muted">{roleLabel}</p>
              </div>
              <div className="p-1">
                <Link href="/settings" onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 hover:text-text-primary transition-colors">
                  <Settings className="h-4 w-4 stroke-[1.5]" /> Settings
                </Link>
                <button onClick={() => { setShowUserMenu(false); signOut(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                  <LogOut className="h-4 w-4 stroke-[1.5]" /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function HelpTrigger() {
  const { toggleHelp } = useHelp();
  return (
    <button
      onClick={toggleHelp}
      className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/5 dark:bg-white/5 text-text-secondary hover:bg-black/10 dark:hover:bg-white/10 hover:text-text-primary transition-colors"
      aria-label="Abrir Ajuda"
      title="Central de Ajuda"
    >
      <HelpCircle className="h-4.5 w-4.5 stroke-[1.5]" />
    </button>
  );
}
