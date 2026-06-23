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
      <div className="h-9 w-44 animate-pulse rounded-xl bg-black/5 dark:bg-white/5" />
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Current Version Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 rounded-xl border border-border-glass bg-black/5 dark:bg-white/5 px-3 py-1.5 text-xs font-semibold text-text-primary transition-all hover:bg-black/10 dark:hover:bg-white/10 hover:border-primary/30"
        aria-label="Select product version"
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Layers className="h-3.5 w-3.5 text-primary stroke-[1.5]" />
        </div>
        <div className="flex flex-col items-start leading-tight">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Technical Scope</span>
          <span className="font-medium truncate max-w-[120px]">
            {activeVersion ? `${activeVersion.product_name} ${activeVersion.version_code}` : "General / Global ISMS"}
          </span>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-text-muted stroke-[1.5] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-border-glass bg-bg-card/95 shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="border-b border-border-glass px-4 py-2.5 bg-black/[0.01] dark:bg-white/[0.01]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Select Audit Context</h4>
            <p className="text-[10px] text-text-muted mt-0.5">Isolates RAG evidence and scores of the corresponding version.</p>
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
                  ? "bg-primary/10 text-primary"
                  : "text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 hover:text-text-primary"
              }`}
            >
              <div className="flex items-center justify-between font-semibold">
                <span>General / Global ISMS</span>
                <span className="rounded bg-slate-500/10 dark:bg-slate-500/20 px-1 py-0.5 text-[8px] uppercase tracking-wider text-text-muted">Organization</span>
              </div>
              <p className="text-[10px] text-text-muted">Corporate security policies (ISO 27001, HR, etc.)</p>
            </button>

            {/* List product versions */}
            {versions.map((v) => {
              const isActive = activeVersion?.id === v.id;
              const statusColors = {
                active: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                supported: "bg-primary/20 text-primary border-primary/30",
                deprecated: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
              };

              return (
                <button
                  key={v.id}
                  onClick={() => {
                    setActiveVersion(v);
                    setIsOpen(false);
                  }}
                  className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left text-xs transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 hover:text-text-primary"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className="truncate">{v.product_name} {v.version_code}</span>
                    <span className={`rounded border px-1 py-0.5 text-[8px] uppercase tracking-wider ${statusColors[v.status] || ""}`}>
                      {v.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-muted">
                    Technical documentation and evidence for this version
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
