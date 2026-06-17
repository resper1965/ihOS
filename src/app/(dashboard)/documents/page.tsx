"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Upload, Sparkles, Layers, RefreshCw, Globe, Box, Handshake } from "lucide-react";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useVersion } from "@/lib/context/version-context";
import type { ComplianceDocument } from "@/lib/supabase/types";

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
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<DocTab>("all");
  
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

  // Filter documents by active tab
  const filteredByTab = documents.filter((doc) => {
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

  const totalChunks = documents.reduce((sum, d) => sum + (d.total_chunks ?? 0), 0);
  const globalCount = documents.filter(d => d.product_version_id === null && d.category !== "B2B_GEHC" && d.category !== "B2B_DIRECT").length;
  const productCount = documents.filter(d => d.product_version_id !== null).length;
  const b2bCount = documents.filter(d => d.category === "B2B_GEHC" || d.category === "B2B_DIRECT").length;

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
        <Card title="ISMS Documents" icon={<FileText className="h-5 w-5 text-primary" />}>
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

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/5 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === tab.key
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-slate-400 hover:text-slate-300 hover:bg-white/5 border border-transparent"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            <span className={`ml-1 text-[10px] font-mono px-1 py-0.5 rounded ${
              activeTab === tab.key ? "bg-primary/20 text-primary" : "bg-white/5 text-slate-500"
            }`}>
              {tab.key === "all" ? documents.length : tab.key === "global" ? globalCount : tab.key === "product" ? productCount : b2bCount}
            </span>
          </button>
        ))}
      </div>

      {/* Extracted Document Table Component */}
      <DocumentTable 
        documents={filteredByTab}
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
