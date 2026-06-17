"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Upload, Sparkles, Layers, RefreshCw } from "lucide-react";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useVersion } from "@/lib/context/version-context";
import type { ComplianceDocument } from "@/lib/supabase/types";

// Extracted Components
import { UploadWizard } from "@/components/documents/UploadWizard";
import { DocumentTable } from "@/components/documents/DocumentTable";

export default function DocumentsPage() {
  const { versions, activeVersion } = useVersion();
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  
  // Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const supabase = createClient();

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

  const handleDelete = async (docId: number) => {
    if (deletingId) return;

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
  };

  const totalChunks = documents.reduce((sum, d) => sum + (d.total_chunks ?? 0), 0);

  return (
    <div className="w-full space-y-8">
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
            onClick={() => setIsWizardOpen(true)}
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

      {/* Extracted Document Table Component */}
      <DocumentTable 
        documents={documents}
        loading={loading}
        versions={versions}
        activeVersion={activeVersion}
        onDelete={handleDelete}
        deletingId={deletingId}
        onRefresh={fetchDocuments}
      />

      {/* Extracted Upload Wizard Component */}
      <UploadWizard 
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={fetchDocuments}
        versions={versions}
        activeVersion={activeVersion}
      />
    </div>
  );
}
