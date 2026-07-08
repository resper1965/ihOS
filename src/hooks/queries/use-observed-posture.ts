// src/hooks/queries/use-observed-posture.ts
// Moment 2 (continuous observation) dashboard data.

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const ObservedControlSchema = z.object({
  scfControlCode: z.string(),
  status: z.enum(['violated', 'degraded']).catch('degraded'),
  activeSignals: z.number().default(0),
  criticalOrHigh: z.number().default(0),
  riskAccepted: z.number().default(0),
}).passthrough();

const ObservedPostureSchema = z.object({
  configured: z.boolean().default(false),
  severity_counts: z.record(z.string(), z.number()).default({}),
  risk_accepted: z.number().default(0),
  violated_controls: z.array(ObservedControlSchema).default([]),
  degraded_controls: z.array(ObservedControlSchema).default([]),
  last_synced_at: z.string().nullable().default(null),
}).passthrough();

export type ObservedPostureData = z.infer<typeof ObservedPostureSchema>;

export function useObservedPosture() {
  return useQuery<ObservedPostureData>({
    queryKey: ['dashboard', 'observed-posture'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/observed-posture');
      if (!res.ok) throw new Error(`Failed to load observed posture (${res.status})`);
      return ObservedPostureSchema.parse(await res.json());
    },
    staleTime: 60_000,
  });
}
