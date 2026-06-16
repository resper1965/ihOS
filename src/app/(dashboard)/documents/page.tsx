"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { 
  FileText, Upload, Trash2, Search, Sparkles, Loader2, 
  CheckCircle2, AlertCircle, RefreshCw, Calendar, Layers, 
  ShieldCheck, Check, ArrowLeft, X 
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useVersion } from "@/lib/context/version-context";
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

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { versions, activeVersion, isLoading: versionsLoading } = useVersion();
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  
  // Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [docCategory, setDocCategory] = useState<"ISMS_CORE" | "B2B_GEHC" | "OPERATIONAL">("ISMS_CORE");
  const [docScope, setDocScope] = useState<"global" | "version">("global");
  const [targetVersionId, setTargetVersionId] = useState<string>("");
  const [docVersion, setDocVersion] = useState("1.0");
  const [docStatus, setDocStatus] = useState<"draft" | "published" | "superseded" | "expired">("published");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clarityReport, setClarityReport] = useState<any>(null);
  
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ state: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // Initialize version selection to active version or first version
  useEffect(() => {
    if (versions.length > 0) {
      setTargetVersionId(activeVersion?.id || versions[0].id);
    }
  }, [versions, activeVersion]);

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

  // ── Wizard Reset ───────────────────────────────────────────────────────
  const resetWizard = () => {
    setWizardStep(1);
    setDocCategory("ISMS_CORE");
    setDocScope("global");
    setDocVersion("1.0");
    setDocStatus("published");
    setExpiresAt("");
    setSelectedFile(null);
    setUploadStatus({ state: "idle" });
    setClarityReport(null);
  };

  // ── Upload handler ─────────────────────────────────────────────────────
  // ── Upload handler ─────────────────────────────────────────────────────
  async function handleUpload(force = false) {
    if (!selectedFile) return;

    setClarityReport(null);
    setUploadStatus({ 
      state: "processing", 
      fileName: selectedFile.name, 
      message: "Validando qualidade e clareza do documento..." 
    });
    setWizardStep(3); // Go to final loading step

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("category", docCategory);
      formData.append("version", docVersion);
      formData.append("status", docStatus);
      
      if (docScope === "version" && targetVersionId) {
        formData.append("productVersionId", targetVersionId);
      }
      
      if (expiresAt) {
        formData.append("expiresAt", new Date(expiresAt).toISOString());
      }

      if (force) {
        formData.append("forceIndex", "true");
      }

      // If not forcing, run validate-clarity first
      if (!force) {
        const validateRes = await fetch("/api/documents/validate-clarity", {
          method: "POST",
          body: formData,
        });
        const validateResult = await validateRes.json();
        
        if (!validateRes.ok || !validateResult.success) {
          setUploadStatus({
            state: "error",
            fileName: selectedFile.name,
            message: validateResult.error || "Falha ao validar clareza do documento.",
          });
          return;
        }

        const report = validateResult.data;
        if (report.clarityStatus === "UNCLEAR") {
          setClarityReport(report);
          setUploadStatus({ state: "idle" }); // Show options to force or cancel
          return;
        }
      }

      // If it passes (or forced), do actual upload
      setUploadStatus({ 
        state: "processing", 
        fileName: selectedFile.name, 
        message: "Clarity Gate aprovado. Extraindo texto e gerando embeddings pgvector..." 
      });

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        setUploadStatus({
          state: "error",
          fileName: selectedFile.name,
          message: result.error || "Falha no upload do arquivo.",
        });
        return;
      }

      setUploadStatus({
        state: "done",
        fileName: selectedFile.name,
        message: `${result.data.chunkCount} chunks indexados com sucesso no banco RAG!`,
      });

      // Refresh data
      await fetchDocuments();

      // Close modal after success
      setTimeout(() => {
        setIsWizardOpen(false);
        resetWizard();
      }, 3000);
    } catch (err) {
      setUploadStatus({
        state: "error",
        fileName: selectedFile.name,
        message: err instanceof Error ? err.message : "Erro inesperado no upload.",
      });
    }
  }

  function handleFileSelectClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  }

  // ── Delete handler ─────────────────────────────────────────────────────
  async function handleDelete(docId: number) {
    if (deletingId) return; // Prevent double-delete

    const confirmDelete = window.confirm("Deseja realmente deletar este documento e todos os seus chunks vetoriais do RAG?");
    if (!confirmDelete) return;

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
    const matchesSearch = (
      (doc.filename?.toLowerCase().includes(q) ?? false) ||
      (doc.title?.toLowerCase().includes(q) ?? false) ||
      (doc.category?.toLowerCase().includes(q) ?? false)
    );
    
    // Filter view by active version if selected
    if (activeVersion) {
      // Show global documents OR documents matched to the active version
      return matchesSearch && (doc.product_version_id === null || doc.product_version_id === activeVersion.id);
    }
    
    return matchesSearch;
  });

  const totalChunks = documents.reduce((sum, d) => sum + (d.total_chunks ?? 0), 0);
  const uniqueCategories = new Set(documents.map((d) => d.category).filter(Boolean));

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

      <PageTitleRegistrar
        title="SGSI / Evidências de Segurança"
        subtitle={activeVersion
          ? `Visualizando políticas para nCommand Lite ${activeVersion.version_code} + SGSI Geral`
          : "Gerenciamento global de documentos do SGSI (ISMS) da Ionic Health"}
        icon={<FileText className="h-4 w-4 text-blue-400" />}
      />
      <div className="flex justify-end">
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
            onClick={() => {
              resetWizard();
              setIsWizardOpen(true);
            }}
          >
            Novo Documento (Wizard)
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="Documentos do SGSI" icon={<FileText className="h-5 w-5 text-blue-400" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{documents.length}</span>
            <p className="text-xs text-text-muted mt-1">Total de diretrizes e especificações.</p>
          </div>
        </Card>
        <Card title="Índice RAG (pgvector)" icon={<Sparkles className="h-5 w-5 text-emerald-400" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{totalChunks}</span>
            <p className="text-xs text-text-muted mt-1">Parágrafos indexados para IA do chat.</p>
          </div>
        </Card>
        <Card title="Escopo Ativo" icon={<Layers className="h-5 w-5 text-purple-400" />}>
          <div className="mt-2">
            <span className="text-sm font-semibold text-text-primary block truncate">
              {activeVersion ? `nCommand Lite ${activeVersion.version_code}` : "SGSI Geral (Global)"}
            </span>
            <p className="text-xs text-text-muted mt-1">Filtrando documentos aplicáveis.</p>
          </div>
        </Card>
      </div>

      {/* List Container */}
      <div className="glass-card p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Diretrizes e Arquivos do SGSI</h2>
          {/* Search */}
          <div className="relative w-full max-w-xs">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-text-muted" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nome ou categoria..."
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

        {/* List of files */}
        {(!loading || documents.length > 0) && (
          <div className="divide-y divide-white/5">
            {filtered.map((doc) => {
              const matchedVersion = versions.find((v) => v.id === doc.product_version_id);
              const isExpiredDoc = isExpired(doc.expires_at);

              return (
                <div
                  key={doc.id}
                  className="flex flex-col py-4 gap-4 md:flex-row md:items-center md:justify-between hover:bg-white/[0.01] px-3 rounded-xl transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
                      <FileText className="h-5 w-5 text-slate-400" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-text-primary text-sm leading-tight">
                          {doc.title || doc.filename}
                        </h3>
                        <Badge variant="neutral" className="text-[10px] px-1.5 font-mono">
                          v{doc.version}
                        </Badge>
                        {matchedVersion ? (
                          <Badge variant="info" className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            nCommand Lite {matchedVersion.version_code}
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="text-[10px] bg-white/5 text-slate-300">
                            Organizacional / Global
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-text-muted">
                        {formatFileSize(doc.file_size_bytes)} • Indexado RAG: {doc.total_chunks ?? 0} chunks • Criado em {formatDate(doc.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-auto flex-wrap">
                    {/* Status Badge */}
                    {doc.status === "published" && (
                      <Badge variant="success" className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Ativo / Publicado
                      </Badge>
                    )}
                    {doc.status === "draft" && (
                      <Badge variant="neutral" className="text-[10px] font-medium">
                        Rascunho
                      </Badge>
                    )}
                    {doc.status === "superseded" && (
                      <Badge variant="warning" className="text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Substituído
                      </Badge>
                    )}
                    {doc.status === "expired" || isExpiredDoc ? (
                      <Badge variant="danger" className="text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse">
                        Expirado / Vencido
                      </Badge>
                    ) : null}

                    {/* Expiration date */}
                    {doc.expires_at && (
                      <span className={`text-xs flex items-center gap-1 font-medium ${isExpiredDoc ? "text-red-400" : "text-slate-400"}`}>
                        <Calendar className="h-3.5 w-3.5" />
                        venc: {formatDate(doc.expires_at)}
                      </span>
                    )}

                    {/* Category */}
                    {doc.category && (
                      <span className="text-xs text-slate-500 font-mono bg-white/5 rounded px-2 py-0.5 border border-white/5">
                        {doc.category}
                      </span>
                    )}

                    {/* Delete action */}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-40"
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
              );
            })}
            {!loading && filtered.length === 0 && (
              <div className="text-center py-12 text-sm text-text-secondary">
                Nenhum documento encontrado para o escopo ou busca atual.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Upload Wizard Modal ──────────────────────────────────────────────── */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-card w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#1e293b] shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                  <ShieldCheck className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Indexação de Diretriz do SGSI</h3>
                  <p className="text-[10px] text-text-muted">Safety Gate: Metadados obrigatórios para evitar erros de RAG.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsWizardOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Steps Indicator */}
            <div className="flex items-center justify-center border-b border-white/5 px-6 py-3 bg-white/[0.01]">
              <div className="flex items-center gap-2 text-xs">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full font-bold ${wizardStep >= 1 ? "bg-blue-500 text-white" : "bg-white/5 text-slate-500"}`}>1</span>
                <span className={wizardStep >= 1 ? "text-blue-400 font-semibold" : "text-slate-500"}>Escopo</span>
                <div className={`h-px w-8 bg-white/10 ${wizardStep >= 2 ? "bg-blue-500/40" : ""}`} />
                <span className={`flex h-5 w-5 items-center justify-center rounded-full font-bold ${wizardStep >= 2 ? "bg-blue-500 text-white" : "bg-white/5 text-slate-500"}`}>2</span>
                <span className={wizardStep >= 2 ? "text-blue-400 font-semibold" : "text-slate-500"}>Validade</span>
                <div className={`h-px w-8 bg-white/10 ${wizardStep >= 3 ? "bg-blue-500/40" : ""}`} />
                <span className={`flex h-5 w-5 items-center justify-center rounded-full font-bold ${wizardStep >= 3 ? "bg-blue-500 text-white" : "bg-white/5 text-slate-500"}`}>3</span>
                <span className={wizardStep >= 3 ? "text-blue-400 font-semibold" : "text-slate-500"}>Upload</span>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* STEP 1: Scope */}
              {wizardStep === 1 && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Classificação do Documento</label>
                    <select
                      value={docCategory}
                      onChange={(e) => setDocCategory(e.target.value as any)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm text-white outline-none focus:border-blue-500/50"
                    >
                      <option value="ISMS_CORE" className="bg-[#1e293b]">ISMS Core (Políticas de Organização)</option>
                      <option value="B2B_GEHC" className="bg-[#1e293b]">B2B Overlay (Auditorias de Clientes - ex: GEHC)</option>
                      <option value="OPERATIONAL" className="bg-[#1e293b]">Operational (Procedimentos Técnicos Diários)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Escopo de Aplicação</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setDocScope("global")}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                          docScope === "global"
                            ? "bg-blue-500/10 border-blue-500 text-white"
                            : "bg-white/5 border-white/5 text-slate-400 hover:border-white/10"
                        }`}
                      >
                        <ShieldCheck className="h-5 w-5 text-blue-400" />
                        <span className="font-semibold text-xs">SGSI Geral</span>
                        <span className="text-[9px] text-text-muted">Aplica-se a toda organização</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDocScope("version")}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                          docScope === "version"
                            ? "bg-blue-500/10 border-blue-500 text-white"
                            : "bg-white/5 border-white/5 text-slate-400 hover:border-white/10"
                        }`}
                      >
                        <Layers className="h-5 w-5 text-blue-400" />
                        <span className="font-semibold text-xs">Especificação Técnica</span>
                        <span className="text-[9px] text-text-muted">Restrito à versão do produto</span>
                      </button>
                    </div>
                  </div>

                  {docScope === "version" && (
                    <div className="space-y-1.5 pt-1 animate-in slide-in-from-top-2 duration-200">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Versão Alvo (nCommand Lite)</label>
                      <select
                        value={targetVersionId}
                        onChange={(e) => setTargetVersionId(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm text-white outline-none focus:border-blue-500/50"
                      >
                        {versions.map((v) => (
                          <option key={v.id} value={v.id} className="bg-[#1e293b]">
                            {v.product_name} {v.version_code}
                          </option>
                        ))}
                      </select>
                      <div className="rounded-xl bg-blue-500/5 border border-blue-500/10 p-3 text-xs text-blue-400 flex gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>
                          <strong>Atenção:</strong> Documentos específicos são isolados no RAG. O chat de IA usará estes dados apenas para auditar a versão selecionada.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: Expiration and Lifecycle */}
              {wizardStep === 2 && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Versão do Documento</label>
                      <input
                        type="text"
                        placeholder="Ex: 1.0 ou 2.1"
                        value={docVersion}
                        onChange={(e) => setDocVersion(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm text-white outline-none focus:border-blue-500/50 font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Estado de Publicação</label>
                      <select
                        value={docStatus}
                        onChange={(e) => setDocStatus(e.target.value as any)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm text-white outline-none focus:border-blue-500/50"
                      >
                        <option value="published" className="bg-[#1e293b]">Ativo (Publicado no RAG)</option>
                        <option value="draft" className="bg-[#1e293b]">Rascunho (Não indexa no RAG)</option>
                        <option value="superseded" className="bg-[#1e293b]">Substituído (Histórico)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Data de Expiração/Revisão Anual</label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <Calendar className="h-4 w-4 text-text-muted" />
                      </div>
                      <input
                        type="date"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white outline-none focus:border-blue-500/50"
                      />
                    </div>
                    <p className="text-[10px] text-text-muted mt-1">O sistema enviará alertas automáticos no dashboard na data definida.</p>
                  </div>

                  <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-3 text-xs text-amber-400 flex gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                      <strong>Nota de Ciclo de Vida:</strong> Se você estiver atualizando uma política antiga, certifique-se de marcar a anterior como <strong>Substituída (Superseded)</strong> na listagem para que a IA não leia diretrizes em conflito.
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 3: File Upload & Progress */}
              {wizardStep === 3 && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  {uploadStatus.state === "idle" ? (
                    <div className="space-y-4">
                      {clarityReport ? (
                        /* Render Clarity Gate report */
                        <div className="space-y-4 animate-in fade-in duration-200">
                          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 flex gap-3">
                            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                            <div className="text-left">
                              <h4 className="font-bold text-red-400 text-sm">Alerta do Clarity Gate</h4>
                              <p className="text-xs text-slate-300 mt-1">
                                O documento possui problemas de qualidade epistêmica ou alegações não comprovadas. Recomendamos corrigi-los antes de indexar.
                              </p>
                            </div>
                          </div>

                          <div className="max-h-[250px] overflow-y-auto divide-y divide-white/5 space-y-3 pr-2">
                            {clarityReport.issues.map((issue: any, index: number) => (
                              <div key={index} className="pt-3 first:pt-0 space-y-1 text-left">
                                <div className="flex items-center justify-between">
                                  <Badge variant="danger" className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20">
                                    {issue.severity} • {issue.code}
                                  </Badge>
                                  <span className="text-[10px] text-slate-500 font-mono">{issue.location}</span>
                                </div>
                                <p className="text-xs text-text-primary font-medium">{issue.message}</p>
                                <p className="text-[11px] text-emerald-400 bg-emerald-500/5 rounded p-1.5 border border-emerald-500/10">
                                  <strong>Sugestão:</strong> {issue.fix}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* Normal review & dropzone */
                        <>
                          {/* Configuration Review Table */}
                          <div className="rounded-xl bg-white/5 border border-white/5 p-4 text-xs space-y-2">
                            <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">Revisão dos Metadados</h4>
                            <div className="grid grid-cols-2 gap-2 text-slate-300">
                              <div><span className="text-text-muted">Categoria:</span> {docCategory}</div>
                              <div><span className="text-text-muted">Versão:</span> v{docVersion}</div>
                              <div>
                                <span className="text-text-muted">Escopo:</span>{" "}
                                {docScope === "global" ? "Organizacional Global" : "Específico de Versão"}
                              </div>
                              {docScope === "version" && (
                                <div>
                                  <span className="text-text-muted">nCommand Lite:</span>{" "}
                                  {versions.find((v) => v.id === targetVersionId)?.version_code}
                                </div>
                              )}
                              <div>
                                <span className="text-text-muted">Validade:</span>{" "}
                                {expiresAt ? formatDate(expiresAt) : "Sem expiração"}
                              </div>
                              <div>
                                <span className="text-text-muted">Status RAG:</span>{" "}
                                {docStatus === "published" ? "Publicado / Ativo" : "Não indexar"}
                              </div>
                            </div>
                          </div>

                          {/* Dropzone */}
                          <div
                            onClick={handleFileSelectClick}
                            className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 hover:border-blue-500/50 rounded-2xl p-8 cursor-pointer transition-all bg-white/[0.01] hover:bg-white/[0.02] text-center"
                          >
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 mb-3">
                              <Upload className="h-6 w-6 text-blue-400" />
                            </div>
                            {selectedFile ? (
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-white truncate max-w-[300px]">
                                  {selectedFile.name}
                                </p>
                                <p className="text-xs text-text-muted">
                                  {formatFileSize(selectedFile.size)} • Pronto para indexar
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-white">Selecionar documento</p>
                                <p className="text-xs text-text-muted">PDF, TXT, MD, CSV (Max 20MB)</p>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    /* In progress animation block */
                    <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
                      {uploadStatus.state === "uploading" && (
                        <>
                          <Loader2 className="h-10 w-10 animate-spin text-primary" />
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-white">Enviando arquivo...</p>
                            <p className="text-xs text-text-muted">Gravando metadados no Supabase Storage.</p>
                          </div>
                        </>
                      )}
                      {uploadStatus.state === "processing" && (
                        <>
                          <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-white">Processando documento...</p>
                            <p className="text-xs text-amber-400">{uploadStatus.message}</p>
                          </div>
                        </>
                      )}
                      {uploadStatus.state === "done" && (
                        <>
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                            <Check className="h-6 w-6 text-emerald-400" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-white">Indexação Concluída!</p>
                            <p className="text-xs text-emerald-400">{uploadStatus.message}</p>
                          </div>
                        </>
                      )}
                      {uploadStatus.state === "error" && (
                        <>
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                            <AlertCircle className="h-6 w-6 text-red-400" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-red-400">Falha na Indexação</p>
                            <p className="text-xs text-text-muted">{uploadStatus.message}</p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-white/10 px-6 py-4 flex items-center justify-between bg-white/[0.01]">
              <div>
                {wizardStep > 1 && uploadStatus.state === "idle" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ArrowLeft className="h-4 w-4" />}
                    onClick={() => setWizardStep((prev) => prev - 1)}
                  >
                    Voltar
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsWizardOpen(false)}
                  disabled={uploadStatus.state === "uploading" || uploadStatus.state === "processing"}
                >
                  Cancelar
                </Button>
                
                {wizardStep < 3 && (
                  <Button
                    variant="primary"
                    onClick={() => setWizardStep((prev) => prev + 1)}
                  >
                    Avançar
                  </Button>
                )}

                {wizardStep === 3 && uploadStatus.state === "idle" && (
                  clarityReport ? (
                    <Button
                      variant="secondary"
                      className="border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/50"
                      onClick={() => handleUpload(true)}
                    >
                      Forçar Indexação
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => handleUpload(false)}
                      disabled={!selectedFile}
                    >
                      Iniciar Indexação
                    </Button>
                  )
                )}

                {uploadStatus.state === "error" && (
                  <Button
                    variant="primary"
                    onClick={() => setUploadStatus({ state: "idle" })}
                  >
                    Tentar Novamente
                  </Button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
