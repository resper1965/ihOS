// tests/unit/assessment/customer-assessments.test.ts
// Unit tests for the customer-assessment domain rules (specs/003 F4)
// (src/lib/assessment/customer-assessments.ts)

import { describe, it, expect } from 'vitest';
import {
  canTransition,
  allowedTransitions,
  computeCounts,
  CreateAssessmentSchema,
  BulkAnswersSchema,
  ReviewAnswerSchema,
  ASSESSMENT_STATUSES,
  type AssessmentStatus,
} from '@/lib/assessment/customer-assessments';

describe('status machine', () => {
  it('follows the forward flow received → … → archived', () => {
    expect(canTransition('received', 'answering')).toBe(true);
    expect(canTransition('answering', 'in_review')).toBe(true);
    expect(canTransition('in_review', 'approved')).toBe(true);
    expect(canTransition('approved', 'exported')).toBe(true);
    expect(canTransition('exported', 'archived')).toBe(true);
  });

  it('allows the explicit correction paths', () => {
    expect(canTransition('in_review', 'answering')).toBe(true);  // send back
    expect(canTransition('approved', 'in_review')).toBe(true);   // revoke approval
  });

  it('rejects skipping stages and moving backwards arbitrarily', () => {
    expect(canTransition('received', 'approved')).toBe(false);
    expect(canTransition('received', 'exported')).toBe(false);
    expect(canTransition('answering', 'approved')).toBe(false);
    expect(canTransition('exported', 'received')).toBe(false);
  });

  it('treats archived as terminal but reachable from any active state', () => {
    for (const from of ASSESSMENT_STATUSES.filter((s) => s !== 'archived' && s !== 'exported')) {
      expect(canTransition(from as AssessmentStatus, 'archived')).toBe(true);
    }
    expect(allowedTransitions('archived')).toEqual([]);
  });
});

describe('computeCounts', () => {
  it('counts questions, drafted answers, and approved/edited reviews', () => {
    const counts = computeCounts([
      { draft_answer: 'Yes, encrypted at rest.', review_status: 'approved' },
      { draft_answer: 'Partially.', review_status: 'edited' },
      { draft_answer: 'Declared gap.', review_status: 'rejected' },
      { draft_answer: '   ', review_status: 'pending' },
      { draft_answer: null, review_status: 'pending' },
    ]);

    expect(counts).toEqual({ question_count: 5, answered_count: 3, approved_count: 2 });
  });
});

describe('payload schemas', () => {
  it('requires channel and version on creation (never mixes overlays)', () => {
    const ok = CreateAssessmentSchema.safeParse({
      client_name: 'ACME Health',
      sales_channel: 'B2B_GEHC',
      product_version_id: '4dc0e1a6-59a5-4f4b-a3ce-33c6c2d1e111',
    });
    expect(ok.success).toBe(true);

    expect(CreateAssessmentSchema.safeParse({
      client_name: 'ACME Health',
      product_version_id: '4dc0e1a6-59a5-4f4b-a3ce-33c6c2d1e111',
    }).success).toBe(false);

    expect(CreateAssessmentSchema.safeParse({
      client_name: 'ACME Health',
      sales_channel: 'ALL',
      product_version_id: '4dc0e1a6-59a5-4f4b-a3ce-33c6c2d1e111',
    }).success).toBe(false);
  });

  it('accepts a generated-answer batch with provenance fields', () => {
    const parsed = BulkAnswersSchema.safeParse({
      posture_fingerprint: 'fp-abc',
      answers: [
        {
          question_text: 'Is data encrypted at rest?',
          draft_answer: 'Yes — AES-256 (CRY-01 conforming).',
          answer_source: 'posture',
          mapped_controls: [{ code: 'CRY-01', status: 'conforming' }],
          references: [{ chunkId: 42, documentTitle: 'Crypto Policy' }],
          confidence: 88,
          needs_review: false,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an edited review without the edited text', () => {
    expect(ReviewAnswerSchema.safeParse({
      answer_id: '4dc0e1a6-59a5-4f4b-a3ce-33c6c2d1e111',
      review_status: 'edited',
    }).success).toBe(false);

    expect(ReviewAnswerSchema.safeParse({
      answer_id: '4dc0e1a6-59a5-4f4b-a3ce-33c6c2d1e111',
      review_status: 'edited',
      final_answer: 'Corrected wording.',
    }).success).toBe(true);

    expect(ReviewAnswerSchema.safeParse({
      answer_id: '4dc0e1a6-59a5-4f4b-a3ce-33c6c2d1e111',
      review_status: 'approved',
    }).success).toBe(true);
  });
});
