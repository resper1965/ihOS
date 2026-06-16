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

      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .single();

      // If column doesn't exist or is null, treat as incomplete
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isComplete = (profile as any)?.onboarding_completed === true;
      setCompleted(isComplete);
    } catch {
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
      await supabase
        .from("profiles")
        .update({ onboarding_completed: true } as any)
        .eq("id", user.id);
    } catch {
      // Silent — column may not exist, completed state is already set in memory
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
