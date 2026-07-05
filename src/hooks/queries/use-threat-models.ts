import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { ThreatModelSummary, ThreatModelRecord, ThreatModelStatus } from "@/lib/supabase/types";

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

const ThreatModelSummarySchema = z.object({
  id: z.string(),
  model_id: z.string(),
  product_version: z.string(),
  status: z.enum(["draft", "reviewed", "approved", "rejected"]).catch("draft"),
  threat_count: z.number(),
  gap_count: z.number(),
  recommendation_count: z.number(),
  avg_rpn: z.number(),
  created_at: z.string(),
});

const ThreatModelsResponseSchema = z.object({
  models: z.array(ThreatModelSummarySchema).default([]),
});

const ThreatModelRecordSchema = z.object({
  id: z.string(),
  data: z.any(),
  created_at: z.string(),
  updated_at: z.string().nullable().optional(),
  // F-series top-level columns for versioning and status mapping
  product_version: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  target_frameworks: z.array(z.string()).nullable().optional(),
  source: z.string().nullable().optional(),
  baseline_model_id: z.string().nullable().optional(),
}).passthrough();

const ThreatModelDetailResponseSchema = z.object({
  model: ThreatModelRecordSchema.nullable().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export const queryKeys = {
  all: ["threat-models"] as const,
  lists: () => [...queryKeys.all, "list"] as const,
  details: () => [...queryKeys.all, "detail"] as const,
  detail: (id: string) => [...queryKeys.details(), id] as const,
};

export function useThreatModels() {
  return useQuery({
    queryKey: queryKeys.lists(),
    queryFn: async () => {
      const res = await fetch("/api/threat-modeling");
      if (!res.ok) throw new Error("Failed to fetch threat models");
      const json = await res.json();
      
      // Validate with Zod
      const parsed = ThreatModelsResponseSchema.parse(json);
      return parsed.models as ThreatModelSummary[];
    },
  });
}

export function useThreatModel(id: string) {
  return useQuery({
    queryKey: queryKeys.detail(id),
    queryFn: async () => {
      const res = await fetch(`/api/threat-modeling/${id}`);
      if (!res.ok) throw new Error("Threat model not found");
      const json = await res.json();
      
      // Validate with Zod
      const parsed = ThreatModelDetailResponseSchema.parse(json);
      return (parsed.model ?? null) as ThreatModelRecord | null;
    },
    enabled: !!id,
  });
}

export function useUpdateThreatModelStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status, comment }: { id: string; status: ThreatModelStatus; comment: string }) => {
      const res = await fetch(`/api/threat-modeling/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment }),
      });
      if (!res.ok) throw new Error("Review submission failed");
      return res.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate both list and detail queries
      queryClient.invalidateQueries({ queryKey: queryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.detail(variables.id) });
    },
  });
}
