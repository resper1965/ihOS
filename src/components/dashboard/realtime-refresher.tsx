"use client";

import { useRouter } from "next/navigation";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";

/**
 * A zero-markup client component that listens to Postgres changes
 * on key compliance tables and triggers router.refresh() to update
 * the Server Component's data in real-time.
 */
export function RealtimeRefresher() {
  const router = useRouter();

  useRealtimeSync("evidence_evaluations", () => {
    router.refresh();
  });

  useRealtimeSync("intelligence_snapshots", () => {
    router.refresh();
  });

  useRealtimeSync("compliance_assessments", () => {
    router.refresh();
  });

  useRealtimeSync("compliance_documents", () => {
    router.refresh();
  });

  return null;
}
