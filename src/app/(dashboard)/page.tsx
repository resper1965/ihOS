"use client";

import {
  ShieldCheck,
  FileText,
  ClipboardCheck,
  TrendingUp,
  LayoutDashboard,
  ArrowRight,
} from "lucide-react";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { StatsCard } from "@/components/dashboard/stats-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { GoalsWidget } from "@/components/dashboard/goals-widget";
import { RealtimeRefresher } from "@/components/dashboard/realtime-refresher";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { useDashboardStats } from "@/hooks/queries/use-dashboard";

// ---------------------------------------------------------------------------
// Dashboard Skeleton Loader
// ---------------------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="w-full space-y-8 animate-pulse">
      {/* Page Title skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-64 rounded bg-white/10" />
        <div className="h-4 w-96 rounded bg-white/5" />
      </div>

      {/* Stats Grid skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card h-32 p-6 space-y-4">
            <div className="h-10 w-10 rounded-full bg-white/10" />
            <div className="space-y-2">
              <div className="h-6 w-16 rounded bg-white/10" />
              <div className="h-3 w-32 rounded bg-white/5" />
            </div>
          </div>
        ))}
      </div>

      {/* Baseline skeleton */}
      <div className="glass-card p-6 space-y-6">
        <div className="space-y-2 border-b border-white/5 pb-4">
          <div className="h-6 w-80 rounded bg-white/10" />
          <div className="h-4 w-[400px] rounded bg-white/5" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-white/10" />
            <div className="h-6 w-full rounded bg-white/5" />
          </div>
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-white/10" />
            <div className="h-12 w-full rounded bg-white/5" />
          </div>
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-white/10" />
            <div className="h-12 w-full rounded bg-white/5" />
          </div>
        </div>
      </div>

      {/* Feed & Goals skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="glass-card p-6 space-y-4">
          <div className="h-6 w-48 rounded bg-white/10" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-white/5">
                <div className="space-y-1">
                  <div className="h-4 w-48 rounded bg-white/10" />
                  <div className="h-3 w-20 rounded bg-white/5" />
                </div>
                <div className="h-6 w-16 rounded bg-white/10" />
              </div>
            ))}
          </div>
        </div>
        <div className="glass-card p-6 space-y-4">
          <div className="h-6 w-48 rounded bg-white/10" />
          <div className="h-4 w-full rounded bg-white/5" />
          <div className="space-y-2 pt-2">
            <div className="h-12 w-full rounded bg-white/5" />
            <div className="h-12 w-full rounded bg-white/5" />
            <div className="h-12 w-full rounded bg-white/5" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboardStats();

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="w-full text-center py-12">
        <h2 className="text-xl font-bold text-red-400">Error loading dashboard</h2>
        <p className="text-sm text-text-muted mt-2">
          {error instanceof Error ? error.message : "Failed to load dashboard metrics"}
        </p>
      </div>
    );
  }

  const { stats, activities, msrData } = data;

  const STATS = [
    {
      label: "Total Frameworks",
      value: stats.frameworks,
      icon: ShieldCheck,
      color: "text-primary",
      bgColor: "bg-primary/10",
      tooltipContent: "Number of active regulations with initiated audits (e.g., ISO 27001, SOC 2, ISO 27701).",
    },
    {
      label: "Analyzed Documents",
      value: stats.documents,
      icon: FileText,
      color: "text-accent",
      bgColor: "bg-accent/10",
      tooltipContent: "Total documents ingested and indexed in the RAG vector base (Policies, Evidence, Reports).",
    },
    {
      label: "Active Assessments",
      value: stats.assessments,
      icon: ClipboardCheck,
      color: "text-warning",
      bgColor: "bg-warning/10",
      tooltipContent: "Number of audits in progress or recently completed for gap analysis.",
    },
    {
      label: "Compliance Score",
      value: stats.score,
      icon: TrendingUp,
      color: "text-accent",
      bgColor: "bg-accent/10",
      tooltipContent: "Aggregated average of compliance evaluations across all monitored frameworks.",
    },
  ] as const;

  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <OnboardingGate />
      <PageTitleRegistrar
        title={<>Welcome to <span className="gradient-text font-extrabold">ihOS</span></>}
        subtitle="Your consolidated view of compliance and governance."
        icon={<LayoutDashboard className="h-4 w-4 text-primary" />}
      />

      {/* Stats Grid */}
      <div id="stats-grid-dashboard" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <StatsCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            color={stat.color}
            bgColor={stat.bgColor}
            tooltipContent={stat.tooltipContent}
          />
        ))}
      </div>

      {/* SCRMS MSR Baseline Progress Section */}
      {msrData && (
        <div className="glass-card p-6 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border-glass pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-text-primary">
                  SCRMS Security Baseline (MSR)
                </h2>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {msrData.baseline.version_code}
                </span>
              </div>
              <p className="text-sm text-text-secondary mt-1">
                Active program: <strong className="text-text-primary">{msrData.baseline.name}</strong> — {msrData.baseline.description}
              </p>
            </div>
            <Link
              href="/compliance/scrms"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-bg-dark transition-all hover:bg-primary-hover active:scale-95"
            >
              <span>Manage Baseline & DSRs</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* MCR Progress */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">
                  Minimum Compliance Requirements (MCR)
                </span>
                <span className="text-xs text-text-secondary">
                  {msrData.stats.acceptedMCR} / {msrData.stats.totalMCR} Accepted
                </span>
              </div>
              <Progress
                value={msrData.stats.acceptedMCR}
                max={msrData.stats.totalMCR || 100}
                showPercentage={true}
                size="md"
              />
              <p className="text-xs text-text-muted">
                Mandatory controls mapped from regulatory frameworks (ISO 27701/ISO 27001).
              </p>
            </div>

            {/* DSR Recommendations */}
            <div className="space-y-3">
              <span className="text-sm font-semibold text-text-primary block">
                Discretionary Security Requirements (DSR)
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div className="status-card-accepted rounded-xl p-2.5 text-center shadow-sm">
                  <span className="block text-lg font-bold leading-none">
                    {msrData.stats.acceptedDSR}
                  </span>
                  <span className="text-[9px] uppercase font-bold tracking-wider opacity-85 mt-1 block">
                    Accepted
                  </span>
                </div>
                <div className="status-card-pending rounded-xl p-2.5 text-center shadow-sm">
                  <span className="block text-lg font-bold leading-none">
                    {msrData.stats.pendingDSR}
                  </span>
                  <span className="text-[9px] uppercase font-bold tracking-wider opacity-85 mt-1 block">
                    Pending
                  </span>
                </div>
                <div className="status-card-rejected rounded-xl p-2.5 text-center shadow-sm">
                  <span className="block text-lg font-bold leading-none">
                    {msrData.stats.rejectedDSR}
                  </span>
                  <span className="text-[9px] uppercase font-bold tracking-wider opacity-85 mt-1 block">
                    Rejected
                  </span>
                </div>
              </div>
              <p className="text-xs text-text-muted">
                Risk-based discretionary controls dynamically scored and recommended.
              </p>
            </div>

            {/* PPTDF Coverage */}
            <div className="space-y-2">
              <span className="text-sm font-semibold text-text-primary block">
                MSR Asset Scope (PPTDF)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(msrData.stats.pptdf).map(([scope, count]) => (
                  <div
                    key={scope}
                    className="flex items-center gap-1.5 rounded-lg bg-black/[0.03] dark:bg-white/5 px-2.5 py-1.5 text-xs text-text-secondary border border-border-glass"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span className="font-medium text-text-primary">{scope}:</span>
                    <span className="font-semibold text-primary">{count as number}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-muted mt-2">
                Operational impact vectors for the accepted control baseline.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Feed & Goals grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div id="activity-feed-card">
          <ActivityFeed activities={activities} />
        </div>
        <div id="goals-widget-card">
          <GoalsWidget />
        </div>
      </div>

      <RealtimeRefresher />
    </div>
  );
}
