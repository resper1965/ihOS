"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Layers,
  Plus,
  Check,
  ChevronDown,
  Loader2,
  AlertTriangle,
  X,
} from "lucide-react";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { Badge } from "@/components/ui/badge";
import type { ProductVersion, ProductVersionUpdate } from "@/lib/supabase/types";

// ─────────────────────────────────────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProductVersion["status"] }) {
  switch (status) {
    case "active":
      return <Badge variant="success" dot>Ativa</Badge>;
    case "supported":
      return <Badge variant="info" dot>Suportada</Badge>;
    case "deprecated":
      return <Badge variant="danger" dot>Depreciada</Badge>;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// New Version Form
// ─────────────────────────────────────────────────────────────────────────────

function NewVersionForm({
  onCreated,
  onCancel,
}: {
  onCreated: (v: ProductVersion) => void;
  onCancel: () => void;
}) {
  const [productName, setProductName] = useState("nCommand Lite");
  const [versionCode, setVersionCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!versionCode.trim()) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_name: productName, version_code: versionCode }),
      });

      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        const msg = ct.includes("json") ? (await res.json()).error : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const data = await res.json();
      onCreated(data.version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar versão");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-5"
    >
      <h3 className="mb-4 text-sm font-semibold text-primary">Nova Versão</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs text-text-muted">Produto</label>
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/40 focus:outline-none"
            placeholder="nCommand Lite"
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-text-muted">Código da Versão</label>
          <input
            value={versionCode}
            onChange={(e) => setVersionCode(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/40 focus:outline-none"
            placeholder="v2.3.0"
            required
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-2 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting || !versionCode.trim()}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary transition-colors disabled:opacity-50"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Criar Versão
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          <X className="h-4 w-4" />
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Version Row
// ─────────────────────────────────────────────────────────────────────────────

function VersionRow({
  version,
  onUpdate,
}: {
  version: ProductVersion;
  onUpdate: (updated: ProductVersion) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const patch = useCallback(
    async (payload: { status: ProductVersion["status"] }) => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/versions/${version.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          onUpdate(data.version);
        }
      } finally {
        setIsLoading(false);
        setShowActions(false);
      }
    },
    [version.id, onUpdate]
  );

  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-white/5 last:border-0">
      {/* Info */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Layers className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">
            {version.product_name}{" "}
            <span className="font-mono text-primary">{version.version_code}</span>
          </p>
          <p className="text-xs text-text-muted">
            Criada em{" "}
            {version.created_at
              ? new Date(version.created_at).toLocaleDateString("pt-BR")
              : "—"}
          </p>
        </div>
      </div>

      {/* Status + Actions */}
      <div className="flex items-center gap-3">
        <StatusBadge status={version.status} />

        <div className="relative">
          <button
            onClick={() => setShowActions((s) => !s)}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-text-secondary hover:bg-white/10 transition-all"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>Ações <ChevronDown className="h-3 w-3" /></>
            )}
          </button>

          {showActions && (
            <div className="absolute right-0 top-8 z-20 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#1e293b] shadow-2xl shadow-black/40">
              {version.status !== "active" && (
                <button
                  onClick={() => patch({ status: "active" })}
                  className="w-full px-4 py-2.5 text-left text-xs text-emerald-400 hover:bg-white/5 transition-colors"
                >
                  ✅ Marcar como Ativa
                </button>
              )}
              {version.status !== "supported" && (
                <button
                  onClick={() => patch({ status: "supported" })}
                  className="w-full px-4 py-2.5 text-left text-xs text-primary hover:bg-white/5 transition-colors"
                >
                  🔵 Marcar como Suportada
                </button>
              )}
              {version.status !== "deprecated" && (
                <button
                  onClick={() => patch({ status: "deprecated" })}
                  className="w-full px-4 py-2.5 text-left text-xs text-red-400 hover:bg-white/5 transition-colors"
                >
                  🗑️ Deprecar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function VersionsPage() {
  const [versions, setVersions] = useState<ProductVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/versions");
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions);
      }
    } catch {
      setError("Falha ao carregar versões");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchVersions(); }, [fetchVersions]);

  const handleCreated = (v: ProductVersion) => {
    setVersions((prev) => [v, ...prev]);
    setShowForm(false);
  };

  const handleUpdate = (updated: ProductVersion) => {
    setVersions((prev) => {
      // If version was set to active, demote previous active ones
      if (updated.status === "active") {
        return prev.map((v) =>
          v.id === updated.id ? updated : v.status === "active" ? { ...v, status: "supported" as const } : v
        );
      }
      return prev.map((v) => (v.id === updated.id ? updated : v));
    });
  };

  const activeVersion = versions.find((v) => v.status === "active");

  return (
    <div className="w-full space-y-8">
      <PageTitleRegistrar
        title="Gestão de Versões"
        subtitle="Controle de escopo técnico do nCommand Lite"
        icon={<Layers className="h-4 w-4 text-primary" />}
      />

      {/* Active version highlight */}
      {activeVersion && (
        <div className="glass-card flex items-center gap-4 p-5 border-emerald-500/20">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
            <Check className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-text-muted">Versão Ativa no ihOS</p>
            <p className="text-lg font-bold text-white">
              {activeVersion.product_name}{" "}
              <span className="font-mono text-emerald-400">{activeVersion.version_code}</span>
            </p>
          </div>
        </div>
      )}

      {/* Versions list */}
      <section className="glass-card p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Todas as Versões</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {versions.length} versão{versions.length !== 1 ? "ões" : ""} cadastrada{versions.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-primary/20 hover:brightness-110 transition-all"
          >
            <Plus className="h-4 w-4" />
            Nova Versão
          </button>
        </div>

        {showForm && (
          <NewVersionForm onCreated={handleCreated} onCancel={() => setShowForm(false)} />
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
          </div>
        ) : versions.length === 0 ? (
          <div className="py-12 text-center text-text-muted text-sm">
            Nenhuma versão cadastrada ainda.
          </div>
        ) : (
          <div>
            {versions.map((v) => (
              <VersionRow key={v.id} version={v} onUpdate={handleUpdate} />
            ))}
          </div>
        )}
      </section>

      {/* Legend */}
      <section className="glass-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Legenda de Status</h3>
        <div className="grid gap-2 sm:grid-cols-3 text-sm text-text-muted">
          <div className="flex items-center gap-2">
            <Badge variant="success" dot>Ativa</Badge>
            <span className="text-xs">Versão em uso no sistema</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="info" dot>Suportada</Badge>
            <span className="text-xs">Mantida mas não selecionada</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="danger" dot>Depreciada</Badge>
            <span className="text-xs">Fora de suporte</span>
          </div>
        </div>
      </section>
    </div>
  );
}
