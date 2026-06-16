"use client";

import { useOnboarding } from "@/hooks/use-onboarding";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

/**
 * Drop-in client component for server pages.
 * Renders the onboarding wizard when the user hasn't completed onboarding.
 */
export function OnboardingGate() {
  const { completed, isLoading, markComplete, dismiss } = useOnboarding();

  if (isLoading || completed) return null;

  return <OnboardingWizard onComplete={markComplete} onDismiss={dismiss} />;
}
