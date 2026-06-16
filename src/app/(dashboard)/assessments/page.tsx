"use client";

import Link from "next/link";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { useEffect, useState } from "react";
import { ClipboardCheck, Plus, Search, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useVersion } from "@/lib/context/version-context";

// ---------------------------------------------------------------------------
// Framework display-name map
// ---------------------------------------------------------------------------
const FRAMEWORK_NAMES: Record<string, { name: string; description: string }> = {
  "iso27001": {
    name: "ISO/IEC 27001:2022",
    description: "Sistema de Gestão da Segurança da Informação (SGSI)",
  },
  "BR-LGPD": {
    name: "LGPD",
    description: "Conformidade com a legislação brasileira de privacidade",
  },
  "HI-2013": {
    name: "HIPAA",
    description: "Health Insurance Portability and Accountability Act",
  },
  "TX-LEVEL-2": {
    name: "TX-RAMP Level 2",
    description: "Texas Risk and Authorization Management Program",
  },
  "EU-GDPR": {
    name: "EU GDPR",
    description: "Regulamento Geral sobre a Proteção de Dados da UE",
  },
  "soc-2": {
    name: "SOC 2 Type II",
    description: "Relatório de Segurança, Disponibilidade e Confidencialidade",
  },
};

// ---------------------------------------------------------------------------
// Fallback mock data (used when Supabase returns empty / errors)
// ---------------------------------------------------------------------------
const MOCK_ASSESSMENTS = [
  {
    id: "iso-27001",
    name: "ISO/IEC 27001:2022",
    description: "Sistema de Gestão da Segurança da Informação (SGSI)",
    progress: 78,
    score: 84.5,
    status: "active" as const,
    controlsCount: 93,
    evidenceCount: 72,
  },
  {
    id: "soc-2",
    name: "SOC 2 Type II",
    description: "Relatório de Segurança, Disponibilidade e Confidencialidade",
    progress: 45,
    score: 92.1,
    status: "active" as const,
    controlsCount: 114,
    evidenceCount: 48,
  },
  {
    id: "tx-ramp",
    name: "TX-RAMP Level 2",
    description: "Texas Risk and Authorization Management Program",
    progress: 92,
    score: 96.8,
    status: "active" as const,
    controlsCount: 124,
    evidenceCount: 115,
  },
  {
    id: "lgpd",
    name: "LGPD (Lei Geral de Proteção de Dados)",
    description: "Conformidade com a legislação brasileira de privacidade",
    progress: 100,
    score: 98.2,
    status: "completed" as const,
    controlsCount: 65,
    evidenceCount: 65,
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AssessmentCard {
  id: string;
  name: string;
  description: string;
  progress: number;
  score: number;
  status: "active" | "completed";
  controlsCount: number;
  evidenceCount: number;
  product_version_id?: string | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AssessmentsPage() {
  const { activeVersion, versions } = useVersion();
  const [search, setSearch] = useState("");
  const [assessments, setAssessments] = useState<AssessmentCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAssessments() {
      try {
        const supabase = createClient();

        // 1. Fetch all assessments
        const { data: rows, error } = await supabase
          .from("compliance_assessments")
          .select("id, framework_code, product_version_id, observation_start_date, observation_end_date, created_at, updated_at");

        if (error || !rows || rows.length === 0) {
          // Fallback to mock data
          setAssessments(MOCK_ASSESSMENTS);
          setLoading(false);
          return;
        }

        // 2. For each assessment, fetch evidence evaluation counts
        const cards: AssessmentCard[] = await Promise.all(
          rows.map(async (row) => {
            // Total evaluations count
            const { count: totalCount } = await supabase
              .from("evidence_evaluations")
              .select("*", { count: "exact", head: true })
              .eq("assessment_id", row.id);

            // Compliant evaluations count
            const { count: compliantCount } = await supabase
              .from("evidence_evaluations")
              .select("*", { count: "exact", head: true })
              .eq("assessment_id", row.id)
              .eq("is_compliant", true);

            // Average confidence score
            const { data: scoreRows } = await supabase
              .from("evidence_evaluations")
              .select("confidence_score")
              .eq("assessment_id", row.id);

            const total = totalCount ?? 0;
            const compliant = compliantCount ?? 0;
            const progress = total > 0 ? Math.round((compliant / total) * 100) : 0;

            let avgScore = 0;
            if (scoreRows && scoreRows.length > 0) {
              const sum = scoreRows.reduce((acc, r) => acc + (r.confidence_score ?? 0), 0);
              avgScore = Math.round((sum / scoreRows.length) * 10) / 10;
            }

            const frameworkInfo = FRAMEWORK_NAMES[row.framework_code] ?? {
              name: row.framework_code,
              description: "",
            };

            return {
              id: row.id,
              name: frameworkInfo.name,
              description: frameworkInfo.description,
              progress,
              score: avgScore,
              status: progress >= 100 ? ("completed" as const) : ("active" as const),
              controlsCount: total,
              evidenceCount: compliant,
              product_version_id: row.product_version_id,
            };
          }),
        );

        setAssessments(cards);
      } catch {
        // On any unexpected error, fall back to mock data
        setAssessments(MOCK_ASSESSMENTS.map(m => ({ ...m, product_version_id: null })));
      } finally {
        setLoading(false);
      }
    }

    fetchAssessments();
  }, []);

  const filtered = assessments.filter((a) => {
    const matchesSearch = (
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase())
    );
    if (activeVersion) {
      return matchesSearch && a.product_version_id === activeVersion.id;
    }
    // Show only global/non-versioned assessments if no active version is selected
    return matchesSearch && !a.product_version_id;
  });

  return (
    <div className="w-full space-y-8">
      <PageTitleRegistrar
        title="Avaliações de Conformidade"
        subtitle="Monitore o progresso e o score de conformidade dos frameworks ativos."
        icon={<ClipboardCheck className="h-4 w-4 text-blue-400" />}
      />
      <div className="flex justify-end">
        <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
          Nova Avaliação
        </Button>
      </div>

      {/* Search/Filter */}
      <div className="relative max-w-md">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
          <Search className="h-4 w-4 text-text-muted" />
        </div>
        <input
          type="text"
          placeholder="Buscar framework ou descrição..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-border-glass bg-white/5 py-2.5 pl-10 pr-4 text-sm text-text-primary outline-none transition-all duration-300 focus:border-primary/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Loading Skeleton */}
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
                <div className="h-5 w-24 rounded-full bg-white/10" />
              </div>
              <div className="mt-8 space-y-4">
                <div className="h-2 w-full rounded-full bg-white/10" />
                <div className="flex justify-between border-t border-white/5 pt-4">
                  <div className="space-y-1">
                    <div className="h-3 w-16 rounded bg-white/5" />
                    <div className="h-4 w-12 rounded bg-white/10" />
                  </div>
                  <div className="space-y-1">
                    <div className="h-3 w-28 rounded bg-white/5" />
                    <div className="h-4 w-16 rounded bg-white/10" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grid List */}
      {!loading && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {filtered.map((item) => (
            <Link
              key={item.id}
              href={`/assessments/${item.id}`}
              className="group block"
            >
              <div className="glass-card h-full p-6 transition-all duration-300 hover:scale-[1.01] hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
                      <ClipboardCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-text-primary group-hover:text-primary transition-colors leading-tight">
                          {item.name}
                        </h3>
                        {item.product_version_id && (
                          <Badge variant="info" className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 py-0 px-1 font-mono">
                            {versions.find(v => v.id === item.product_version_id)?.version_code}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">{item.description}</p>
                    </div>
                  </div>
                  <Badge variant={item.status === "completed" ? "success" : "info"} dot>
                    {item.status === "completed" ? "Concluído" : "Em Progresso"}
                  </Badge>
                </div>

                {/* Progress and Stats */}
                <div className="mt-8 space-y-4">
                  <Progress value={item.progress} label="Progresso da Evidência" size="sm" />

                  <div className="flex justify-between border-t border-white/5 pt-4 text-xs text-text-secondary">
                    <div>
                      <span className="text-text-muted block">Score AI</span>
                      <span className="font-semibold text-text-primary text-sm">{item.score}%</span>
                    </div>
                    <div className="text-right">
                      <span className="text-text-muted block">Controles / Evidências</span>
                      <span className="font-semibold text-text-primary text-sm">
                        {item.evidenceCount} / {item.controlsCount}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
