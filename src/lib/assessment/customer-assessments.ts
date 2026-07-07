// src/lib/assessment/customer-assessments.ts
// Domain rules for the customer-assessment entity (specs/003 F4 / Onda 3).
// Pure logic only — routes own I/O.

import { z } from 'zod';

// ── Status machine ───────────────────────────────────────────────────────────

export const ASSESSMENT_STATUSES = [
  'received',
  'answering',
  'in_review',
  'approved',
  'exported',
  'archived',
] as const;

export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

/**
 * Allowed transitions. Forward flow plus the explicit corrections:
 *  - in_review → answering  (reviewer sends answers back for regeneration)
 *  - approved  → in_review  (approval revoked before export)
 *  - archived is terminal and reachable from any non-archived state.
 */
const ALLOWED_TRANSITIONS: Record<AssessmentStatus, AssessmentStatus[]> = {
  received: ['answering', 'archived'],
  answering: ['in_review', 'archived'],
  in_review: ['approved', 'answering', 'archived'],
  approved: ['exported', 'in_review', 'archived'],
  exported: ['archived'],
  archived: [],
};

export function canTransition(from: AssessmentStatus, to: AssessmentStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export function allowedTransitions(from: AssessmentStatus): AssessmentStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

// ── Payload schemas ──────────────────────────────────────────────────────────

export const CreateAssessmentSchema = z.object({
  client_name: z.string().min(1).max(200),
  sales_channel: z.enum(['B2B_GEHC', 'B2B_DIRECT']),
  product_version_id: z.string().uuid(),
  source_file: z.string().max(500).optional(),
  file_format: z.string().max(20).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be YYYY-MM-DD').optional(),
});

export type CreateAssessmentPayload = z.infer<typeof CreateAssessmentSchema>;

export const AnswerUpsertSchema = z.object({
  question_text: z.string().min(1),
  question_context: z.string().nullish(),
  cell_coords: z.string().nullish(),
  sheet_name: z.string().nullish(),
  row_index: z.number().int().nullish(),
  draft_answer: z.string().nullish(),
  answer_source: z.enum(['posture', 'document', 'verified_qa', 'manual', 'gap']).nullish(),
  mapped_controls: z.array(z.record(z.string(), z.unknown())).default([]),
  references: z.array(z.record(z.string(), z.unknown())).default([]),
  confidence: z.number().int().min(0).max(100).nullish(),
  needs_review: z.boolean().default(false),
});

export const BulkAnswersSchema = z.object({
  answers: z.array(AnswerUpsertSchema).min(1),
  /** Corpus fingerprint at generation time — stamps the assessment. */
  posture_fingerprint: z.string().optional(),
});

export const ReviewAnswerSchema = z.object({
  answer_id: z.string().uuid(),
  review_status: z.enum(['approved', 'edited', 'rejected']),
  /** Required when review_status = edited. */
  final_answer: z.string().optional(),
}).refine(
  (r) => r.review_status !== 'edited' || (r.final_answer ?? '').trim().length > 0,
  { message: 'final_answer is required when review_status is "edited"' },
);

// ── Counters ─────────────────────────────────────────────────────────────────

export interface AnswerCountRow {
  draft_answer: string | null;
  review_status: string;
}

/** Recompute the assessment's progress counters from its answer rows. */
export function computeCounts(rows: AnswerCountRow[]): {
  question_count: number;
  answered_count: number;
  approved_count: number;
} {
  return {
    question_count: rows.length,
    answered_count: rows.filter((r) => (r.draft_answer ?? '').trim().length > 0).length,
    approved_count: rows.filter((r) => r.review_status === 'approved' || r.review_status === 'edited').length,
  };
}
