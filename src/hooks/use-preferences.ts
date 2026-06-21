"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface UserPreferences {
  emailNotifications: boolean;
  complianceAlerts: boolean;
  darkMode: boolean;
}

const DEFAULTS: UserPreferences = {
  emailNotifications: true,
  complianceAlerts: true,
  darkMode: true,
};

interface UsePreferencesResult {
  prefs: UserPreferences;
  setPref: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => Promise<void>;
  isSaving: boolean;
  isLoading: boolean;
}

export function usePreferences(): UsePreferencesResult {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const supabase = createClient();

  // ── Load from Supabase on mount ──────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("preferences")
          .eq("id", user.id)
          .single();

        if (profile?.preferences && typeof profile.preferences === "object") {
          const loadedPrefs = { ...DEFAULTS, ...(profile.preferences as Partial<UserPreferences>) };
          setPrefs(loadedPrefs);
          localStorage.setItem("darkMode", String(loadedPrefs.darkMode));

          if (typeof document !== "undefined") {
            const html = document.documentElement;
            if (loadedPrefs.darkMode) {
              html.classList.add("dark");
              html.classList.remove("light");
            } else {
              html.classList.add("light");
              html.classList.remove("dark");
            }
          }
        }
      } catch {
        // Graceful fallback to defaults
      } finally {
        setIsLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Optimistic setter with API sync ─────────────────────────────────────
  const setPref = useCallback(
    async <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      // Optimistic update
      setPrefs((prev) => {
        const next = { ...prev, [key]: value };
        if (key === "darkMode") {
          localStorage.setItem("darkMode", String(value));
          if (typeof document !== "undefined") {
            const html = document.documentElement;
            if (value) {
              html.classList.add("dark");
              html.classList.remove("light");
            } else {
              html.classList.add("light");
              html.classList.remove("dark");
            }
          }
        }
        return next;
      });
      setIsSaving(true);

      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: value }),
        });

        if (!res.ok) {
          const ct = res.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            const err = await res.json();
            throw new Error(err.error ?? "Failed to save preference");
          }
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        // Revert optimistic update on failure
        setPrefs((prev) => {
          const reverted = { ...prev, [key]: !value };
          if (key === "darkMode") {
            const revertedVal = !value;
            localStorage.setItem("darkMode", String(revertedVal));
            if (typeof document !== "undefined") {
              const html = document.documentElement;
              if (revertedVal) {
                html.classList.add("dark");
                html.classList.remove("light");
              } else {
                html.classList.add("light");
                html.classList.remove("dark");
              }
            }
          }
          return reverted;
        });
        console.error("[Preferences] Save failed:", err);
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  return { prefs, setPref, isSaving, isLoading };
}
