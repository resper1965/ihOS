"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ProductVersion } from "@/lib/supabase/types";

interface VersionContextType {
  versions: ProductVersion[];
  activeVersion: ProductVersion | null; // null means "Organizacional / Global SGSI"
  setActiveVersion: (version: ProductVersion | null) => void;
  isLoading: boolean;
}

const VersionContext = createContext<VersionContextType | undefined>(undefined);

export function VersionProvider({ children }: { children: React.ReactNode }) {
  const [versions, setVersions] = useState<ProductVersion[]>([]);
  const [activeVersion, setActiveVersionState] = useState<ProductVersion | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchVersions() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("product_versions")
          .select("*")
          .order("version_code", { ascending: false });

        if (error) throw error;

        const fetchedVersions = data || [];
        setVersions(fetchedVersions);

        // 1. Check localStorage for user override
        const storedVersionId = localStorage.getItem("ihos_active_version_id");
        if (storedVersionId) {
          const matched = fetchedVersions.find((v) => v.id === storedVersionId);
          if (matched) {
            setActiveVersionState(matched);
            setIsLoading(false);
            return;
          } else if (storedVersionId === "global") {
            setActiveVersionState(null);
            setIsLoading(false);
            return;
          }
        }

        // 2. Fetch server-side default from agent_org_state
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
            setIsLoading(false);
            return;
          }
        }

        // 3. Fallback: first active version
        const active = fetchedVersions.find((v) => v.status === "active") || fetchedVersions[0] || null;
        setActiveVersionState(active);
      } catch (err) {
        console.error("[VersionContext] Error fetching versions:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchVersions();
  }, []);

  const setActiveVersion = (version: ProductVersion | null) => {
    setActiveVersionState(version);
    if (version) {
      localStorage.setItem("ihos_active_version_id", version.id);
    } else {
      localStorage.setItem("ihos_active_version_id", "global");
    }
  };

  return (
    <VersionContext.Provider value={{ versions, activeVersion, setActiveVersion, isLoading }}>
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
