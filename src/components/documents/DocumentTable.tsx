import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { Search, Loader2, FileText, Calendar, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ComplianceDocument } from "@/lib/supabase/types";
import { DOCUMENT_TYPES } from "@/lib/supabase/types-custom";

interface DocumentTableProps {
  documents: ComplianceDocument[];
  loading: boolean;
  versions: any[];
  activeVersion: any | null;
  onDelete: (id: number) => Promise<void>;
  deletingId: number | null;
  onRefresh?: () => void;
}

export function DocumentTable({ documents, loading, versions, activeVersion, onDelete, deletingId, onRefresh }: DocumentTableProps) {
  const [search, setSearch] = useState("");
  const { success, error: toastError } = useToast();
  const [reindexingId, setReindexingId] = useState<number | null>(null);
  const [updatingVersionId, setUpdatingVersionId] = useState<number | null>(null);
  const [updatingTypeId, setUpdatingTypeId] = useState<number | null>(null);

  const unclassifiedCount = documents.filter((d) => d.doc_type === "UNCLASSIFIED").length;

  const handleDocTypeChange = async (docId: number, newType: string) => {
    setUpdatingTypeId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_type: newType }),
      });
      if (!res.ok) throw new Error("Failed to update document type");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error("[doc-type-update]", err);
    } finally {
      setUpdatingTypeId(null);
    }
  };

  const handleVersionChange = async (docId: number, newVersionId: string | null) => {
    setUpdatingVersionId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_version_id: newVersionId }),
      });
      if (!res.ok) throw new Error("Failed to update version");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error("[version-update]", err);
    } finally {
      setUpdatingVersionId(null);
    }
  };

  const handleReindex = async (docId: number) => {
    if (reindexingId) return;
    setReindexingId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}/reindex`, { method: "POST" });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to re-index");
      }
      success("Document re-indexed successfully!");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error("[reindex]", err);
      toastError("Failed to re-index document", err.message);
    } finally {
      setReindexingId(null);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "2-digit", year: "numeric",
    });
  };

  const isExpired = (dateStr: string | null) => {
    if (!dateStr) return false;
    return new Date(dateStr).getTime() < Date.now();
  };

  const filtered = documents.filter((doc) => {
    const q = search.toLowerCase();
    const matchesSearch = (
      (doc.filename?.toLowerCase().includes(q) ?? false) ||
      (doc.title?.toLowerCase().includes(q) ?? false) ||
      (doc.category?.toLowerCase().includes(q) ?? false)
    );
    
    return matchesSearch;
  });

  return (
    <div className="glass-card p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-text-primary">ISMS Guidelines and Files</h2>
        <div className="relative w-full max-w-xs">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-text-muted" />
          </div>
          <input
            type="text"
            placeholder="Search by name or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search by name or category"
            className="w-full rounded-xl border border-border-glass bg-white/5 py-2 pl-9 pr-4 text-sm text-text-primary outline-none transition-all duration-300 focus:border-primary/50"
          />
        </div>
      </div>

      {unclassifiedCount > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs text-text-secondary leading-relaxed">
            <span className="font-semibold text-amber-400">{unclassifiedCount} document(s) unclassified.</span>{" "}
            Set each document&apos;s type below so the right analysis consumes it — the
            threat-modeling checklist and assessment phases select documents by type.
          </p>
        </div>
      )}

      {loading && documents.length === 0 && (
        <div className="flex items-center justify-center py-12 gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-text-muted">Loading documents...</span>
        </div>
      )}

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
                      <select
                        value={doc.product_version_id ?? "global"}
                        onChange={(e) => {
                          const val = e.target.value === "global" ? null : e.target.value;
                          handleVersionChange(doc.id, val);
                        }}
                        disabled={updatingVersionId === doc.id}
                        className="text-[10px] rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-text-secondary cursor-pointer hover:bg-white/10 transition-colors focus:border-primary/40 focus:outline-none appearance-none dark:[color-scheme:dark] [&>option]:bg-bg-card [&>option]:text-text-primary"
                        title="Assign document version"
                      >
                        <option value="global" className="bg-bg-card text-text-primary">🌐 Global / Organizacional</option>
                        {versions.map((v) => (
                          <option key={v.id} value={v.id} className="bg-bg-card text-text-primary">
                            📦 {v.product_name} {v.version_code}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-text-muted">
                      {formatFileSize(doc.file_size_bytes)} • RAG Indexed: {doc.total_chunks ?? 0} chunks • Created at {formatDate(doc.created_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end md:self-auto flex-wrap">
                  {doc.status === "published" && (
                    <Badge variant="success" className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Active / Published
                    </Badge>
                  )}
                  {doc.status === "draft" && (
                    <Badge variant="neutral" className="text-[10px] font-medium">
                      Draft
                    </Badge>
                  )}
                  {doc.status === "superseded" && (
                    <Badge variant="warning" className="text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Superseded
                    </Badge>
                  )}
                  {(doc.status === "expired" || isExpiredDoc) ? (
                    <Badge variant="danger" className="text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse">
                      Expired
                    </Badge>
                  ) : null}

                  {doc.expires_at && (
                    <span className={`text-xs flex items-center gap-1 font-medium ${isExpiredDoc ? "text-red-400" : "text-slate-400"}`}>
                      <Calendar className="h-3.5 w-3.5" />
                      exp: {formatDate(doc.expires_at)}
                    </span>
                  )}

                  {doc.category && (
                    <span className="text-xs text-slate-500 font-mono bg-white/5 rounded px-2 py-0.5 border border-white/5">
                      {doc.category}
                    </span>
                  )}

                  <select
                    value={doc.doc_type in DOCUMENT_TYPES ? doc.doc_type : "UNCLASSIFIED"}
                    onChange={(e) => handleDocTypeChange(doc.id, e.target.value)}
                    disabled={updatingTypeId === doc.id}
                    className={`text-[10px] rounded-lg border px-2 py-0.5 cursor-pointer transition-colors focus:outline-none appearance-none dark:[color-scheme:dark] [&>option]:bg-bg-card [&>option]:text-text-primary ${
                      doc.doc_type === "UNCLASSIFIED"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15 focus:border-amber-500/60"
                        : "border-white/10 bg-white/5 text-text-secondary hover:bg-white/10 focus:border-primary/40"
                    }`}
                    title="Document type — decides which analysis consumes this document"
                  >
                    {Object.entries(DOCUMENT_TYPES).map(([value, label]) => (
                      <option key={value} value={value} className="bg-bg-card text-text-primary">
                        {value === "UNCLASSIFIED" ? "⚠️ " : ""}{label}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => handleReindex(doc.id)}
                    disabled={reindexingId === doc.id || deletingId === doc.id}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-40"
                    title="Re-index (Generate Embeddings)"
                    aria-label="Re-index document"
                  >
                    {reindexingId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </button>

                  <button
                    onClick={() => onDelete(doc.id)}
                    disabled={deletingId === doc.id || reindexingId === doc.id}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-40"
                    title="Delete document"
                    aria-label="Delete document"
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
              No documents found for the current scope or search.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
