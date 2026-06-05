"use client";

import { useState } from "react";
import { FileText, Upload, Trash2, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const MOCK_DOCUMENTS = [
  {
    id: 1,
    title: "politica_seguranca_v2.1.pdf",
    category: "ISMS_CORE",
    size: "1.2 MB",
    uploadedAt: "2026-05-12T14:32:00Z",
    chunks: 42,
    status: "indexed" as const,
  },
  {
    id: 2,
    title: "tx_ramp_iam_policy.pdf",
    category: "TX_RAMP_OVERLAY",
    size: "840 KB",
    uploadedAt: "2026-05-20T10:15:00Z",
    chunks: 28,
    status: "indexed" as const,
  },
  {
    id: 3,
    title: "relatorio_usuarios_iam.xlsx",
    category: "EVIDENCE_LOGS",
    size: "3.4 MB",
    uploadedAt: "2026-06-01T09:44:00Z",
    chunks: 15,
    status: "indexed" as const,
  },
  {
    id: 4,
    title: "politica_privacidade_gehc.pdf",
    category: "B2B_GEHC",
    size: "2.1 MB",
    uploadedAt: "2026-06-03T16:00:00Z",
    chunks: 56,
    status: "indexing" as const,
  },
];

export default function DocumentsPage() {
  const [search, setSearch] = useState("");

  const filtered = MOCK_DOCUMENTS.filter((doc) =>
    doc.title.toLowerCase().includes(search.toLowerCase()) ||
    doc.category.toLowerCase().includes(search.toLowerCase())
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
            Documentos de Evidência
          </h1>
          <p className="mt-1 text-text-secondary">
            Gerencie e armazene arquivos de evidências e políticas integradas no banco RAG.
          </p>
        </div>
        <Button variant="primary" icon={<Upload className="h-4 w-4" />}>
          Carregar Arquivo
        </Button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card title="Documentos Totais" icon={<FileText className="h-5 w-5 text-primary" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{MOCK_DOCUMENTS.length}</span>
            <p className="text-xs text-text-muted mt-1">Armazenados no Supabase Storage.</p>
          </div>
        </Card>
        <Card title="Recortes RAG (Chunks)" icon={<Sparkles className="h-5 w-5 text-accent" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">141</span>
            <p className="text-xs text-text-muted mt-1">Vetores indexados via pgvector.</p>
          </div>
        </Card>
        <Card title="Isolação Multi-Tenant" icon={<FileText className="h-5 w-5 text-warning" />}>
          <div className="mt-2">
            <span className="text-sm font-semibold text-text-primary block">3 Categorias Isoladas</span>
            <p className="text-xs text-text-muted mt-1">Acesso segmentado via RLS por Tenant.</p>
          </div>
        </Card>
      </div>

      {/* List Container */}
      <div className="glass-card p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Evidências Indexadas</h2>
          {/* Search */}
          <div className="relative w-full max-w-xs">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-text-muted" />
            </div>
            <input
              type="text"
              placeholder="Buscar documento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-border-glass bg-white/5 py-2 pl-9 pr-4 text-sm text-text-primary outline-none transition-all duration-300 focus:border-primary/50"
            />
          </div>
        </div>

        {/* Table list */}
        <div className="divide-y divide-white/5">
          {filtered.map((doc) => (
            <div key={doc.id} className="flex flex-col py-4 gap-3 md:flex-row md:items-center md:justify-between hover:bg-white/[0.01] px-2 rounded-lg transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
                  <FileText className="h-5 w-5 text-text-muted" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="font-medium text-text-primary text-sm">{doc.title}</h3>
                  <p className="text-xs text-text-muted">
                    {doc.size} • Enviado em {formatDate(doc.uploadedAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 self-end md:self-auto">
                <Badge variant="neutral">{doc.category}</Badge>
                <Badge variant={doc.status === "indexed" ? "success" : "warning"} dot>
                  {doc.status === "indexed" ? "Indexado RAG" : "Processando..."}
                </Badge>
                <span className="text-xs text-text-muted font-mono">{doc.chunks} chunks</span>
                <button
                  className="rounded-lg p-1.5 text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  aria-label="Deletar documento"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center py-6 text-sm text-text-muted">Nenhum documento encontrado.</p>
          )}
        </div>
      </div>
    </div>
  );
}
