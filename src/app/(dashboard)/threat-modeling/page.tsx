"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Search,
  Plus,
  Loader2,
  Filter,
  Shield,
} from "lucide-react";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { RiskSummaryCards } from "@/components/risk/risk-summary-cards";
import { RiskMatrix } from "@/components/risk/risk-matrix";
import { StrideRadar } from "@/components/risk/stride-radar";
import { ThreatModelCard } from "@/components/risk/threat-model-card";
import { GenerateThreatModelModal } from "@/components/risk/generate-threat-model-modal";
import { Button } from "@/components/ui/button";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import type {
  ThreatModelSummary,
  ThreatModelRecord,
  ThreatModelData,
  ThreatModelStatus,
  StrideThreat,
} from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Status filter tabs
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TABS: Array<{ label: string; value: ThreatModelStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Reviewed", value: "reviewed" },
  { label: "Approved", value: "approved" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="w-full space-y-8 animate-pulse">
      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-6">
            <div className="h-11 w-11 rounded-full bg-white/10" />
            <div className="mt-5 space-y-2">
              <div className="h-8 w-16 rounded bg-white/10" />
              <div className="h-3 w-24 rounded bg-white/5" />
            </div>
          </div>
        ))}
      </div>

      {/* Matrix + Radar skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="glass-card h-80 p-6">
          <div className="h-5 w-40 rounded bg-white/10" />
        </div>
        <div className="glass-card h-80 p-6">
          <div className="h-5 w-40 rounded bg-white/10" />
        </div>
      </div>

      {/* Cards skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card h-48 p-5">
            <div className="flex justify-between">
              <div className="h-5 w-32 rounded bg-white/10" />
              <div className="h-5 w-16 rounded-full bg-white/10" />
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-3 w-48 rounded bg-white/5" />
              <div className="h-3 w-40 rounded bg-white/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ThreatModelingPage() {
  const router = useRouter();
  const [models, setModels] = useState<ThreatModelSummary[]>([]);
  const [latestData, setLatestData] = useState<ThreatModelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ThreatModelStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);

  // ── Fetch list of models ──────────────────────────────────────────────────

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch("/api/threat-modeling");
      if (!res.ok) throw new Error("Failed to fetch threat models");
      const json = await res.json();
      setModels(json.models ?? []);

      // Fetch full data for the latest model (for matrix/radar)
      if (json.models && json.models.length > 0) {
        const latestId = json.models[0].id;
        const detailRes = await fetch(`/api/threat-modeling/${latestId}`);
        if (detailRes.ok) {
          const detailJson = await detailRes.json();
          setLatestData(detailJson.model?.data ?? null);
        }
      } else {
        setLatestData(null);
      }

      setError(null);
    } catch (err) {
      console.error("[ThreatModeling] Fetch error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Live updates
  useRealtimeSync("threat_models", () => {
    fetchModels();
  });

  // ── Derived data ──────────────────────────────────────────────────────────

  const latestThreats: StrideThreat[] = useMemo(
    () => latestData?.threat_model?.threats ?? [],
    [latestData]
  );

  const summaryStats = useMemo(() => {
    if (!latestData) {
      return { totalThreats: 0, criticalHigh: 0, avgRpn: 0, totalGaps: 0 };
    }
    const threats = latestData.threat_model?.threats ?? [];
    return {
      totalThreats: threats.length,
      criticalHigh: threats.filter(
        (t) => t.severity === "critical" || t.severity === "high"
      ).length,
      avgRpn: latestData.fmea?.summary?.avg_rpn ?? 0,
      totalGaps: latestData.gaps?.length ?? 0,
    };
  }, [latestData]);

  const filtered = useMemo(() => {
    return models.filter((m) => {
      const matchesSearch =
        m.model_id.toLowerCase().includes(search.toLowerCase()) ||
        m.product_version.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "all" || m.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [models, search, statusFilter]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleModalGenerated = (model: any) => {
    setModalOpen(false);
    fetchModels();
    const newId = model?.id ?? model?.data?.id;
    if (newId) router.push(`/threat-modeling/${newId}`);
  };

  const handleView = (id: string) => {
    router.push(`/threat-modeling/${id}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full space-y-8">
        <PageTitleRegistrar
          title={
            <>
              Threat <span className="text-primary">Modeling</span>
            </>
          }
          subtitle="STRIDE threat analysis and risk assessment"
          icon={<AlertTriangle className="h-4 w-4 text-primary" />}
        />
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      <PageTitleRegistrar
        title={
          <>
            Threat <span className="text-primary">Modeling</span>
          </>
        }
        subtitle="STRIDE threat analysis, FMEA risk quantification, and gap assessment"
        icon={<AlertTriangle className="h-4 w-4 text-primary" />}
      />

      {/* Error Banner */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Failed to load threat models</p>
            <p className="mt-0.5 text-xs text-text-secondary">{error}</p>
          </div>
        </div>
      )}

      {/* Risk Summary Cards */}
      <RiskSummaryCards
        totalThreats={summaryStats.totalThreats}
        criticalHigh={summaryStats.criticalHigh}
        avgRpn={summaryStats.avgRpn}
        totalGaps={summaryStats.totalGaps}
      />

      {/* Risk Matrix + STRIDE Radar — only show if latest model exists */}
      {latestData && latestThreats.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RiskMatrix threats={latestThreats} />
          <StrideRadar threats={latestThreats} />
        </div>
      )}

      {/* Search + Filters + New button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          {/* Search */}
          <div className="relative max-w-md flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
              <Search className="h-4 w-4 text-text-muted" />
            </div>
            <input
              type="text"
              placeholder="Search by model ID or version..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search threat models"
              className="w-full rounded-xl border border-border-glass bg-white/5 py-2.5 pl-10 pr-4 text-sm text-text-primary outline-none transition-all duration-300 focus:border-primary/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center rounded-xl border border-border-glass bg-white/5 p-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  statusFilter === tab.value
                    ? "bg-primary/15 text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <Button
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setModalOpen(true)}
        >
          New Threat Model
        </Button>
      </div>

      {/* Threat Model Cards Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {filtered.map((model) => (
            <ThreatModelCard
              key={model.id}
              model={model}
              onView={() => handleView(model.id)}
              onReport={() =>
                router.push(`/threat-modeling/${model.id}`)
              }
            />
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="glass-card flex flex-col items-center justify-center p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            {models.length > 0
              ? "No models match your filters"
              : "No threat models yet"}
          </h3>
          <p className="text-sm text-text-muted max-w-sm">
            {models.length > 0
              ? "Try adjusting your search terms or status filter."
              : "Generate your first STRIDE threat model to map risks, quantify with FMEA, and identify compliance gaps."}
          </p>
          {models.length === 0 && (
            <Button
              variant="primary"
              className="mt-6"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setModalOpen(true)}
            >
              Generate First Model
            </Button>
          )}
        </div>
      )}

      {/* Generate Threat Model Modal */}
      <GenerateThreatModelModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onGenerated={handleModalGenerated}
      />
    </div>
  );
}
