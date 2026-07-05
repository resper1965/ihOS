import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const StatsSchema = z.object({
  frameworks: z.union([z.string(), z.number()]).transform(v => String(v)),
  documents: z.union([z.string(), z.number()]).transform(v => String(v)),
  assessments: z.union([z.string(), z.number()]).transform(v => String(v)),
  score: z.union([z.string(), z.number()]).transform(v => String(v)),
}).passthrough();

const ActivitySchema = z.object({
  action: z.string().nullable().transform(v => v || "Unnamed Activity"),
  time: z.string().nullable().transform(v => v || "Recently"),
  type: z.enum(["assessment", "analysis", "document", "review", "score"]).catch("assessment"),
}).passthrough();

const MsrBaselineSchema = z.object({
  id: z.string(),
  name: z.string().nullable().transform(v => v || "No Name"),
  description: z.string().nullable().transform(v => v || ""),
  version_code: z.string().nullable().transform(v => v || "N/A"),
}).passthrough();

const MsrStatsSchema = z.object({
  totalMCR: z.number().default(0),
  acceptedMCR: z.number().default(0),
  totalDSR: z.number().default(0),
  acceptedDSR: z.number().default(0),
  pendingDSR: z.number().default(0),
  rejectedDSR: z.number().default(0),
  pptdf: z.object({
    People: z.number().default(0),
    Process: z.number().default(0),
    Technology: z.number().default(0),
    Data: z.number().default(0),
    Facilities: z.number().default(0),
  }).default({}),
}).passthrough();

const MsrDataSchema = z.object({
  baseline: MsrBaselineSchema,
  stats: MsrStatsSchema,
}).nullable();

const DashboardDataSchema = z.object({
  stats: StatsSchema,
  activities: z.array(ActivitySchema),
  msrData: MsrDataSchema.optional(),
}).passthrough();

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
