"use client";

import Link from "next/link";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import {
  ClipboardCheck,
  Plus,
  Search,
  Zap,
  ScanSearch,
  ChevronDown,
  ChevronUp,
  Edit2,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useVersion } from "@/lib/context/version-context";
import { useAssessments, useAssessmentEvidence, useUpdateAssessment, useDeleteAssessment } from "@/hooks/queries/use-assessments";
import type { AssessmentRecord } from "@/hooks/queries/use-assessments";
import { RunAssessmentModal } from "@/components/assessments/run-assessment-modal";
import { EvidenceTable } from "@/components/assessments/evidence-table";
import { resolveFrameworkName } from "@/lib/assessment/framework-registry";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AssessmentsPage() {
  const { activeVersion, versions } = useVersion();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [frameworks, setFrameworks] = useState<Array<{ framework_code: string; framework_name: string }>>([]);
  const { success, error: toastError } = useToast();

  // T005: React Query hook replaces raw Supabase fetch
  const { data: assessments = [], isLoading: loading } = useAssessments(activeVersion?.id ?? null);
  const updateAssessment = useUpdateAssessment();
  const deleteAssessment = useDeleteAssessment();

  useEffect(() => {
    fetch("/api/compliance/frameworks")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setFrameworks(json.data);
        }
      })
      .catch((err) => console.error("Error loading frameworks:", err));
  }, []);




  const toggleExpand = useCallback((assessmentId: string) => {
    setExpandedId((prev) => (prev === assessmentId ? null : assessmentId));
  }, []);

  const handleEdit = async (id: string, currentName: string) => {
    const newName = window.prompt("Enter new assessment name:", currentName);
    if (newName !== null && newName.trim() !== "" && newName !== currentName) {
      try {
        await updateAssessment.mutateAsync({ id, data: { name: newName.trim() } });
        success("Assessment updated successfully.");
      } catch (err) {
        console.error("Failed to update assessment", err);
        toastError("Failed to update assessment.");
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this assessment? This action cannot be undone.")) {
      try {
        await deleteAssessment.mutateAsync(id);
        success("Assessment deleted successfully.");
      } catch (err) {
        console.error("Failed to delete assessment", err);
        toastError("Failed to delete assessment.");
      }
    }
  };

  const filtered = assessments.filter((a) => {
    const matchesSearch = a.name
      .toLowerCase()
      .includes(search.toLowerCase());
    if (activeVersion) {
      return matchesSearch && a.product_version_id === activeVersion.id;
    }
    return matchesSearch;
  });

  const getOverallScore = (record: AssessmentRecord): number => {
    const scores = record.framework_scores || [];
    if (scores.length === 0) return 0;
    const sum = scores.reduce((acc, s) => acc + (s.score || 0), 0);
    return Math.round(sum / scores.length);
  };

  return (
    <div className="w-full space-y-8">
      <PageTitleRegistrar
        title={
          <>
            Compliance{" "}
            <span className="text-emerald-400">Assessments</span>
          </>
        }
        subtitle="Run and monitor compliance scans powered by the Standard GRC Engine."
        icon={<ClipboardCheck className="h-4 w-4 text-primary" />}
      />

      <div className="flex items-center justify-between gap-4">
        {/* Search */}
        <div className="relative max-w-md flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
            <Search className="h-4 w-4 text-text-muted" />
          </div>
          <input
            type="text"
            placeholder="Search assessments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search assessments"
            className="w-full rounded-xl border border-border-glass bg-white/5 py-2.5 pl-10 pr-4 text-sm text-text-primary outline-none transition-all duration-300 focus:border-primary/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <Button
          id="run-assessment-btn"
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setModalOpen(true)}
        >
          Run Assessment
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card h-full p-6 animate-pulse">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/10" />
                  <div className="space-y-2">
                    <div className="h-4 w-40 rounded bg-white/10" />
                    <div className="h-3 w-56 rounded bg-white/5" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <div className="glass-card flex flex-col items-center justify-center p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 mb-4">
            <ScanSearch className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            No assessments yet
          </h3>
          <p className="text-sm text-text-muted max-w-sm">
            Run your first compliance scan to evaluate your ISMS documents
            against SCF controls across multiple frameworks.
          </p>
          <Button
            variant="primary"
            className="mt-6"
            icon={<Zap className="h-4 w-4" />}
            onClick={() => setModalOpen(true)}
          >
            Run First Assessment
          </Button>
        </div>
      )}

      {/* Assessment Cards */}
      {!loading && filtered.length > 0 && (
        <div id="assessments-history-list" className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {filtered.map((item) => {
            const overallScore = getOverallScore(item);
            const progress =
              item.total_controls > 0
                ? Math.round(
                    (item.compliant_controls / item.total_controls) * 100
                  )
                : 0;
            const isExpanded = expandedId === item.id;

            return (
              <div key={item.id} className="group block">
                <div className={`glass-card h-full p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 ${isExpanded ? 'border-[#53c4cd]/30 shadow-lg shadow-[#53c4cd]/5' : ''}`}>
                  <div className="flex items-start justify-between">
                    <Link
                      href={`/assessments/${item.id}`}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 shrink-0">
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-text-primary group-hover:text-primary transition-colors leading-tight truncate">
                            {item.name}
                          </h3>
                          <Badge
                            variant="info"
                            className="text-[9px] bg-primary/10 text-primary border border-primary/20 py-0 px-1 font-mono uppercase shrink-0"
                          >
                            {item.mode}
                          </Badge>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          {(item.frameworks || []).length} frameworks ·{" "}
                          {item.sales_channel || "All channels"} ·{" "}
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={
                          item.status === "completed" ? "success" : "info"
                        }
                        dot
                      >
                        {item.status === "completed" ? "Complete" : "Running"}
                      </Badge>
                      <button
                        onClick={(e) => { e.preventDefault(); handleEdit(item.id, item.name); }}
                        className="rounded-lg p-1.5 hover:bg-white/10 transition-colors text-text-muted hover:text-primary"
                        aria-label="Edit assessment name"
                        disabled={updateAssessment.isPending}
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); handleDelete(item.id); }}
                        className="rounded-lg p-1.5 hover:bg-red-500/10 transition-colors text-text-muted hover:text-red-400"
                        aria-label="Delete assessment"
                        disabled={deleteAssessment.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); toggleExpand(item.id); }}
                        className="rounded-lg p-1.5 hover:bg-white/10 transition-colors text-text-muted hover:text-[#53c4cd]"
                        aria-label={isExpanded ? "Collapse evidence" : "Expand evidence"}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Framework score pills */}
                  {item.framework_scores && item.framework_scores.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.framework_scores.map((fs) => {
                        const fwName = resolveFrameworkName(fs.frameworkId);
                        return (
                          <span
                            key={fs.frameworkId}
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium ${
                              fs.score >= 70
                                ? "bg-emerald-500/10 text-emerald-400"
                                : fs.score >= 40
                                ? "bg-amber-500/10 text-amber-400"
                                : "bg-red-500/10 text-red-400"
                            }`}
                          >
                            {fwName}: {fs.score}%
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Progress and Stats */}
                  <div className="mt-4 space-y-4">
                    <Progress
                      value={progress}
                      label="Control Compliance"
                      size="sm"
                    />
                    <div className="flex justify-between border-t border-white/5 pt-4 text-xs text-text-secondary">
                      <div>
                        <span className="text-text-muted block">
                          Overall Score
                        </span>
                        <span
                          className={`font-semibold text-sm ${
                            overallScore >= 70
                              ? "text-emerald-400"
                              : overallScore >= 40
                              ? "text-amber-400"
                              : "text-red-400"
                          }`}
                        >
                          {overallScore}%
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-text-muted block">
                          Compliant / Total
                        </span>
                        <span className="font-semibold text-text-primary text-sm">
                          {item.compliant_controls} / {item.total_controls}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* T007: Expandable Evidence Evaluations via EvidenceTable */}
                  {isExpanded && (
                    <ExpandedEvidence
                      assessmentId={item.id}
                      frameworkCode={item.frameworks?.[0] ?? ""}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <RunAssessmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onComplete={() => {/* React Query auto-invalidates via useRunAssessment */}}
        productVersionId={activeVersion?.id}
        frameworks={frameworks}
        loadingFrameworks={frameworks.length === 0}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: Expanded evidence section using React Query
// ---------------------------------------------------------------------------
function ExpandedEvidence({ assessmentId, frameworkCode }: { assessmentId: string; frameworkCode: string }) {
  const { data: evaluations = [], isLoading } = useAssessmentEvidence(assessmentId);

  return (
    <EvidenceTable
      evaluations={evaluations}
      loading={isLoading}
      assessmentId={assessmentId}
      frameworkCode={frameworkCode}
    />
  );
}
