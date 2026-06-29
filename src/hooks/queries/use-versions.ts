import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

const VersionSchema = z.object({
  id: z.string(),
  product_name: z.string(),
  version_code: z.string(),
  status: z.enum(['active', 'deprecated', 'supported']).catch('supported'),
  technical_specs: z.any().nullable().default(null),
  is_default: z.boolean().optional(),
  created_at: z.string().nullable().default(null),
  updated_at: z.string().nullable().default(null),
});

const VersionsResponseSchema = z.object({
  versions: z.array(VersionSchema).default([]),
});

const VersionMutationResponseSchema = z.object({
  version: VersionSchema,
});

export type Version = z.infer<typeof VersionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────────────────

export const versionKeys = {
  all: ['versions'] as const,
  lists: () => [...versionKeys.all, 'list'] as const,
  details: () => [...versionKeys.all, 'detail'] as const,
  detail: (id: string) => [...versionKeys.details(), id] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useVersions() {
  return useQuery({
    queryKey: versionKeys.lists(),
    queryFn: async () => {
      const res = await fetch('/api/versions');
      if (!res.ok) throw new Error('Failed to fetch versions');
      const json = await res.json();

      const parsed = VersionsResponseSchema.parse(json);
      return parsed.versions;
    },
    staleTime: 60_000,
  });
}

export function useCreateVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      product_name: string;
      version_code: string;
    }) => {
      const res = await fetch('/api/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const ct = res.headers.get('content-type') ?? '';
      if (!res.ok) {
        const msg = ct.includes('json') ? (await res.json()).error : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const json = await res.json();
      const parsed = VersionMutationResponseSchema.parse(json);
      return parsed.version;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionKeys.lists() });
    },
  });
}

export function useUpdateVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: {
      id: string;
      status: 'active' | 'deprecated' | 'supported';
    }) => {
      const res = await fetch(`/api/versions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) throw new Error('Failed to update version');

      const json = await res.json();
      const parsed = VersionMutationResponseSchema.parse(json);
      return parsed.version;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: versionKeys.lists() });
    },
  });
}
