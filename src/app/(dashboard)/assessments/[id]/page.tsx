"use client";

import Link from "next/link";
import { useState, useEffect, use } from "react";
import {
  ArrowLeft,
  ShieldCheck,
  Upload,
  Sparkles,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/*  Framework display-name map                                        */
/* ------------------------------------------------------------------ */
const FRAMEWORK_NAMES: Record<string, string> = {
  "iso27001": "ISO/IEC 27001:2022",
  "BR-LGPD": "LGPD",
  "HI-2013": "HIPAA",
  "TX-LEVEL-2": "TX-RAMP Level 2",
  "EU-GDPR": "EU GDPR",
  "soc-2": "SOC 2 Type II",
};

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
type ControlStatus = "compliant" | "non-compliant" | "partial" | "unreviewed";

interface ControlItem {
  code: string;
  name: string;
  description: string;
  status: ControlStatus;
  evidence?: string;
  needsReview?: boolean;
}

interface FrameworkData {
  name: string;
  score: number;
  progress: number;
  controls: ControlItem[];
}

/* ------------------------------------------------------------------ */
/*  Default empty fallback – used when DB has no data (never crashes) */
/* ------------------------------------------------------------------ */
const DEFAULT_EMPTY_FRAMEWORK: FrameworkData = {
  name: "Framework de Compliance",
  score: 0,
  progress: 0,
  controls: [],
};

/* ------------------------------------------------------------------ */
/*  Logging prefix (matches compliance-data.ts pattern)               */
/* ------------------------------------------------------------------ */
const LOG_PREFIX = "[assessment-detail]";

/* ------------------------------------------------------------------ */
/*  Skeleton loader                                                   */
/* ------------------------------------------------------------------ */
function LoadingSkeleton() {
  return (
    <div className="w-full space-y-8 animate-pulse">
      {/* Back link placeholder */}
      <div className="h-4 w-48 rounded bg-white/5" />

      {/* Header */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-72 rounded-lg bg-white/5" />
          <div className="h-4 w-96 rounded bg-white/5" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-40 rounded-xl bg-white/5" />
          <div className="h-10 w-40 rounded-xl bg-white/5" />
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card p-6 space-y-4">
            <div className="h-4 w-32 rounded bg-white/5" />
            <div className="h-10 w-24 rounded bg-white/5" />
            <div className="h-3 w-full rounded bg-white/5" />
          </div>
        ))}
      </div>

      {/* Controls Section */}
      <div className="glass-card p-6 space-y-6">
        <div className="flex justify-between">
          <div className="h-6 w-40 rounded bg-white/5" />
          <div className="h-10 w-56 rounded-xl bg-white/5" />
        </div>
        <div className="divide-y divide-white/5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-start gap-3 py-4">
              <div className="h-5 w-5 rounded-full bg-white/5 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-14 rounded bg-white/5" />
                  <div className="h-4 w-56 rounded bg-white/5" />
                </div>
                <div className="h-3 w-full max-w-lg rounded bg-white/5" />
              </div>
              <div className="h-6 w-20 rounded-full bg-white/5 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */
export default function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [data, setData] = useState<FrameworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchAssessment() {
      try {
        const supabase = createClient();

        // 1. Fetch the assessment row
        const { data: assessment, error: assessmentError } = await supabase
          .from("compliance_assessments")
          .select("*")
          .eq("id", id)
          .single();

        if (assessmentError || !assessment) {
          console.warn(`${LOG_PREFIX} Assessment not found for id=${id}, using empty fallback`);
          setData(DEFAULT_EMPTY_FRAMEWORK);
          setLoading(false);
          return;
        }

        // 2. Fetch evidence evaluations for this assessment
        const { data: evaluations, error: evalsError } = await supabase
          .from("evidence_evaluations")
          .select("*")
          .eq("assessment_id", id);

        if (evalsError || !evaluations || evaluations.length === 0) {
          console.warn(`${LOG_PREFIX} No evaluations found for assessment id=${id}, using empty fallback`);
          setData({
            ...DEFAULT_EMPTY_FRAMEWORK,
            name: FRAMEWORK_NAMES[assessment.framework_code] || assessment.framework_code,
          });
          setLoading(false);
          return;
        }

        // 3. Map evaluations to control items
        const controls: ControlItem[] = evaluations.map((ev) => {
          // Build status from is_compliant / confidence_score
          let status: ControlStatus;
          if (ev.is_compliant) {
            status = "compliant";
          } else if (ev.confidence_score > 50) {
            status = "partial";
          } else {
            status = "non-compliant";
          }

          // Build description from domain_code + missing_elements
          const missingArr = Array.isArray(ev.missing_elements) ? ev.missing_elements : [];
          const description =
            missingArr.length > 0
              ? `[${ev.domain_code}] ${missingArr.join("; ")}`
              : `Controle avaliado no domínio ${ev.domain_code}.`;

          return {
            code: ev.control_code,
            name: ev.control_name,
            description,
            status,
            evidence: "Avaliado pela IA",
            needsReview: ev.needs_review ?? false,
          };
        });

        // 4. Compute score (avg confidence) & progress (compliant / total * 100)
        const totalConfidence = evaluations.reduce((sum, ev) => sum + (ev.confidence_score ?? 0), 0);
        const avgScore = evaluations.length > 0 ? totalConfidence / evaluations.length : 0;

        const compliantCount = controls.filter((c) => c.status === "compliant").length;
        const progress = controls.length > 0 ? (compliantCount / controls.length) * 100 : 0;

        // 5. Resolve framework display name
        const frameworkName =
          FRAMEWORK_NAMES[assessment.framework_code] || assessment.framework_code;

        setData({
          name: frameworkName,
          score: Math.round(avgScore * 10) / 10,
          progress: Math.round(progress * 10) / 10,
          controls,
        });
      } catch (err) {
        console.warn(`${LOG_PREFIX} Unexpected error for id=${id}, using empty fallback:`, err);
        setData(DEFAULT_EMPTY_FRAMEWORK);
      } finally {
        setLoading(false);
      }
    }

    fetchAssessment();
  }, [id]);

  /* ---------- loading state ---------- */
  if (loading) {
    return <LoadingSkeleton />;
  }

  /* ---------- resolved data (guaranteed non-null after loading) ---------- */
  const resolved = data!;

  const filteredControls = resolved.controls.filter((c) =>
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.description.toLowerCase().includes(search.toLowerCase())
  );

  function getStatusIcon(status: string) {
    switch (status) {
      case "compliant":
        return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
      case "non-compliant":
        return <XCircle className="h-5 w-5 text-red-400" />;
      case "partial":
        return <AlertCircle className="h-5 w-5 text-amber-400" />;
      default:
        return <HelpCircle className="h-5 w-5 text-slate-400" />;
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "compliant":
        return <Badge variant="success">Conforme</Badge>;
      case "non-compliant":
        return <Badge variant="danger">Não Conforme</Badge>;
      case "partial":
        return <Badge variant="warning">Parcial</Badge>;
      default:
        return <Badge variant="neutral">Não Avaliado</Badge>;
    }
  }

  return (
    <div className="w-full space-y-8">
      {/* Back navigation */}
      <Link
        href="/assessments"
        className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para Avaliações
      </Link>

      {/* Header Info */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{resolved.name}</h1>
          <p className="mt-1 text-text-secondary">
            Visão detalhada de controle, mapeamento e evidências do framework.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={<Upload className="h-4 w-4" />}>
            Upload Evidência
          </Button>
          <Button variant="primary" icon={<Sparkles className="h-4 w-4" />}>
            Rodar AI Auditor
          </Button>
        </div>
      </div>

      {resolved.controls.some(c => c.needsReview) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Revisão de Evidências Necessária</p>
            <p className="mt-0.5 text-xs text-text-secondary">
              Alguns controles desta avaliação dependem de políticas/documentos do ISMS que foram atualizados ou expiraram. Por favor, re-audite os controles destacados.
            </p>
          </div>
        </div>
      )}

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card title="AI Audit Score" icon={<ShieldCheck className="h-5 w-5 text-accent" />}>
          <div className="mt-2">
            <span className="text-4xl font-extrabold text-text-primary">{resolved.score}%</span>
            <p className="mt-2 text-xs text-text-muted">
              Score consolidado com base na cobertura de evidências do GRC Engine.
            </p>
          </div>
        </Card>
        <Card title="Progresso Geral" icon={<CheckCircle2 className="h-5 w-5 text-primary" />}>
          <div className="mt-2 space-y-4">
            <Progress value={resolved.progress} size="md" />
            <p className="text-xs text-text-muted">
              {resolved.progress}% dos controles avaliados com evidência anexada.
            </p>
          </div>
        </Card>
        <Card title="Ações Rápidas" icon={<Sparkles className="h-5 w-5 text-warning" />}>
          <div className="flex flex-wrap gap-2 pt-2">
            <button className="rounded-lg bg-white/5 border border-white/5 hover:border-primary/20 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-white/10 transition-all">
              Blast Radius
            </button>
            <button className="rounded-lg bg-white/5 border border-white/5 hover:border-primary/20 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-white/10 transition-all">
              ROI Compliance Path
            </button>
          </div>
        </Card>
      </div>

      {/* Controls Section */}
      <div className="glass-card p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Lista de Controles</h2>
          {/* Search */}
          <div className="relative w-full max-w-xs">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-text-muted" />
            </div>
            <input
              type="text"
              placeholder="Filtrar controles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filtrar controles"
              className="w-full rounded-xl border border-border-glass bg-white/5 py-2 pl-9 pr-4 text-sm text-text-primary outline-none transition-all duration-300 focus:border-primary/50"
            />
          </div>
        </div>

        {/* Controls Table/List */}
        <div className="divide-y divide-white/5">
          {filteredControls.map((control) => (
            <div key={control.code} className="flex flex-col py-4 gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3 max-w-3xl">
                <div className="mt-0.5 shrink-0">{getStatusIcon(control.status)}</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-primary font-semibold bg-primary/10 rounded px-1.5 py-0.5">
                      {control.code}
                    </span>
                    <h3 className="font-medium text-text-primary text-sm">{control.name}</h3>
                  </div>
                  <p className="text-xs text-text-secondary">{control.description}</p>
                  {control.evidence && (
                    <p className="text-xs text-text-muted flex items-center gap-1.5 mt-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      Evidência: <code className="text-accent">{control.evidence}</code>
                    </p>
                  )}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-3 self-end md:self-start">
                {control.needsReview && (
                  <Badge variant="warning" dot>Revisão Necessária</Badge>
                )}
                {getStatusBadge(control.status)}
              </div>
            </div>
          ))}
          {filteredControls.length === 0 && (
            <p className="text-center py-6 text-sm text-text-muted">Nenhum controle encontrado.</p>
          )}
        </div>
      </div>
    </div>
  );
}
