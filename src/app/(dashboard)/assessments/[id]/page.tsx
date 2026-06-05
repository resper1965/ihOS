"use client";

import Link from "next/link";
import { useState, use } from "react";
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

const MOCK_FRAMEWORK_DATA: Record<string, {
  name: string;
  score: number;
  progress: number;
  controls: {
    code: string;
    name: string;
    description: string;
    status: "compliant" | "non-compliant" | "partial" | "unreviewed";
    evidence?: string;
  }[];
}> = {
  "iso-27001": {
    name: "ISO/IEC 27001:2022",
    score: 84.5,
    progress: 78,
    controls: [
      {
        code: "A.5.1",
        name: "Políticas de Segurança da Informação",
        description: "Diretrizes definidas pela alta direção sobre segurança de dados.",
        status: "compliant",
        evidence: "politica_seguranca_v2.1.pdf",
      },
      {
        code: "A.5.15",
        name: "Controle de Acesso",
        description: "Regras de privilégios mínimos e monitoramento de usuários.",
        status: "compliant",
        evidence: "relatorio_usuarios_iam.xlsx",
      },
      {
        code: "A.8.20",
        name: "Segurança de Redes",
        description: "Criptografia de tráfego, segmentação e firewalls.",
        status: "partial",
        evidence: "topologia_rede_producao.png",
      },
      {
        code: "A.8.24",
        name: "Uso de Criptografia",
        description: "Chaves TLS/AES gerenciadas para tráfego em trânsito e em repouso.",
        status: "non-compliant",
      },
    ],
  },
  "tx-ramp": {
    name: "TX-RAMP Level 2",
    score: 96.8,
    progress: 92,
    controls: [
      {
        code: "AC-2",
        name: "Account Management",
        description: "Gerenciamento de credenciais, desativação de contas e auditoria de privilégios.",
        status: "compliant",
        evidence: "tx_ramp_iam_policy.pdf",
      },
      {
        code: "CP-9",
        name: "Information System Backup",
        description: "Backups diários criptografados e testes semestrais de restore.",
        status: "compliant",
        evidence: "backup_verification_logs.txt",
      },
      {
        code: "RA-5",
        name: "Vulnerability Monitoring and Scanning",
        description: "Varreduras de vulnerabilidades automáticas semanais nos ambientes cloud.",
        status: "compliant",
        evidence: "vuln_scan_report_may.pdf",
      },
      {
        code: "SC-7",
        name: "Boundary Protection",
        description: "Controle de firewalls e balanceamento de carga com bloqueio de tráfego malicioso.",
        status: "partial",
        evidence: "cloudflare_waf_config.json",
      },
    ],
  },
};

export default function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const data = MOCK_FRAMEWORK_DATA[id] || {
    name: "Framework de Compliance",
    score: 0,
    progress: 0,
    controls: [],
  };

  const [search, setSearch] = useState("");

  const filteredControls = data.controls.filter((c) =>
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
    <div className="mx-auto max-w-7xl space-y-8">
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
          <h1 className="text-2xl font-bold sm:text-3xl">{data.name}</h1>
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

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card title="AI Audit Score" icon={<ShieldCheck className="h-5 w-5 text-accent" />}>
          <div className="mt-2">
            <span className="text-4xl font-extrabold text-text-primary">{data.score}%</span>
            <p className="mt-2 text-xs text-text-muted">
              Score consolidado com base na cobertura de evidências do GRC Engine.
            </p>
          </div>
        </Card>
        <Card title="Progresso Geral" icon={<CheckCircle2 className="h-5 w-5 text-primary" />}>
          <div className="mt-2 space-y-4">
            <Progress value={data.progress} size="md" />
            <p className="text-xs text-text-muted">
              {data.progress}% dos controles avaliados com evidência anexada.
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
