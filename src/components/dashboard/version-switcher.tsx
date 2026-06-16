"use client";

import { useState, useRef, useEffect } from "react";
import { useVersion } from "@/lib/context/version-context";
import { ChevronDown, Layers, HelpCircle, ShieldAlert } from "lucide-react";
import type { ProductVersion } from "@/lib/supabase/types";

export function VersionSwitcher() {
  const { versions, activeVersion, setActiveVersion, isLoading } = useVersion();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isLoading) {
    return (
      <div className="h-9 w-44 animate-pulse rounded-xl bg-white/5" />
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Current Version Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-white/10 hover:border-blue-500/30"
        aria-label="Selecionar versão do produto"
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
          <Layers className="h-3.5 w-3.5 text-blue-400" />
        </div>
        <div className="flex flex-col items-start leading-tight">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Escopo Técnico</span>
          <span className="font-medium truncate max-w-[120px]">
            {activeVersion ? `${activeVersion.product_name} ${activeVersion.version_code}` : "SGSI Geral / Global"}
          </span>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#1e293b]/95 shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="border-b border-white/10 px-4 py-2.5 bg-white/[0.01]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Selecionar Contexto de Auditoria</h4>
            <p className="text-[10px] text-text-muted mt-0.5">Isola as evidências de RAG e os scores da versão correspondente.</p>
          </div>

          <div className="p-1 space-y-1 max-h-80 overflow-y-auto">
            {/* Global option */}
            <button
              onClick={() => {
                setActiveVersion(null);
                setIsOpen(false);
              }}
              className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                activeVersion === null
                  ? "bg-blue-500/10 text-blue-400"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <div className="flex items-center justify-between font-semibold">
                <span>SGSI Geral / Global</span>
                <span className="rounded bg-slate-500/20 px-1 py-0.5 text-[8px] uppercase tracking-wider text-slate-300">Organização</span>
              </div>
              <p className="text-[10px] text-slate-400">Políticas corporativas de segurança (ISO 27001, RH, etc.)</p>
            </button>

            {/* List product versions */}
            {versions.map((v) => {
              const isActive = activeVersion?.id === v.id;
              const specs = v.technical_specs as Record<string, string> || {};
              const statusColors = {
                active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                supported: "bg-blue-500/20 text-blue-400 border-blue-500/30",
                deprecated: "bg-red-500/20 text-red-400 border-red-500/30",
              };

              return (
                <button
                  key={v.id}
                  onClick={() => {
                    setActiveVersion(v);
                    setIsOpen(false);
                  }}
                  className={`flex w-full flex-col gap-1.5 rounded-lg px-3 py-2.5 text-left text-xs transition-colors ${
                    isActive
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className="truncate">{v.product_name} {v.version_code}</span>
                    <span className={`rounded border px-1 py-0.2 text-[8px] uppercase tracking-wider ${statusColors[v.status] || ""}`}>
                      {v.status}
                    </span>
                  </div>
                  {/* Technical Specifications Tooltip inline */}
                  <div className="rounded bg-black/30 p-1.5 text-[9px] text-slate-400 space-y-0.5 border border-white/5">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Deploy:</span>
                      <span className="text-slate-300 font-mono truncate max-w-[120px]">{specs.architecture || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Banco:</span>
                      <span className="text-slate-300 font-mono truncate max-w-[120px]">{specs.database || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Auth:</span>
                      <span className="text-slate-300 font-mono truncate max-w-[120px]">{specs.auth || "N/A"}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
