import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const PoamStatus = z.enum(['open', 'in_progress', 'resolved', 'risk_accepted']);
export type PoamStatus = z.infer<typeof PoamStatus>;

const PoamItemSchema = z.object({
  id: z.string(),
  assessment_id: z.string(),
  control_code: z.string().nullable().default(null),
  status: PoamStatus.nullable().default('open'),
  risk_acceptance_expires_at: z.string().nullable().default(null),
  tenant_id: z.string().nullable().default(null),
  created_at: z.string().nullable().default(null),
  updated_at: z.string().nullable().default(null),
});

export type PoamItem = z.infer<typeof PoamItemSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────────────────

export const poamKeys = {
  all: ['poam'] as const,
  lists: () => [...poamKeys.all, 'list'] as const,
  byAssessment: (id: string) => [...poamKeys.all, 'assessment', id] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lists POA&M items, optionally filtered by assessment.
 */
export function usePoamItems(assessmentId?: string) {
  return useQuery({
    queryKey: assessmentId ? poamKeys.byAssessment(assessmentId) : poamKeys.lists(),
    queryFn: async () => {
      const url = assessmentId
        ? `/api/poam?assessmentId=${encodeURIComponent(assessmentId)}`
        : '/api/poam';

      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to fetch POA&M items');
      }

      return (json.data as unknown[]).map((row) => PoamItemSchema.parse(row));
    },
    staleTime: 30_000,
  });
}

/**
 * Creates a new POA&M item from an assessment gap.
 */
export function useCreatePoamItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      assessment_id: string;
      control_code: string;
      status?: PoamStatus;
      risk_acceptance_expires_at?: string | null;
    }) => {
      const res = await fetch('/api/poam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to create POA&M item');
      }
      return PoamItemSchema.parse(json.data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: poamKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: poamKeys.byAssessment(variables.assessment_id),
      });
    },
  });
}

/**
 * Updates the status (and optionally the risk acceptance expiry) of a POA&M item.
 * Supports the lifecycle: open → in_progress → resolved → risk_accepted.
 */
export function useUpdatePoamStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      id: string;
      status: PoamStatus;
      risk_acceptance_expires_at?: string | null;
    }) => {
      const { id, ...patch } = body;
      const res = await fetch(`/api/poam/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update POA&M status');
      }
      return PoamItemSchema.parse(json.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: poamKeys.all });
    },
  });
}

/**
 * Deletes a POA&M item.
 */
export function useDeletePoamItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/poam/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to delete POA&M item');
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: poamKeys.all });
    },
  });
}
