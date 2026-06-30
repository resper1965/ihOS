import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const StatsSchema = z.object({
  frameworks: z.string(),
  documents: z.string(),
  assessments: z.string(),
  score: z.string(),
});

const ActivitySchema = z.object({
  action: z.string(),
  time: z.string(),
  type: z.enum(["assessment", "analysis", "document", "review", "score"]),
});

const MsrBaselineSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version_code: z.string(),
});

const MsrStatsSchema = z.object({
  totalMCR: z.number(),
  acceptedMCR: z.number(),
  totalDSR: z.number(),
  acceptedDSR: z.number(),
  pendingDSR: z.number(),
  rejectedDSR: z.number(),
  pptdf: z.object({
    People: z.number(),
    Process: z.number(),
    Technology: z.number(),
    Data: z.number(),
    Facilities: z.number(),
  }),
});

const MsrDataSchema = z.object({
  baseline: MsrBaselineSchema,
  stats: MsrStatsSchema,
}).nullable();

const DashboardDataSchema = z.object({
  stats: StatsSchema,
  activities: z.array(ActivitySchema),
  msrData: MsrDataSchema,
});

export type DashboardData = z.infer<typeof DashboardDataSchema>;

export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: (versionId: string | null) => [...dashboardKeys.all, 'stats', versionId] as const,
};

export function useDashboardStats(versionId: string | null = null) {
  return useQuery<DashboardData>({
    queryKey: dashboardKeys.stats(versionId),
    queryFn: async () => {
      const url = versionId 
        ? `/api/dashboard/stats?versionId=${encodeURIComponent(versionId)}` 
        : '/api/dashboard/stats';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load dashboard stats');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load dashboard stats');
      return DashboardDataSchema.parse(json.data);
    },
    staleTime: 30_000,
  });
}
