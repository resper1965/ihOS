// src/hooks/queries/use-scrms.ts
// React Query hooks for the SCRMS (Supply Chain Risk Management System) page.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------
export const scrmsKeys = {
  all: ["scrms"] as const,
  data: (vendorId?: string | null) => [...scrmsKeys.all, "data", vendorId ?? "product"] as const,
};

// ---------------------------------------------------------------------------
// Types (inferred from API response)
// ---------------------------------------------------------------------------
export interface ScrmsBaseline {
  id: string;
  version_code: string;
  product_version_id: string;
  total_controls: number;
  accepted_controls: number;
  rejected_controls: number;
  pending_controls: number;
  created_at: string;
  vendor_name?: string | null;
}

export interface ScrmsControl {
  id: string;
  baseline_id: string;
  scf_control_code: string;
  control_name: string;
  control_description: string;
  pptdf_category: string;
  risk_level: string;
  status: "pending" | "accepted" | "rejected";
  rejection_rationale?: string;
  is_applicable: boolean;
  decision_date?: string;
}

export interface ScrmsStats {
  total: number;
  accepted: number;
  rejected: number;
  pending: number;
}

export interface ProductDelta {
  id: string;
  type: string;
  description: string;
  version_code: string;
}

export interface IsmsStats {
  totalPolicies: number;
  approvedPolicies: number;
  pendingPolicies: number;
}

export interface ScrmsData {
  baseline: ScrmsBaseline | null;
  controls: ScrmsControl[];
  stats: ScrmsStats | null;
  deltas: ProductDelta[];
  ismsStats: IsmsStats | null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Fetch all SCRMS data in one query (baseline + controls + stats) */
export function useScrmsData(vendorId?: string | null) {
  return useQuery<ScrmsData>({
    queryKey: scrmsKeys.data(vendorId),
    queryFn: async () => {
      const url = vendorId ? `/api/compliance/scrms?vendorId=${vendorId}` : "/api/compliance/scrms";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load SCRMS data");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load SCRMS data");
      return {
        baseline: data.baseline ?? null,
        controls: data.controls ?? [],
        stats: data.stats ?? null,
        deltas: data.deltas ?? [],
        ismsStats: data.ismsStats ?? null,
      };
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Recalibrate SCRMS baseline */
export function useRecalibrate(vendorId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation<void, Error>({
    mutationFn: async () => {
      const res = await fetch("/api/compliance/scrms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to recalibrate");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scrmsKeys.all });
    },
  });
}

/** Accept a SCRMS control */
export function useAcceptControl() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (controlId: string) => {
      const res = await fetch(`/api/compliance/scrms/controls/${controlId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });
      if (!res.ok) throw new Error("Failed to accept control");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scrmsKeys.all });
    },
  });
}

/** Reject a SCRMS control with rationale */
export function useRejectControl() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { controlId: string; rationale: string }>({
    mutationFn: async ({ controlId, rationale }) => {
      const res = await fetch(`/api/compliance/scrms/controls/${controlId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", rejection_rationale: rationale }),
      });
      if (!res.ok) throw new Error("Failed to reject control");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scrmsKeys.all });
    },
  });
}
