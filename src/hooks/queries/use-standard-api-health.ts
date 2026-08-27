import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const StandardApiHealthSchema = z.object({
  reachable: z.boolean(),
  keyConfigured: z.boolean(),
  keyPrefix: z.string().nullable(),
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
