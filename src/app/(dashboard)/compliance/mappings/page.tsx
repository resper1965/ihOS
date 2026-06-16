"use client";

import React, { useState, useEffect } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageTitleRegistrar } from "@/components/dashboard/page-title-registrar";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

interface MappingItem {
  id: number;
  framework_code: string;
  target_control_id: string;
  scf_control_code: string;
  synced_at: string | null;
  scf_controls?: {
    control_name: string;
    description: string;
  } | null;
}

export default function MappingsPage() {
  const [mappings, setMappings] = useState<MappingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  
  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const supabase = createClient() as any;

  const fetchMappings = async () => {
    setLoading(true);
    try {
      // Query scf_framework_mappings and join scf_controls
      const { data, error } = await supabase
        .from("scf_framework_mappings")
        .select(`
          id,
          framework_code,
          target_control_id,
          scf_control_code,
          synced_at,
          scf_controls:scf_control_code (
            control_name,
            description
          )
        `);

      if (error) throw error;
      setMappings(data || []);
    } catch (err) {
      console.error("Error fetching mappings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  // Sync handler
  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/compliance/mappings/sync", {
        method: "POST",
        headers: { "Accept": "application/json" },
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Servidor retornou ${res.status} — rota de sync não encontrada. Verifique o deploy.`);
      }

      const data = await res.json();
      if (data.success) {
        setSyncResult({
          success: true,
          message: `Sincronização concluída! ${data.controls_synced} controles do SCF atualizados para a versão ${data.scf_version}.`
        });
        fetchMappings();
      } else {
        setSyncResult({
          success: false,
          message: `Erro: ${data.error}`
        });
      }
    } catch (err) {
      setSyncResult({
        success: false,
        message: err instanceof Error ? err.message : "Erro de rede ao conectar com o serviço de sincronização."
      });
    } finally {
      setSyncing(false);
    }
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
        throw new Error(`Servidor retornou ${res.status} — rota de upload não encontrada. Verifique o deploy.`);
      }

      const data = await res.json();

      if (data.success) {
        setUploadResult({
          success: true,
          message: `Sucesso! Importados ${data.imported_count} mapeamentos de controles com sucesso.`
        });
        setUploadFile(null);
        fetchMappings();
      } else {
        setUploadResult({
          success: false,
          message: `Erro na importação: ${data.error}`
        });
      }
    } catch (err) {
      setUploadResult({
        success: false,
        message: err instanceof Error ? err.message : "Erro de rede ao enviar o arquivo."
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
        title="Mapeamento GRC / SCF"
        subtitle="Sincronize e gerencie controles do Secure Controls Framework com seus frameworks de compliance."
        icon={<Database className="h-4 w-4 text-cyan-400" />}
      />
      <div className="flex justify-end">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => setIsUploadOpen(true)}
            icon={<Upload className="h-4 w-4" />}
          >
            Importar Mapeamentos
          </Button>
          <Button
            variant="primary"
            onClick={handleSync}
            disabled={syncing}
            icon={<RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />}
          >
            {syncing ? "Sincronizando..." : "Sincronizar SCF"}
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
            <p className="font-semibold">{syncResult.success ? "Sincronização OK" : "Falha na Sincronização"}</p>
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
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
            <Database className="h-6 w-6" />
          </div>
          <div>
            <p className="text-2xl font-bold text-text-primary">{mappings.length}</p>
            <p className="text-xs text-text-muted">Total de Controles Mapeados</p>
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
            <p className="text-xs text-text-muted">Frameworks Correlacionados</p>
          </div>
        </div>

        <div className="glass-card flex items-center gap-4 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
            <RefreshCw className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">SCF v2026.1</p>
            <p className="text-xs text-text-muted">Motor GRC Ativo</p>
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
          <Input
            type="text"
            placeholder="Buscar controle ou mapeamento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Grid of Mappings */}
      {loading ? (
        <div className="glass-card p-12 text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-text-secondary">Carregando catálogo de mapeamento...</p>
        </div>
      ) : filteredMappings.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-text-muted" />
          <p className="mt-4 text-sm font-semibold text-text-primary">Nenhum mapeamento encontrado</p>
          <p className="mt-1 text-xs text-text-secondary">Tente alterar os termos de busca ou filtros.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/5 bg-white/5">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/5 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  <th className="px-6 py-4">Framework</th>
                  <th className="px-6 py-4">ID do Controle</th>
                  <th className="px-6 py-4">Mapeado para SCF</th>
                  <th className="px-6 py-4">Descrição do Controle SCF</th>
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
                        {item.scf_controls?.control_name || "Mapeamento Pendente"}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary line-clamp-2">
                        {item.scf_controls?.description || "Sem descrição disponível."}
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
        title="Importar Mapeamentos Customizados"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleUploadSubmit} className="space-y-6 mt-4">
          <div className="rounded-xl border-2 border-dashed border-white/10 p-8 text-center transition-colors hover:border-primary/50 relative">
            <input
              type="file"
              accept=".csv,.json"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <FileSpreadsheet className="mx-auto h-10 w-10 text-text-muted" />
            <p className="mt-3 text-sm font-semibold text-text-primary">
              {uploadFile ? uploadFile.name : "Arraste ou clique para selecionar"}
            </p>
            <p className="mt-1 text-xs text-text-secondary">Suporta arquivos CSV ou JSON contendo colunas/chaves</p>
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
              Fechar
            </Button>
            <Button type="submit" variant="primary" disabled={!uploadFile || uploading}>
              {uploading ? "Importando..." : "Importar"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
