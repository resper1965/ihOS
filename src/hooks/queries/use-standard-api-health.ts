import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

const StandardApiHealthSchema = z.object({
  reachable: z.boolean(),
  keyConfigured: z.boolean(),
  keyPrefix: z.string().nullable(),
  keySource: z.enum(['env', 'vault', 'none']),
  scopesHeld: z.array(z.string()).nullable(),
  scopesMissing: z.array(z.string()).nullable(),
  catalogReadable: z.boolean(),
  checkedAt: z.string(),
  detail: z.string().nullable(),
});

export type StandardApiHealth = z.infer<typeof StandardApiHealthSchema>;

export const standardApiHealthKeys = {
  all: ['standard-api-health'] as const,
  status: () => [...standardApiHealthKeys.all, 'status'] as const,
};

export function useStandardApiHealth() {
  return useQuery<StandardApiHealth>({
    queryKey: standardApiHealthKeys.status(),
    queryFn: async () => {
      const res = await fetch('/api/settings/integrations/standard-api');
      if (!res.ok) throw new Error('Failed to load Standard API health');
      const json = await res.json();
      return StandardApiHealthSchema.parse(json);
    },
    staleTime: 30_000,
  });
}

const SetStandardApiKeyResponseSchema = z.object({
  ok: z.boolean(),
  keyPrefix: z.string().nullable(),
  shadowedByEnv: z.boolean(),
});

export type SetStandardApiKeyResponse = z.infer<typeof SetStandardApiKeyResponseSchema>;

/** Saves the Standard GRC API key to Vault. Never sends the key anywhere else. */
export function useSetStandardApiKey() {
  const queryClient = useQueryClient();
  return useMutation<SetStandardApiKeyResponse, Error, string>({
    mutationFn: async (key: string) => {
      const res = await fetch('/api/settings/integrations/standard-api/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed to save key');
      return SetStandardApiKeyResponseSchema.parse(json);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: standardApiHealthKeys.status() });
    },
  });
}
