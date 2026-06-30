"use client";

import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { Card } from "@/components/ui/card";
import { Database, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useKbHealth } from "@/hooks/queries/use-kb-health";

// ---------------------------------------------------------------------------
// Skeleton Loader
// ---------------------------------------------------------------------------

function KnowledgeBaseSkeleton() {
  return (
    <div className="w-full space-y-8 animate-pulse">
      {/* Page Title skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-64 rounded bg-white/10" />
        <div className="h-4 w-96 rounded bg-white/5" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-white/10" />
              <div className="h-4 w-32 rounded bg-white/10" />
            </div>
            <div className="h-8 w-20 rounded bg-white/10 mt-2" />
            <div className="h-3 w-40 rounded bg-white/5 mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function KnowledgeBasePage() {
  const { data, isLoading, error } = useKbHealth();

  if (isLoading) {
    return <KnowledgeBaseSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="w-full text-center py-12">
        <h2 className="text-xl font-bold text-red-400">Error loading Knowledge Base metrics</h2>
        <p className="text-sm text-text-muted mt-2">
          {error instanceof Error ? error.message : "Failed to load GRC vector index stats"}
        </p>
      </div>
    );
  }

  const { totalDocs, totalChunks, missingIndexDocs, isoCoverageCount, isoPercentage } = data;

  return (
    <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <PageTitleRegistrar
        title="Knowledge Base Health"
        subtitle="RAG indexing metrics and ISO-27001 coverage"
        icon={<Database className="h-4 w-4 text-emerald-400" />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Ingested Documents" icon={<Database className="h-5 w-5 text-primary" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{totalDocs}</span>
          </div>
        </Card>

        <Card title="Vectorized Chunks" icon={<Activity className="h-5 w-5 text-purple-400" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{totalChunks}</span>
          </div>
        </Card>

        <Card title="Indexing Failures" icon={<AlertTriangle className="h-5 w-5 text-red-400" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{missingIndexDocs}</span>
            <p className="text-xs text-text-muted mt-1">Docs with no processed chunks.</p>
          </div>
        </Card>

        <Card title="ISO-27001 Coverage" icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{isoPercentage}%</span>
            <p className="text-xs text-text-muted mt-1">Chunks mapped to ISO controls ({isoCoverageCount}).</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
