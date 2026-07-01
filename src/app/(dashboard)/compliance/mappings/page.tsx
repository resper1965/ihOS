"use client";

import React, { useState } from "react";
import { 
  Database, 
  RefreshCw, 
  Upload, 
  Search, 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  FileSpreadsheet,
  X
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useGrcMappings, useSyncMappings, grcMappingKeys } from "@/hooks/queries/use-grc-mappings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { Dialog } from "@/components/ui/dialog";

export default function MappingsPage() {
  const queryClient = useQueryClient();

  // ── React Query hooks ──────────────────────────────────────────────────────
  const { data: mappings = [], isLoading: loading } = useGrcMappings();
  const syncMutation = useSyncMappings();

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);

  // Sync handler
  const handleSync = () => {
    setSyncResult(null);
    syncMutation.mutate(undefined, {
      onSuccess: (data) => {
        setSyncResult({
          success: true,
          message: `Synchronization complete! ${data.controls_synced} SCF controls updated to version ${data.scf_version}.`
        });
      },
      onError: (err) => {
        setSyncResult({
          success: false,
          message: err instanceof Error ? err.message : "Network error connecting to sync service."
        });
      },
    });
  };

  // Upload handler
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);

      const res = await fetch("/api/compliance/mappings/upload", {
        method: "POST",
        headers: { "Accept": "application/json" },
        body: formData
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Server returned ${res.status} — upload route not found. Check deployment.`);
      }

      const data = await res.json();

      if (data.success) {
        setUploadResult({
          success: true,
          message: `Success! Imported ${data.imported_count} control mappings successfully.`
        });
        setUploadFile(null);
        queryClient.invalidateQueries({ queryKey: grcMappingKeys.lists() });
      } else {
        setUploadResult({
          success: false,
          message: `Import error: ${data.error}`
        });
      }
    } catch (err) {
      setUploadResult({
        success: false,
        message: err instanceof Error ? err.message : "Network error uploading file."
      });
    } finally {
      setUploading(false);
    }
  };

  // Filter and search logic
  const frameworks = ["ALL", ...Array.from(new Set(mappings.map(m => m.framework_code)))];

  const filteredMappings = mappings.filter(m => {
    const matchesTab = activeTab === "ALL" || m.framework_code === activeTab;
    const matchesSearch = 
      m.framework_code.toLowerCase().includes(search.toLowerCase()) ||
      m.target_control_id.toLowerCase().includes(search.toLowerCase()) ||
      m.scf_control_code.toLowerCase().includes(search.toLowerCase()) ||
      (m.scf_controls?.control_name || "").toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div className="w-full space-y-8">
      <PageTitleRegistrar
        title="GRC / SCF Mapping"
        subtitle="Synchronize and manage Secure Controls Framework controls with your compliance frameworks."
        icon={<Database className="h-4 w-4 text-cyan-400" />}
      />
      <div className="flex justify-end">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => setIsUploadOpen(true)}
            icon={<Upload className="h-4 w-4" />}
          >
            Import Mappings
          </Button>
          <Button
            id="mappings-sync-button"
            variant="primary"
            onClick={handleSync}
            disabled={syncMutation.isPending}
            icon={<RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />}
          >
            {syncMutation.isPending ? "Synchronizing..." : "Synchronize SCF"}
          </Button>
        </div>
      </div>

      {/* Sync Status Alert */}
      {syncResult && (
        <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
          syncResult.success 
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" 
            : "border-red-500/30 bg-red-500/10 text-red-400"
        }`}>
          {syncResult.success ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
          <div className="flex-1">
            <p className="font-semibold">{syncResult.success ? "Sync Successful" : "Sync Failed"}</p>
            <p className="mt-0.5 text-xs text-text-secondary">{syncResult.message}</p>
          </div>
          <button onClick={() => setSyncResult(null)} className="text-text-muted hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="glass-card flex items-center gap-4 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Database className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xl font-bold text-text-primary">{mappings.length}</p>
            <p className="text-xs text-text-muted">Total Mapped Controls</p>
          </div>
        </div>

        <div className="glass-card flex items-center gap-4 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xl font-bold text-text-primary">
              {new Set(mappings.map(m => m.framework_code)).size}
            </p>
            <p className="text-xs text-text-muted">Correlated Frameworks</p>
          </div>
        </div>

        <div className="glass-card flex items-center gap-4 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
            <RefreshCw className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">SCF v2026.1</p>
            <p className="text-xs text-text-muted">Active GRC Engine</p>
          </div>
        </div>
      </div>

      {/* Filter and search bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/5 bg-white/5 p-1">
          {frameworks.map((fw) => (
            <button
              key={fw}
              onClick={() => setActiveTab(fw)}
              className={`rounded-lg px-4 py-2 text-xs font-medium transition-all duration-300 ${
                activeTab === fw
                  ? "bg-primary text-white shadow-md shadow-primary/20"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
              }`}
            >
              {fw}
            </button>
          ))}
        </div>

        <div className="relative max-w-sm w-full">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-text-muted" />
          </div>
          <input
            id="mappings-search-input"
            type="text"
            placeholder="Search control or mapping..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-full rounded-xl border border-border-glass bg-black/[0.03] dark:bg-white/5 px-4 py-2.5 text-sm text-text-primary outline-none transition-all duration-300 placeholder:text-text-muted focus:border-primary/50 focus:bg-transparent dark:focus:bg-transparent focus:ring-2 focus:ring-primary/20 hover:border-border-glass-hover"
          />
        </div>
      </div>

      {/* Grid of Mappings */}
      {loading ? (
        <div className="glass-card p-12 text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-text-secondary">Loading mapping catalog...</p>
        </div>
      ) : filteredMappings.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-text-muted" />
          <p className="mt-4 text-sm font-semibold text-text-primary">No mappings found</p>
          <p className="mt-1 text-xs text-text-secondary">Try changing search terms or filters.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/5 bg-white/5">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/5 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  <th className="px-6 py-4">Framework</th>
                  <th className="px-6 py-4">Control ID</th>
                  <th className="px-6 py-4">Mapped to SCF</th>
                  <th className="px-6 py-4">SCF Control Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {filteredMappings.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-6 py-4">
                       <Badge variant="info" className="font-semibold">{item.framework_code}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono font-medium text-text-primary">
                      {item.target_control_id}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-2">
                        <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
                        <Badge variant="success" className="font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {item.scf_control_code}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-md">
                      <p className="font-medium text-text-primary">
                        {item.scf_controls?.control_name || "Pending Mapping"}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary line-clamp-2">
                        {item.scf_controls?.description || "No description available."}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog 
        open={isUploadOpen} 
        onClose={() => {
          setIsUploadOpen(false);
          setUploadFile(null);
          setUploadResult(null);
        }}
        title="Import Custom Mappings"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleUploadSubmit} className="space-y-6 mt-4">
          <div className="rounded-xl border-2 border-dashed border-white/10 p-8 text-center transition-colors hover:border-primary/50 relative">
            <input
              type="file"
              accept=".csv,.json"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Select mapping file"
            />
            <FileSpreadsheet className="mx-auto h-10 w-10 text-text-muted" />
            <p className="mt-3 text-sm font-semibold text-text-primary">
              {uploadFile ? uploadFile.name : "Drag or click to select"}
            </p>
            <p className="mt-1 text-xs text-text-secondary">Supports CSV or JSON files containing columns/keys</p>
            <p className="text-[10px] text-text-muted font-mono mt-0.5">framework_code, target_control_id, scf_control_code</p>
          </div>

          {uploadResult && (
            <div className={`flex items-start gap-2 rounded-xl p-3 text-xs ${
              uploadResult.success 
                ? "bg-emerald-500/10 text-emerald-400" 
                : "bg-red-500/10 text-red-400"
            }`}>
              {uploadResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              <span>{uploadResult.message}</span>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => {
              setIsUploadOpen(false);
              setUploadFile(null);
              setUploadResult(null);
            }}>
              Close
            </Button>
            <Button type="submit" variant="primary" disabled={!uploadFile || uploading}>
              {uploading ? "Importing..." : "Import"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
