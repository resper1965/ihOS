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

    const confirmDelete = window.confirm("Are you sure you want to delete this document and all its vector chunks from the RAG?");
    if (!confirmDelete) return;

    setDeletingId(docId);
    try {
      const { error } = await supabase
        .from("compliance_documents")
        .delete()
        .eq("id", docId);

      if (error) {
        console.error("[documents] Delete error:", error.message);
        alert("Failed to delete document.");
      } else {
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
      }
    } catch (err) {
      console.error("[documents] Delete failed:", err);
      alert("Unexpected error while deleting.");
    } finally {
      setDeletingId(null);
    }
  };

  const totalChunks = documents.reduce((sum, d) => sum + (d.total_chunks ?? 0), 0);

  return (
    <div className="w-full space-y-8">
      <PageTitleRegistrar
        title="ISMS / Security Evidence"
        subtitle={activeVersion
          ? `Viewing policies for nCommand Lite ${activeVersion.version_code} + ISMS Global`
          : "Global document management for Ionic Health ISMS"}
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
            Refresh
          </Button>
          <Button
            variant="primary"
            icon={<Upload className="h-4 w-4" />}
            onClick={() => setIsWizardOpen(true)}
          >
            Upload Document
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="ISMS Documents" icon={<FileText className="h-5 w-5 text-blue-400" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{documents.length}</span>
            <p className="text-xs text-text-muted mt-1">Total guidelines and specifications.</p>
          </div>
        </Card>
        <Card title="RAG Index (pgvector)" icon={<Sparkles className="h-5 w-5 text-emerald-400" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{totalChunks}</span>
            <p className="text-xs text-text-muted mt-1">Indexed paragraphs for chat AI.</p>
          </div>
        </Card>
        <Card title="Active Scope" icon={<Layers className="h-5 w-5 text-purple-400" />}>
          <div className="mt-2">
            <span className="text-sm font-semibold text-text-primary block truncate">
              {activeVersion ? `nCommand Lite ${activeVersion.version_code}` : "Global ISMS"}
            </span>
            <p className="text-xs text-text-muted mt-1">Filtering applicable documents.</p>
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
