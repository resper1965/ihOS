"use client";

// Second axis of the Context Bar (NPR v3 Moment 1): the commercial context.
// Ionic's privacy role differs per channel (via GEHC ≈ processor/operadora;
// direct ≈ controller/controladora), so the selection travels with every
// analysis surface. "All channels" is an internal aggregate view only.

import { useState, useRef, useEffect } from "react";
import { useVersion, type SalesChannel } from "@/lib/context/version-context";
import { ChevronDown, Handshake } from "lucide-react";

const CHANNEL_OPTIONS: Array<{
  value: SalesChannel | null;
  label: string;
  role: string;
  description: string;
}> = [
  {
    value: null,
    label: "All channels",
    role: "Internal aggregate",
    description: "Aggregated internal view — never used for customer-facing answers.",
  },
  {
    value: "B2B_GEHC",
    label: "B2B via GEHC",
    role: "Ionic as processor / operadora",
    description: "GEHC contractual overlay (DPAs, MSAs) and processor-role obligations.",
  },
  {
    value: "B2B_DIRECT",
    label: "B2B Direct",
    role: "Ionic as controller / controladora",
    description: "Direct-sale contractual overlay and controller-role obligations.",
  },
];

export function ChannelSwitcher() {
  const { salesChannel, setSalesChannel } = useVersion();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const current = CHANNEL_OPTIONS.find((o) => o.value === salesChannel) ?? CHANNEL_OPTIONS[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 rounded-xl border border-border-glass bg-bg-card/80 px-3 py-1.5 text-xs font-semibold text-text-primary transition-all hover:bg-bg-card hover:border-primary/50 shadow-sm backdrop-blur-sm"
        aria-label="Select sales channel"
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-accent/20">
          <Handshake className="h-3.5 w-3.5 text-accent stroke-[1.5]" />
        </div>
        <div className="flex flex-col items-start leading-tight">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Commercial Scope</span>
          <span className="font-medium truncate max-w-[120px] text-text-primary">{current.label}</span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-text-muted stroke-[1.5] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-border-glass bg-bg-card/95 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200 text-text-primary">
          <div className="border-b border-border-glass px-4 py-2.5 bg-black/5 dark:bg-white/5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Select Commercial Context</h4>
            <p className="text-[10px] text-text-muted mt-0.5">
              Ionic&apos;s privacy role differs per channel — overlays are never mixed.
            </p>
          </div>

          <div className="p-1 space-y-1">
            {CHANNEL_OPTIONS.map((option) => {
              const isActive = option.value === salesChannel;
              return (
                <button
                  key={option.label}
                  onClick={() => {
                    setSalesChannel(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                    isActive
                      ? "bg-primary/20 text-primary"
                      : "text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 hover:text-text-primary"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span>{option.label}</span>
                    <span className="rounded bg-black/5 dark:bg-white/10 px-1 py-0.5 text-[8px] uppercase tracking-wider text-text-muted">
                      {option.role}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-muted">{option.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
