import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

const FrameworkScoreSchema = z.object({
  frameworkId: z.string(),
  score: z.number(),
  implementedCount: z.number().default(0),
  totalRequired: z.number().default(0),
  missingControls: z.array(z.string()).default([]),
  message: z.string().optional(),
  ismsScore: z.number().optional(),
  evidenceScore: z.number().optional(),
  conformingCount: z.number().optional(),
  partialCount: z.number().optional(),
  informalCount: z.number().optional(),
  gapCount: z.number().optional(),
});

const AssessmentRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  mode: z.string(),
  sales_channel: z.string().nullable(),
  product_version_id: z.string().nullable(),
  frameworks: z.array(z.string()).default([]),
  total_controls: z.number().default(0),
  compliant_controls: z.number().default(0),
  missing_controls: z.number().default(0),
  framework_scores: z.array(FrameworkScoreSchema).default([]),
  created_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});

const EvidenceEvaluationSchema = z.object({
  id: z.string(),
  control_code: z.string().nullable().default(null),
  control_name: z.string().nullable().default(null),
  is_compliant: z.boolean().default(false),
  confidence_score: z.number().default(0),
  needs_review: z.boolean().default(false),
  auditor_notes: z.string().nullable().default(null),
  domain_code: z.string().nullable().default(null),
  evidence_sources: z.any().nullable().default(null),
  scf_control_code: z.string().nullable().default(null),
});

export type AssessmentRecord = z.infer<typeof AssessmentRecordSchema>;
export type EvidenceEvaluation = z.infer<typeof EvidenceEvaluationSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────────────────

export const assessmentKeys = {
  all: ['assessments'] as const,
  lists: () => [...assessmentKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...assessmentKeys.lists(), filters] as const,
  details: () => [...assessmentKeys.all, 'detail'] as const,
  detail: (id: string) => [...assessmentKeys.details(), id] as const,
  evidence: (id: string) => [...assessmentKeys.all, 'evidence', id] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useAssessments(productVersionId?: string | null) {
  return useQuery({
    queryKey: assessmentKeys.list({ productVersionId }),
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from('assessments')
        .select('*')
        .order('created_at', { ascending: false });

      if (productVersionId) {
        query = query.eq('product_version_id', productVersionId);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return (data ?? []).map((row) => AssessmentRecordSchema.parse(row));
    },
    staleTime: 60_000,
  });
}

export function useAssessment(id: string) {
  return useQuery({
    queryKey: assessmentKeys.detail(id),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('assessments')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw new Error(error.message);
      return AssessmentRecordSchema.parse(data);
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useAssessmentEvidence(assessmentId: string) {
  return useQuery({
    queryKey: assessmentKeys.evidence(assessmentId),
    queryFn: async () => {
      const supabase = createClient();
      // Try both columns: trace_id (from run/route.ts) and assessment_id (from audit/route.ts)
      let { data, error } = await supabase
        .from('evidence_evaluations')
        .select('*')
        .eq('trace_id', assessmentId)
        .order('control_code');

      // Fallback: try assessment_id column
      if ((!data || data.length === 0) && !error) {
        const fallback = await supabase
          .from('evidence_evaluations')
          .select('*')
          .eq('assessment_id' as any, assessmentId)
          .order('control_code');
        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => EvidenceEvaluationSchema.parse(row));
    },
    enabled: !!assessmentId,
    staleTime: 30_000,
  });
}

export function useRunAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: {
      frameworks: string[];
      mode: 'quick' | 'deep';
      salesChannel?: string | null;
      productVersionId?: string | null;
    }) => {
      const res = await fetch('/api/assessments/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Assessment failed');
      }
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assessmentKeys.lists() });
    },
  });
}
