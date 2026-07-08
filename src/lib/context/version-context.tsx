"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ProductVersion } from "@/lib/supabase/types";
import { useVersions } from "@/hooks/queries/use-versions";

/** Commercial context (NPR v3 Moment 1, variable 2). null = "All channels" —
 *  an internal aggregate view that must never produce a customer-facing
 *  answer (surfaces that answer customers ask for the channel explicitly). */
export type SalesChannel = "B2B_GEHC" | "B2B_DIRECT";

const CHANNEL_STORAGE_KEY = "ihos_active_sales_channel";

interface VersionContextType {
  versions: ProductVersion[];
  activeVersion: ProductVersion | null; // null means "Organizacional / Global SGSI"
  setActiveVersion: (version: ProductVersion | null) => void;
  /** Global commercial context — the second axis of the Context Bar */
  salesChannel: SalesChannel | null;
  setSalesChannel: (channel: SalesChannel | null) => void;
  isLoading: boolean;
}

const VersionContext = createContext<VersionContextType | undefined>(undefined);

export function VersionProvider({ children }: { children: React.ReactNode }) {
  const { data: versionsData = [], isLoading: isQueryLoading } = useVersions();
  const versions = versionsData as unknown as ProductVersion[];
  
  const [activeVersion, setActiveVersionState] = useState<ProductVersion | null>(null);
  // Lazy init restores the persisted commercial context (guarded for SSR).
  const [salesChannel, setSalesChannelState] = useState<SalesChannel | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = window.localStorage.getItem(CHANNEL_STORAGE_KEY);
    return stored === "B2B_GEHC" || stored === "B2B_DIRECT" ? stored : null;
  });
  const [isInit, setIsInit] = useState(false);
  const [isLoadingDefault, setIsLoadingDefault] = useState(true);

  useEffect(() => {
    if (isQueryLoading) return;
    if (isInit) {
      // Ensure activeVersion is still valid if versions updated
      if (activeVersion && !versions.find(v => v.id === activeVersion.id)) {
        setActiveVersionState(null);
      }
      return;
    }

    async function initActiveVersion() {
      try {
        const fetchedVersions = versions;
        
        // 1. Check localStorage for user override
        const storedVersionId = localStorage.getItem("ihos_active_version_id");
        if (storedVersionId) {
          const matched = fetchedVersions.find((v) => v.id === storedVersionId);
          if (matched) {
            setActiveVersionState(matched);
            setIsInit(true);
            setIsLoadingDefault(false);
            return;
          } else if (storedVersionId === "global") {
            setActiveVersionState(null);
            setIsInit(true);
            setIsLoadingDefault(false);
            return;
          }
        }

        // 2. Fetch server-side default from agent_org_state
        const supabase = createClient();
        const { data: defaultState } = await supabase
          .from("agent_org_state")
          .select("state_value")
          .eq("state_key", "default_product_version_id")
          .limit(1)
          .single();

        if (defaultState?.state_value) {
          const defaultVersion = fetchedVersions.find(
            (v) => v.id === defaultState.state_value
          );
          if (defaultVersion) {
            setActiveVersionState(defaultVersion);
            setIsInit(true);
            setIsLoadingDefault(false);
            return;
          }
        }

        // 3. Fallback: first active version
        const active = fetchedVersions.find((v) => v.status === "active") || fetchedVersions[0] || null;
        setActiveVersionState(active);
        setIsInit(true);
      } catch (err) {
        console.error("[VersionContext] Error initializing active version:", err);
      } finally {
        setIsLoadingDefault(false);
      }
    }

    initActiveVersion();
  }, [isQueryLoading, versions, isInit, activeVersion]);

  const setActiveVersion = (version: ProductVersion | null) => {
    setActiveVersionState(version);
    if (version) {
      localStorage.setItem("ihos_active_version_id", version.id);
    } else {
      localStorage.setItem("ihos_active_version_id", "global");
    }
  };

  const setSalesChannel = (channel: SalesChannel | null) => {
    setSalesChannelState(channel);
    if (channel) {
      localStorage.setItem(CHANNEL_STORAGE_KEY, channel);
    } else {
      localStorage.removeItem(CHANNEL_STORAGE_KEY);
    }
  };

  const isLoading = isQueryLoading || isLoadingDefault;

  return (
    <VersionContext.Provider
      value={{ versions, activeVersion, setActiveVersion, salesChannel, setSalesChannel, isLoading }}
    >
      {children}
    </VersionContext.Provider>
  );
}

export function useVersion() {
  const context = useContext(VersionContext);
  if (context === undefined) {
    throw new Error("useVersion must be used within a VersionProvider");
  }
  return context;
}
