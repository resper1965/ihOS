"use client";

import { useState, useEffect, useCallback } from "react";
import { FileDown, Calendar, Search, Sparkles, Loader2, FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";

interface Report {
  id: string;
  title: string;
  framework: string;
  createdAt: string;
  type: string;
  status: "ready" | "generating";
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState("");

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch("/api/compliance/report?list=true");
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setReports(json.data);
        }
      }
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Set up realtime sync for intelligence_snapshots table
  useRealtimeSync("intelligence_snapshots", () => {
    fetchReports();
  });

  const handleGenerateReport = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/compliance/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          frameworkCode: "ISO-27001",
          title: `Relatório de Gap Analysis ISO-27001 - ${new Date().toLocaleDateString("pt-BR")}`,
        }),
      });

      if (res.ok) {
        await fetchReports();
      }
    } catch (error) {
      console.error("Error generating report:", error);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadExcel = (id: string) => {
    window.open(`/api/compliance/report/${id}/export`, "_blank");
  };

  const handlePrintPDF = (id: string) => {
    window.open(`/reports/${id}/print`, "_blank");
  };

  const filtered = reports.filter((rep) =>
    rep.title.toLowerCase().includes(search.toLowerCase()) ||
    rep.framework.toLowerCase().includes(search.toLowerCase())
  );

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            Relatórios de Conformidade
          </h1>
          <p className="mt-1 text-text-secondary">
            Gere, visualize e baixe relatórios detalhados gerados pela inteligência GRC.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={handleGenerateReport}
          disabled={generating}
          icon={generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        >
          {generating ? "Gerando..." : "Gerar Novo Relatório"}
        </Button>
      </div>

      {/* Reports List */}
      <div className="glass-card p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Relatórios Disponíveis</h2>
          {/* Search */}
          <div className="relative w-full max-w-xs">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-text-muted" />
            </div>
            <input
              type="text"
              placeholder="Buscar relatório..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-border-glass bg-white/5 py-2 pl-9 pr-4 text-sm text-text-primary outline-none transition-all duration-300 focus:border-primary/50"
            />
          </div>
        </div>

        {/* List items */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-text-muted">Carregando relatórios...</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((rep) => (
              <div key={rep.id} className="flex flex-col py-4 gap-3 md:flex-row md:items-center md:justify-between hover:bg-white/[0.01] px-2 rounded-lg transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
                    <Calendar className="h-5 w-5 text-text-muted" />
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="font-medium text-text-primary text-sm">{rep.title}</h3>
                    <p className="text-xs text-text-muted">
                      {rep.framework} • {rep.type}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 self-end md:self-auto">
                  <span className="text-xs text-text-muted">Geração: {formatDate(rep.createdAt)}</span>
                  <Badge variant={rep.status === "ready" ? "success" : "warning"} dot>
                    {rep.status === "ready" ? "Disponível" : "Gerando..."}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownloadExcel(rep.id)}
                      disabled={rep.status !== "ready"}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border-glass bg-white/5 px-3 py-1.5 text-xs text-text-secondary transition-all hover:bg-white/10 hover:border-primary/40 disabled:opacity-40"
                      aria-label="Download Excel"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
                      Excel
                    </button>
                    <button
                      onClick={() => handlePrintPDF(rep.id)}
                      disabled={rep.status !== "ready"}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border-glass bg-white/5 px-3 py-1.5 text-xs text-text-secondary transition-all hover:bg-white/10 hover:border-primary/40 disabled:opacity-40"
                      aria-label="Download PDF"
                    >
                      <FileDown className="h-3.5 w-3.5 text-primary" />
                      PDF
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center py-6 text-sm text-text-muted">Nenhum relatório encontrado.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
