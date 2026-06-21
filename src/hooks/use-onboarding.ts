"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface OnboardingState {
  completed: boolean;
  currentStep: number;
  isLoading: boolean;
  markComplete: () => Promise<void>;
  setStep: (step: number) => void;
  dismiss: () => void;
}

/**
 * Tracks onboarding completion via profiles.onboarding_completed column.
 * Falls back gracefully if column doesn't exist (new installs).
 */
export function useOnboarding(): OnboardingState {
  const [completed, setCompleted] = useState(true); // default true to avoid flash
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const checkOnboarding = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setCompleted(true);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching onboarding status:", error);
        setCompleted(true);
        return;
      }

      // If profile doesn't exist, it means the profile is not created yet.
      // Treat as incomplete (new user) to prompt onboarding.
      if (!profile) {
        setCompleted(false);
      } else {
        setCompleted(profile.onboarding_completed === true);
      }
    } catch (err) {
      console.error("Onboarding check exception:", err);
      // Column may not exist yet — treat as completed to avoid blocking users
      setCompleted(true);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    checkOnboarding();
  }, [checkOnboarding]);

  const markComplete = useCallback(async () => {
    setCompleted(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      
      // Check if profile exists first to prevent overwriting roles/status
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ onboarding_completed: true })
          .eq("id", user.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("profiles")
          .insert({ 
            id: user.id, 
            role: "ionic_user",
            status: "pending",
            client_org: null,
            preferences: {},
            onboarding_completed: true 
          });
        if (insertError) throw insertError;
      }
    } catch (err) {
      console.error("Failed to persist onboarding status:", err);
      // Silent — completed state is already set in memory
    }
  }, [supabase]);

  const dismiss = useCallback(() => {
    setCompleted(true); // dismiss without persisting
  }, []);

  return {
    completed,
    currentStep,
    isLoading,
    markComplete,
    setStep: setCurrentStep,
    dismiss,
  };
}
