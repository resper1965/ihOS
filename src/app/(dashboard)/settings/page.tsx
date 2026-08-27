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
  Layers,
  Loader2,
  Link2,
} from "lucide-react";
import Link from "next/link";
import { useUser } from "@/hooks/use-user";
import { usePreferences } from "@/hooks/use-preferences";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { signOut } from "@/lib/supabase/auth-actions";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import {
  useStandardApiHealth,
  useSetStandardApiKey,
  type StandardApiHealth,
} from "@/hooks/queries/use-standard-api-health";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getRoleLabel(role: string | undefined | null): string {
  switch (role) {
    case "admin":
      return "Administrator";
    case "ionic_user":
      return "Ionic User";
    case "client_user":
      return "Client User";
    default:
      return "User";
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
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full
          transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]
          ${checked ? "bg-primary" : "bg-white/10"}
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
  variant = "success",
  detail,
  keyPrefix,
}: {
  name: string;
  status: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Badge color. Defaults to "success" so existing callers (Supabase, OpenAI) render unchanged. */
  variant?: BadgeVariant;
  /** Optional reason shown under the badge — e.g. why a probe reports red/amber. */
  detail?: string | null;
  /** Optional key prefix shown under the integration name. Never the full key. */
  keyPrefix?: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
          <Icon className="h-4 w-4 text-slate-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">{name}</p>
          {keyPrefix && (
            <p className="font-mono text-xs text-text-muted">Key: {keyPrefix}…</p>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Badge variant={variant} dot>
          {status}
        </Badge>
        {detail && (
          <p className="max-w-[16rem] text-right text-xs text-text-muted">{detail}</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard API Key Field — admin/ionic_user only. Never displays an existing
// key, not even masked with its length visible; the field starts empty and
// only the prefix from the health probe (shown in IntegrationRow above) is
// ever rendered.
// ─────────────────────────────────────────────────────────────────────────────

function sourceLabel(keySource: StandardApiHealth["keySource"] | undefined): string {
  switch (keySource) {
    case "env":
      return "In use: environment variable (a key saved here will not take effect)";
    case "vault":
      return "In use: saved key";
    default:
      return "In use: none — no key configured";
  }
}

function StandardApiKeyField({
  keySource,
}: {
  keySource: StandardApiHealth["keySource"] | undefined;
}) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shadowedByEnv, setShadowedByEnv] = useState<boolean | null>(null);
  const { mutate, isPending } = useSetStandardApiKey();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setShadowedByEnv(null);
    mutate(key, {
      onSuccess: (res) => {
        setShadowedByEnv(res.shadowedByEnv);
        setKey(""); // never leave the submitted value sitting in the field
      },
      onError: (err) => setError(err.message),
    });
  }

  return (
    <div className="mt-4 border-t border-white/5 pt-4">
      <p className="mb-1 text-xs font-medium text-text-primary">Standard GRC API Key</p>
      <p className="mb-3 text-xs text-text-muted">{sourceLabel(keySource)}</p>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="standard_live_… or standard_test_…"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          type="submit"
          disabled={isPending || key.length === 0}
          className="shrink-0 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-all hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {shadowedByEnv === true && (
        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Saved — but the STANDARD_GRC_API_KEY environment variable still takes precedence, so
          this key has no effect. To use it, change or remove that environment variable in
          Vercel.
        </p>
      )}
      {shadowedByEnv === false && (
        <p className="mt-2 text-xs text-emerald-400">Saved and now in use.</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Page
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, profile, isLoading } = useUser();
  const { prefs, setPref, isSaving } = usePreferences();
  const { data: standardApiHealth, isLoading: isStandardApiHealthLoading } =
    useStandardApiHealth();

  const email = user?.email ?? "—";
  const initials = getInitials(user?.email);
  const roleLabel = getRoleLabel(profile?.role);
  const isAdmin = profile?.role === "admin" || profile?.role === "ionic_user";

  // Real probe result, not a hardcoded string — see
  // src/app/api/settings/integrations/standard-api/route.ts.
  const standardApiRow: {
    status: string;
    variant: BadgeVariant;
    detail?: string | null;
    keyPrefix?: string | null;
  } = (() => {
    if (isStandardApiHealthLoading || !standardApiHealth) {
      return { status: "Checking…", variant: "neutral" };
    }
    const { keyConfigured, reachable, scopesMissing, keyPrefix, detail } = standardApiHealth;

    if (!keyConfigured || !reachable) {
      return {
        status: keyConfigured ? "Unreachable" : "Not configured",
        variant: "danger",
        detail,
        keyPrefix,
      };
    }
    if (scopesMissing && scopesMissing.length > 0) {
      return {
        status: `Missing scopes: ${scopesMissing.join(", ")}`,
        variant: "warning",
        keyPrefix,
      };
    }
    return { status: "Connected", variant: "success", keyPrefix };
  })();

  return (
    <div className="w-full space-y-8">
      <PageTitleRegistrar
        title="Settings"
        subtitle="Manage preferences and integrations for the platform."
        icon={<Settings className="h-4 w-4 text-slate-400" />}
      />

      {/* Profile Section */}
      <section className="glass-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-text-primary">Profile</h2>
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
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-lg font-bold text-white shadow-lg shadow-primary/20">
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
              Sign Out
            </button>
          </div>
        )}
      </section>

      {/* Preferences Section */}
      <section className="glass-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-text-primary">Preferences</h2>
          </div>
          {isSaving && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving...
            </span>
          )}
        </div>

        <div className="divide-y divide-white/5">
          <ToggleSwitch
            label="Email Notifications"
            description="Receive alerts and updates in your email"
            icon={Bell}
            checked={prefs.emailNotifications}
            onChange={(v) => setPref("emailNotifications", v)}
          />
          <ToggleSwitch
            label="Dark Mode"
            description="Dark theme enabled by default"
            icon={Moon}
            checked={prefs.darkMode}
            onChange={(v) => setPref("darkMode", v)}
          />
          <ToggleSwitch
            label="Compliance Alerts"
            description="Notifications about changes in scores and gaps"
            icon={ShieldCheck}
            checked={prefs.complianceAlerts}
            onChange={(v) => setPref("complianceAlerts", v)}
          />
        </div>
      </section>

      {/* Version Management — admin/ionic_user only */}
      {isAdmin && (
        <section className="glass-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-text-primary">Version Management</h2>
          </div>
          <p className="mb-4 text-sm text-text-muted">
            Create, activate, and manage versions of nCommand Lite for technical scope control.
          </p>
          <Link
            href="/settings/versions"
            className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/20 hover:text-primary"
          >
            <Link2 className="h-4 w-4" />
            Manage Versions
          </Link>
        </section>
      )}

      {/* Integrations Section */}
      <section className="glass-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Plug className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-text-primary">
            Integrations
          </h2>
        </div>

        <div className="divide-y divide-white/5">
          <IntegrationRow
            name="Supabase"
            status="Connected"
            icon={ExternalLink}
          />
          <IntegrationRow
            name="Standard GRC API"
            status={standardApiRow.status}
            variant={standardApiRow.variant}
            detail={standardApiRow.detail}
            keyPrefix={standardApiRow.keyPrefix}
            icon={ExternalLink}
          />
          <IntegrationRow
            name="OpenAI"
            status="Configured"
            icon={ExternalLink}
          />
        </div>

        {isAdmin && (
          <StandardApiKeyField keySource={standardApiHealth?.keySource} />
        )}
      </section>

      {/* Danger Zone */}
      <section className="glass-card border-red-500/30 p-6">
        <div className="mb-4 flex items-center gap-2">
          <LogOut className="h-5 w-5 text-red-400" />
          <h2 className="text-lg font-semibold text-red-400">Danger Zone</h2>
        </div>
        <p className="mb-4 text-sm text-text-muted">
          Irreversible actions. Please proceed with caution.
        </p>
        <button
          onClick={() => signOut()}
          className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition-all hover:bg-red-500/20 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </section>
    </div>
  );
}
