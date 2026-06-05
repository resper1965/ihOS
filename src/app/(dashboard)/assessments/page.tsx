"use client";

import Link from "next/link";
import { useState } from "react";
import { ClipboardCheck, Plus, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

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

export default function AssessmentsPage() {
  const [search, setSearch] = useState("");

  const filtered = MOCK_ASSESSMENTS.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Avaliações de Conformidade
          </h1>
          <p className="mt-1 text-text-secondary">
            Monitore o progresso e o score de conformidade dos frameworks ativos.
          </p>
        </div>
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

      {/* Grid List */}
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
                    <h3 className="font-semibold text-text-primary group-hover:text-primary transition-colors">
                      {item.name}
                    </h3>
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
    </div>
  );
}
