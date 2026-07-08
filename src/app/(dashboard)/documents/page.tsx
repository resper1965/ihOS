"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Upload, Sparkles, Layers, RefreshCw, Globe, Box, Handshake } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useVersion } from "@/lib/context/version-context";
import { useDocuments, useDeleteDocument } from "@/hooks/queries/use-documents";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Extracted Components
import { UploadWizard } from "@/components/documents/UploadWizard";
import { DocumentTable } from "@/components/documents/DocumentTable";

type DocTab = "all" | "global" | "product" | "b2b";

const TABS: { key: DocTab; label: string; icon: React.ReactNode; description: string }[] = [
  { key: "all", label: "All Documents", icon: <FileText className="h-3.5 w-3.5" />, description: "Every document in the system" },
  { key: "global", label: "Global ISMS", icon: <Globe className="h-3.5 w-3.5" />, description: "Organization-wide policies" },
  { key: "product", label: "nCommand Lite", icon: <Box className="h-3.5 w-3.5" />, description: "Product-specific specs" },
  { key: "b2b", label: "Sales Channels", icon: <Handshake className="h-3.5 w-3.5" />, description: "GEHC & Direct" },
];

export default function DocumentsPage() {
  const { versions, activeVersion } = useVersion();
  const { data: documents = [], isLoading: loading, refetch } = useDocuments();
  const deleteDocument = useDeleteDocument();
  const [activeTab, setActiveTab] = useState<DocTab>("all");
  
  // Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const { success, error: toastError } = useToast();

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const deletingId = deleteDocument.isPending ? (deleteDocument.variables ?? null) : null;

  const handleDelete = async (docId: number) => {
    setConfirmDeleteId(docId);
  };

  const executeDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await deleteDocument.mutateAsync(confirmDeleteId);
      success("Document deleted successfully.");
    } catch (err) {
      console.error("[documents] Delete failed:", err);
      toastError("Failed to delete document.");
    } finally {
      setConfirmDeleteId(null);
    }
  };

  // Apply activeVersion filter first
  const versionFilteredDocs = documents.filter(doc => {
    if (activeVersion) {
      return doc.product_version_id === null || doc.product_version_id === activeVersion.id;
    }
    return true;
  });

  // Filter documents by active tab
  const filteredByTab = versionFilteredDocs.filter((doc) => {
    switch (activeTab) {
      case "global":
        return doc.product_version_id === null && doc.category !== "B2B_GEHC" && doc.category !== "B2B_DIRECT";
      case "product":
        return doc.product_version_id !== null;
      case "b2b":
        return doc.category === "B2B_GEHC" || doc.category === "B2B_DIRECT";
      default:
        return true;
    }
  });

  const totalChunks = versionFilteredDocs.reduce((sum, d) => sum + (d.total_chunks ?? 0), 0);
  const globalCount = versionFilteredDocs.filter(d => d.product_version_id === null && d.category !== "B2B_GEHC" && d.category !== "B2B_DIRECT").length;
  const productCount = versionFilteredDocs.filter(d => d.product_version_id !== null).length;
  const b2bCount = versionFilteredDocs.filter(d => d.category === "B2B_GEHC" || d.category === "B2B_DIRECT").length;

  return (
    <div className="w-full space-y-8">
      <PageTitleRegistrar
        title="ISMS / Security Evidence"
        subtitle={activeVersion
          ? `Viewing policies for nCommand Lite ${activeVersion.version_code} + ISMS Global`
          : "Global document management for Ionic Health ISMS"}
        icon={<FileText className="h-4 w-4 text-primary" />}
      />
      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => refetch()}
            loading={loading}
          >
            Refresh
          </Button>
          <Button
            id="document-upload-btn"
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
        <Card title="ISMS Documents" icon={<FileText className="h-5 w-5 text-primary" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{versionFilteredDocs.length}</span>
            <p className="text-xs text-text-muted mt-1">Total guidelines and specifications.</p>
          </div>
        </Card>
        <Card title="RAG Index (pgvector)" icon={<Sparkles className="h-5 w-5 text-emerald-400" />}>
          <div className="mt-2">
            <span className="text-3xl font-bold text-text-primary">{totalChunks}</span>
            <p className="text-xs text-text-muted mt-1">
              Indexed paragraphs for chat AI.{" "}
              <Link href="/knowledge-base" className="text-primary hover:underline">
                Index health →
              </Link>
            </p>
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

      {/* Tab Navigation */}
      <div 
        role="tablist" 
        aria-label="Filter documents by category"
        id="document-filter-tabs" 
        className="flex items-center gap-1 p-1 rounded-xl bg-black/5 dark:bg-white/[0.03] border border-border-glass w-fit"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls="document-table-view"
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === tab.key
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 border border-transparent"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            <span className={`ml-1 text-[10px] font-mono px-1 py-0.5 rounded ${
              activeTab === tab.key ? "bg-primary/20 text-primary" : "bg-white/5 text-slate-500"
            }`}>
              {tab.key === "all" ? versionFilteredDocs.length : tab.key === "global" ? globalCount : tab.key === "product" ? productCount : b2bCount}
            </span>
          </button>
        ))}
      </div>

      {/* Extracted Document Table Component */}
      <div id="document-list-table">
        <DocumentTable 
          documents={filteredByTab}
          loading={loading}
          versions={versions}
          activeVersion={activeVersion}
          onDelete={handleDelete}
          deletingId={deletingId}
          onRefresh={() => refetch()}
        />
      </div>

      {/* Extracted Upload Wizard Component */}
      <UploadWizard 
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={() => refetch()}
        versions={versions}
        activeVersion={activeVersion}
      />

      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={executeDelete}
        title="Delete Document"
        description="Are you sure you want to delete this document and all its vector chunks from the RAG? This action cannot be undone."
        variant="danger"
        isLoading={deleteDocument.isPending}
      />
    </div>
  );
}
