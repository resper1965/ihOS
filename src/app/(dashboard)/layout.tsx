"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { signOut } from "@/lib/supabase/auth-actions";
import { NotificationsDropdown } from "@/components/dashboard/notifications-dropdown";
import { VersionProvider } from "@/lib/context/version-context";
import { VersionSwitcher } from "@/components/dashboard/version-switcher";
import { PageTitleProvider, useCurrentPageMeta } from "@/lib/context/page-title-context";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Compliance", href: "/compliance", icon: ShieldCheck },
  { label: "Mapeamento GRC", href: "/compliance/mappings", icon: Database },
  { label: "Chat", href: "/chat", icon: MessageSquare },
  { label: "Metas", href: "/goals", icon: Target },
  { label: "Avaliações", href: "/assessments", icon: ClipboardCheck },
  { label: "Documentos", href: "/documents", icon: FileText },
  { label: "Relatórios", href: "/reports", icon: BarChart3 },
] as const;

function getRoleLabel(role: string | undefined | null): string {
  switch (role) {
    case "admin": return "Administrador";
    case "ionic_user": return "Usuário Ionic";
    case "client_user": return "Usuário Cliente";
    default: return "Usuário";
  }
}

function getInitials(email: string | undefined | null): string {
  if (!email) return "??";
  return email.split("@")[0].slice(0, 2).toUpperCase();
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const pathname = usePathname();

  return (
    <VersionProvider>
      <PageTitleProvider>
      <div className="flex h-screen overflow-hidden bg-[#0f172a]">
        {/* Sidebar */}
        <aside className={`glass-surface relative flex flex-col transition-all duration-300 ease-in-out ${sidebarOpen ? "w-64" : "w-20"}`}>
          <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 shadow-lg shadow-blue-500/20">
              <span className="text-sm font-bold text-white">iH</span>
            </div>
            {sidebarOpen && <span className="gradient-text text-lg font-bold tracking-tight">ihOS</span>}
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    isActive ? "bg-blue-500/10 text-blue-400 shadow-sm shadow-blue-500/5" : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}>
                  <item.icon className={`h-5 w-5 shrink-0 ${isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-400"}`} />
                  {sidebarOpen && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-1 border-t border-white/10 p-3">
            <Link href="/settings"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition-all">
              <Settings className="h-5 w-5 shrink-0 text-slate-500" />
              {sidebarOpen && <span>Configurações</span>}
            </Link>
            <button onClick={() => signOut()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all">
              <LogOut className="h-5 w-5 shrink-0 text-slate-500" />
              {sidebarOpen && <span>Sair</span>}
            </button>
          </div>

          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#1e293b] text-slate-400 shadow-md hover:text-white transition-all"
            aria-label={sidebarOpen ? "Recolher menu" : "Expandir menu"}>
            <ChevronLeft className={`h-3.5 w-3.5 transition-transform duration-300 ${sidebarOpen ? "" : "rotate-180"}`} />
          </button>
        </aside>

        {/* Main */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <HeaderWithTitle onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
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

  const displayName = user?.email?.split("@")[0] ?? "Usuário";
  const initials = user?.email ? user.email.split("@")[0].slice(0, 2).toUpperCase() : "??";
  const roleLabel = (() => {
    switch (profile?.role) {
      case "admin": return "Administrador";
      case "ionic_user": return "Usuário Ionic";
      case "client_user": return "Usuário Cliente";
      default: return "Usuário";
    }
  })();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#0f172a]/80 px-6 backdrop-blur-md">
      {/* Left — page title */}
      <div className="flex items-center gap-4">
        <button onClick={onMenuClick} className="text-slate-400 hover:text-white lg:hidden">
          <Menu className="h-5 w-5" />
        </button>

        {meta ? (
          <div className="flex items-center gap-3">
            {meta.icon && (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-emerald-500/20">
                {meta.icon}
              </div>
            )}
            <div>
              <h1 className="text-sm font-semibold leading-none text-white">
                {meta.title}
              </h1>
              {meta.subtitle && (
                <p className="mt-0.5 text-xs text-slate-400">{meta.subtitle}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="h-4 w-40 animate-pulse rounded bg-white/5" />
        )}
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-3">
        <VersionSwitcher />
        <div className="h-6 w-px bg-white/10" />
        <NotificationsDropdown />
        <div className="h-6 w-px bg-white/10" />

        <div className="relative">
          <button onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/5 transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 text-xs font-bold text-white">
              {isLoading ? "…" : initials}
            </div>
            <div className="hidden text-left sm:block">
              {isLoading ? (
                <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
              ) : (
                <>
                  <p className="text-sm font-medium text-white">{displayName}</p>
                  <p className="text-xs text-slate-400">{roleLabel}</p>
                </>
              )}
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#1e293b]/95 shadow-xl backdrop-blur-xl">
              <div className="border-b border-white/10 px-4 py-3">
                <p className="text-sm font-medium text-white">{user?.email ?? "—"}</p>
                <p className="text-xs text-slate-400">{roleLabel}</p>
              </div>
              <div className="p-1">
                <Link href="/settings" onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors">
                  <Settings className="h-4 w-4" /> Configurações
                </Link>
                <button onClick={() => { setShowUserMenu(false); signOut(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-red-500/10 hover:text-red-400 transition-colors">
                  <LogOut className="h-4 w-4" /> Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
