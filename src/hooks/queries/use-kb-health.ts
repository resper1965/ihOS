import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const KbHealthSchema = z.object({
  totalDocs: z.number(),
  totalChunks: z.number(),
  missingIndexDocs: z.number(),
  isoCoverageCount: z.number(),
  isoPercentage: z.number(),
});

export type KbHealth = z.infer<typeof KbHealthSchema>;

export const kbHealthKeys = {
  all: ['kb-health'] as const,
  status: () => [...kbHealthKeys.all, 'status'] as const,
};

export function useKbHealth() {
  return useQuery<KbHealth>({
    queryKey: kbHealthKeys.status(),
    queryFn: async () => {
      const res = await fetch('/api/compliance/kb-health');
      if (!res.ok) throw new Error('Failed to load KB health metrics');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load KB health metrics');
      return KbHealthSchema.parse(json.data);
    },
    staleTime: 30_000,
  });
}
