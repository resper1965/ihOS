"use client";

import { useState } from "react";
import {
  Settings,
  User,
  Bell,
  Moon,
  ShieldCheck,
  Plug,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { signOut } from "@/lib/supabase/auth-actions";
import { Badge } from "@/components/ui/badge";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getRoleLabel(role: string | undefined | null): string {
  switch (role) {
    case "admin":
      return "Administrador";
    case "ionic_user":
      return "Usuário Ionic";
    case "client_user":
      return "Usuário Cliente";
    default:
      return "Usuário";
  }
}

function getInitials(email: string | undefined | null): string {
  if (!email) return "??";
  return email.split("@")[0].slice(0, 2).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle Switch
// ─────────────────────────────────────────────────────────────────────────────

function ToggleSwitch({
  label,
  description,
  icon: Icon,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
          <Icon className="h-4 w-4 text-slate-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">{label}</p>
          {description && (
            <p className="text-xs text-text-muted">{description}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full
          transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]
          ${checked ? "bg-blue-500" : "bg-white/10"}
          ${disabled ? "cursor-not-allowed opacity-50" : ""}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm
            transition-transform duration-200
            ${checked ? "translate-x-6" : "translate-x-1"}
          `}
        />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Integration Row
// ─────────────────────────────────────────────────────────────────────────────

function IntegrationRow({
  name,
  status,
  icon: Icon,
}: {
  name: string;
  status: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
          <Icon className="h-4 w-4 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-text-primary">{name}</p>
      </div>
      <Badge variant="success" dot>
        {status}
      </Badge>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Page
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, profile, isLoading } = useUser();

  // Visual-only toggle states
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [darkMode] = useState(true);
  const [complianceAlerts, setComplianceAlerts] = useState(true);

  const email = user?.email ?? "—";
  const initials = getInitials(user?.email);
  const roleLabel = getRoleLabel(profile?.role);

  return (
    <div className="w-full space-y-8">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-emerald-500/20">
            <Settings className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              <span className="gradient-text">Configurações</span>
            </h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Gerencie suas preferências, perfil e integrações.
            </p>
          </div>
        </div>
      </div>

      {/* Profile Section */}
      <section className="glass-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <User className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-text-primary">Perfil</h2>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 animate-pulse rounded-full bg-white/10" />
            <div className="space-y-2">
              <div className="h-4 w-48 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 text-lg font-bold text-white shadow-lg shadow-blue-500/20">
                {initials}
              </div>
              <div>
                <p className="text-base font-medium text-text-primary">
                  {email}
                </p>
                <p className="text-sm text-text-muted">{roleLabel}</p>
              </div>
            </div>

            <button
              onClick={() => signOut()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Sair da conta
            </button>
          </div>
        )}
      </section>

      {/* Preferences Section */}
      <section className="glass-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-text-primary">
            Preferências
          </h2>
        </div>

        <div className="divide-y divide-white/5">
          <ToggleSwitch
            label="Notificações por email"
            description="Receba alertas e atualizações no seu e-mail"
            icon={Bell}
            checked={emailNotifications}
            onChange={setEmailNotifications}
          />
          <ToggleSwitch
            label="Modo escuro"
            description="Tema escuro ativado por padrão"
            icon={Moon}
            checked={darkMode}
            disabled
            onChange={() => {}}
          />
          <ToggleSwitch
            label="Alertas de compliance"
            description="Notificações sobre mudanças em scores e gaps"
            icon={ShieldCheck}
            checked={complianceAlerts}
            onChange={setComplianceAlerts}
          />
        </div>
      </section>

      {/* Integrations Section */}
      <section className="glass-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Plug className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-text-primary">
            Integrações
          </h2>
        </div>

        <div className="divide-y divide-white/5">
          <IntegrationRow
            name="Supabase"
            status="Conectado"
            icon={ExternalLink}
          />
          <IntegrationRow
            name="Standard GRC API"
            status="Conectado"
            icon={ExternalLink}
          />
          <IntegrationRow
            name="OpenAI"
            status="Configurado"
            icon={ExternalLink}
          />
        </div>
      </section>

      {/* Danger Zone */}
      <section className="glass-card border-red-500/30 p-6">
        <div className="mb-4 flex items-center gap-2">
          <LogOut className="h-5 w-5 text-red-400" />
          <h2 className="text-lg font-semibold text-red-400">Zona de Perigo</h2>
        </div>
        <p className="mb-4 text-sm text-text-muted">
          Ações irreversíveis. Tenha cuidado ao prosseguir.
        </p>
        <button
          onClick={() => signOut()}
          className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition-all hover:bg-red-500/20 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          Sair da Conta
        </button>
      </section>
    </div>
  );
}
