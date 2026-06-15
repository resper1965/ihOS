"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { FileText, Upload, Trash2, Search, Sparkles, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { ComplianceDocument } from "@/lib/supabase/types";

// ── Types ────────────────────────────────────────────────────────────────────

type UploadState = "idle" | "uploading" | "processing" | "done" | "error";

interface UploadStatus {
  state: UploadState;
  message?: string;
  fileName?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ state: "idle" });
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // ── Data fetching ──────────────────────────────────────────────────────
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("compliance_documents")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[documents] Fetch error:", error.message);
        setDocuments([]);
      } else {
        setDocuments(data ?? []);
      }
    } catch (err) {
      console.error("[documents] Unexpected error:", err);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Upload handler ─────────────────────────────────────────────────────
  async function handleUpload(file: File) {
    setUploadStatus({ state: "uploading", fileName: file.name });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "ISMS_CORE");

      setUploadStatus({ state: "processing", fileName: file.name, message: "Extraindo texto e gerando embeddings..." });

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        setUploadStatus({
          state: "error",
          fileName: file.name,
          message: result.error || "Falha no upload.",
        });
        return;
      }

      setUploadStatus({
        state: "done",
        fileName: file.name,
        message: `${result.data.chunkCount} chunks indexados com sucesso.`,
      });

      // Refresh data after successful upload
      await fetchDocuments();

      // Auto-clear success message after 4 seconds
      setTimeout(() => setUploadStatus({ state: "idle" }), 4000);
    } catch (err) {
      setUploadStatus({
        state: "error",
        fileName: file.name,
        message: err instanceof Error ? err.message : "Erro inesperado no upload.",
      });
    }
  }

  function handleFileSelect() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
      // Reset input so the same file can be re-uploaded
      e.target.value = "";
    }
  }

  // ── Delete handler ─────────────────────────────────────────────────────
  async function handleDelete(docId: number) {
    if (deletingId) return; // Prevent double-delete

    setDeletingId(docId);
    try {
      const { error } = await supabase
        .from("compliance_documents")
        .delete()
        .eq("id", docId);

      if (error) {
        console.error("[documents] Delete error:", error.message);
        alert("Falha ao deletar documento.");
      } else {
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
      }
    } catch (err) {
      console.error("[documents] Delete failed:", err);
      alert("Erro inesperado ao deletar.");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Derived data ───────────────────────────────────────────────────────
  const filtered = documents.filter((doc) => {
    const q = search.toLowerCase();
    return (
      (doc.filename?.toLowerCase().includes(q) ?? false) ||
      (doc.title?.toLowerCase().includes(q) ?? false) ||
      (doc.category?.toLowerCase().includes(q) ?? false)
    );
  });

  const totalChunks = documents.reduce((sum, d) => sum + (d.total_chunks ?? 0), 0);
  const uniqueCategories = new Set(documents.map((d) => d.category).filter(Boolean));

  // ── Upload status banner ───────────────────────────────────────────────
  function renderUploadBanner() {
    if (uploadStatus.state === "idle") return null;

    const statusConfig = {
      uploading: {
        icon: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
        bg: "bg-primary/5 border-primary/20",
        text: `Enviando "${uploadStatus.fileName}"...`,
      },
      processing: {
        icon: <Loader2 className="h-4 w-4 animate-spin text-amber-400" />,
        bg: "bg-amber-500/5 border-amber-500/20",
        text: uploadStatus.message ?? "Processando...",
      },
      done: {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
        bg: "bg-emerald-500/5 border-emerald-500/20",
        text: uploadStatus.message ?? "Upload concluído!",
      },
      error: {
        icon: <AlertCircle className="h-4 w-4 text-red-400" />,
        bg: "bg-red-500/5 border-red-500/20",
        text: uploadStatus.message ?? "Erro no upload.",
      },
    };

    const cfg = statusConfig[uploadStatus.state];
    return (
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${cfg.bg}`}>
        {cfg.icon}
        <span className="text-text-primary">{cfg.text}</span>
        {uploadStatus.state === "error" && (
          <button
            onClick={() => setUploadStatus({ state: "idle" })}
            className="ml-auto text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Fechar
          </button>
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-8">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md,.csv"
        onChange={handleFileChange}
        className="hidden"
      />

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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={fetchDocuments}
            loading={loading}
          >
            Atualizar
          </Button>
          <Button
            variant="primary"
            icon={<Upload className="h-4 w-4" />}
            onClick={handleFileSelect}
            loading={uploadStatus.state === "uploading" || uploadStatus.state === "processing"}
          >
            Carregar Arquivo
          </Button>
        </div>
      </div>

      {/* Upload status banner */}
      {renderUploadBanner()}

      {/* Stats Summary */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card title="Documentos Totais" icon={<FileText className="h-5 w-5 text-primary" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{documents.length}</span>
            <p className="text-xs text-text-muted mt-1">Armazenados no Supabase Storage.</p>
          </div>
        </Card>
        <Card title="Recortes RAG (Chunks)" icon={<Sparkles className="h-5 w-5 text-accent" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{totalChunks}</span>
            <p className="text-xs text-text-muted mt-1">Vetores indexados via pgvector.</p>
          </div>
        </Card>
        <Card title="Isolação Multi-Tenant" icon={<FileText className="h-5 w-5 text-warning" />}>
          <div className="mt-2">
            <span className="text-sm font-semibold text-text-primary block">
              {uniqueCategories.size} Categorias Isoladas
            </span>
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

        {/* Loading state */}
        {loading && documents.length === 0 && (
          <div className="flex items-center justify-center py-12 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-text-muted">Carregando documentos...</span>
          </div>
        )}

        {/* Table list */}
        {(!loading || documents.length > 0) && (
          <div className="divide-y divide-white/5">
            {filtered.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-col py-4 gap-3 md:flex-row md:items-center md:justify-between hover:bg-white/[0.01] px-2 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
                    <FileText className="h-5 w-5 text-text-muted" />
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="font-medium text-text-primary text-sm">
                      {doc.title || doc.filename}
                    </h3>
                    <p className="text-xs text-text-muted">
                      {formatFileSize(doc.file_size_bytes)} • Enviado em {formatDate(doc.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 self-end md:self-auto">
                  {doc.category && (
                    <Badge variant="neutral">{doc.category}</Badge>
                  )}
                  <Badge
                    variant={(doc.total_chunks ?? 0) > 0 ? "success" : "warning"}
                    dot
                  >
                    {(doc.total_chunks ?? 0) > 0 ? "Indexado RAG" : "Processando..."}
                  </Badge>
                  <span className="text-xs text-text-muted font-mono">
                    {doc.total_chunks ?? 0} chunks
                  </span>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    disabled={deletingId === doc.id}
                    className="rounded-lg p-1.5 text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-40"
                    aria-label="Deletar documento"
                  >
                    {deletingId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
            {!loading && filtered.length === 0 && (
              <p className="text-center py-6 text-sm text-text-muted">Nenhum documento encontrado.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
