"use client";

import { useState } from "react";
import { FileDown, Calendar, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const MOCK_REPORTS = [
  {
    id: 1,
    title: "Relatório de Gap Analysis TX-RAMP L2",
    framework: "TX-RAMP Level 2",
    createdAt: "2026-06-03T18:24:00Z",
    type: "Gap Analysis",
    status: "ready" as const,
  },
  {
    id: 2,
    title: "Relatório Anual de Auditoria ISO 27001",
    framework: "ISO/IEC 27001:2022",
    createdAt: "2026-05-28T11:05:00Z",
    type: "Audit Report",
    status: "ready" as const,
  },
  {
    id: 3,
    title: "Declaração de Aplicabilidade (SoA) - SOC 2",
    framework: "SOC 2 Type II",
    createdAt: "2026-05-15T15:30:00Z",
    type: "Statement of Applicability",
    status: "ready" as const,
  },
  {
    id: 4,
    title: "Relatório Executivo de Conformidade Geral",
    framework: "Múltiplos Frameworks",
    createdAt: "2026-06-04T20:00:00Z",
    type: "Executive Summary",
    status: "generating" as const,
  },
];

export default function ReportsPage() {
  const [search, setSearch] = useState("");

  const filtered = MOCK_REPORTS.filter((rep) =>
    rep.title.toLowerCase().includes(search.toLowerCase()) ||
    rep.framework.toLowerCase().includes(search.toLowerCase())
  );

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Relatórios de Conformidade
          </h1>
          <p className="mt-1 text-text-secondary">
            Gere, visualize e baixe relatórios detalhados gerados pela inteligência GRC.
          </p>
        </div>
        <Button variant="primary" icon={<Sparkles className="h-4 w-4" />}>
          Gerar Novo Relatório
        </Button>
      </div>

      {/* Reports List */}
      <div className="glass-card p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Relatórios Disponíveis</h2>
          {/* Search */}
          <div className="relative w-full max-w-xs">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-text-muted" />
            </div>
            <input
              type="text"
              placeholder="Buscar relatório..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-border-glass bg-white/5 py-2 pl-9 pr-4 text-sm text-text-primary outline-none transition-all duration-300 focus:border-primary/50"
            />
          </div>
        </div>

        {/* List items */}
        <div className="divide-y divide-white/5">
          {filtered.map((rep) => (
            <div key={rep.id} className="flex flex-col py-4 gap-3 md:flex-row md:items-center md:justify-between hover:bg-white/[0.01] px-2 rounded-lg transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
                  <Calendar className="h-5 w-5 text-text-muted" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="font-medium text-text-primary text-sm">{rep.title}</h3>
                  <p className="text-xs text-text-muted">
                    {rep.framework} • {rep.type}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 self-end md:self-auto">
                <span className="text-xs text-text-muted">Geração: {formatDate(rep.createdAt)}</span>
                <Badge variant={rep.status === "ready" ? "success" : "warning"} dot>
                  {rep.status === "ready" ? "Disponível" : "Gerando..."}
                </Badge>
                <button
                  disabled={rep.status !== "ready"}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-glass bg-white/5 px-3 py-1.5 text-xs text-text-secondary transition-all hover:bg-white/10 hover:border-primary/40 disabled:opacity-40"
                  aria-label="Download do relatório"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Baixar PDF
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center py-6 text-sm text-text-muted">Nenhum relatório encontrado.</p>
          )}
        </div>
      </div>
    </div>
  );
}
