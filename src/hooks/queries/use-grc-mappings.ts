import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

const ScfControlJoinSchema = z.object({
  control_name: z.string(),
  description: z.string().nullable().default(null),
});

const GrcMappingSchema = z.object({
  id: z.number(),
  framework_code: z.string(),
  target_control_id: z.string(),
  scf_control_code: z.string(),
  synced_at: z.string().nullable().default(null),
  scf_controls: ScfControlJoinSchema.nullable().default(null),
});

const SyncResultSchema = z.object({
  success: z.boolean(),
  controls_synced: z.number().optional(),
  scf_version: z.string().optional(),
  error: z.string().optional(),
});

export type GrcMapping = z.infer<typeof GrcMappingSchema>;
export type SyncResult = z.infer<typeof SyncResultSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────────────────

export const grcMappingKeys = {
  all: ['grc-mappings'] as const,
  lists: () => [...grcMappingKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...grcMappingKeys.lists(), filters] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useGrcMappings() {
  return useQuery({
    queryKey: grcMappingKeys.lists(),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('scf_framework_mappings')
        .select(`
          id,
          framework_code,
          target_control_id,
          scf_control_code,
          synced_at,
          scf_controls:scf_control_code (
            control_name,
            description
          )
        `);

      if (error) throw new Error(error.message);

      return (data ?? []).map((row: unknown) => GrcMappingSchema.parse(row));
    },
    staleTime: 60_000,
  });
}

export function useSyncMappings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/compliance/mappings/sync', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Server returned ${res.status} — sync route not found.`);
      }

      const json = await res.json();
      const parsed = SyncResultSchema.parse(json);

      if (!parsed.success) {
        throw new Error(parsed.error || 'Sync failed');
      }

      return parsed;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: grcMappingKeys.lists() });
    },
  });
}
