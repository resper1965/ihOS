// src/lib/assessment/persistence.ts
// Shared utilities for persisting assessment results to Supabase.
// Eliminates 3x duplication across: run/route.ts, audit/route.ts, grc-trigger.ts

import { createAdminClient } from '@/lib/supabase/admin';
import type { ControlEvaluation } from './engine';
import { z } from 'zod';

// ── Zod validation for assessment run request ─────────────────────────────
export const RunAssessmentRequestSchema = z.object({
  frameworks: z.array(z.string()).min(1, 'At least one framework required'),
  mode: z.enum(['quick', 'deep']).default('quick'),
  salesChannel: z.enum(['B2B_GEHC', 'B2B_DIRECT']).nullable().default(null),
  productVersionId: z.string().nullable().default(null),
});

export type RunAssessmentRequest = z.infer<typeof RunAssessmentRequestSchema>;

// ── Evidence batch builder ────────────────────────────────────────────────
export function buildEvidenceBatch(
  evaluations: ControlEvaluation[],
  assessmentId: string,
): Record<string, unknown>[] {
  return evaluations.map((evaluation) => ({
    // Required columns (NOT NULL in schema)
    chunk_id: evaluation.evidenceChunkId ?? 0,
    scf_control_code: evaluation.controlId,
    control_requirement: evaluation.controlName,
    evidence_text: evaluation.evidenceSnippet ?? 'No evidence found',
    needs_review: evaluation.confidenceScore > 0 && evaluation.confidenceScore < 70,
    // Optional columns
    control_code: evaluation.controlId,
    domain_code: evaluation.domain,
    control_name: evaluation.controlName,
    is_compliant: evaluation.isCompliant,
    confidence_score: evaluation.confidenceScore,
    missing_elements: null,
    auditor_notes: evaluation.auditorNotes || null,
    trace_id: assessmentId,
    // Dual-phase data
    evidence_sources: evaluation.ismsPhase || evaluation.evidencePhase
      ? {
          ismsPhase: evaluation.ismsPhase ?? null,
          evidencePhase: evaluation.evidencePhase ?? null,
          combinedStatus: evaluation.combinedStatus ?? null,
        }
      : null,
  }));
}

// ── Persist evidence evaluations ─────────────────────────────────────────
export async function persistEvidenceEvaluations(
  evaluations: ControlEvaluation[],
  assessmentId: string,
): Promise<void> {
  if (evaluations.length === 0) return;

  const adminSupabase = createAdminClient();
  const batch = buildEvidenceBatch(evaluations, assessmentId);

  const { error } = await adminSupabase
    .from('evidence_evaluations')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(batch as any);

  if (error) {
    console.error(
      '[persistence] Failed to persist evidence evaluations:',
      error.message,
    );
    throw error;
  }

  console.log(
    `[persistence] Persisted ${batch.length} evidence evaluations for assessment ${assessmentId}`,
  );
}
