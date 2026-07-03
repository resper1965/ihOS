// tests/unit/assessment/persistence.test.ts
// T019: Unit tests for persistence utilities (src/lib/assessment/persistence.ts)

import { describe, it, expect } from 'vitest';
import {
  buildEvidenceBatch,
  RunAssessmentRequestSchema,
} from '@/lib/assessment/persistence';
import type { ControlEvaluation } from '@/lib/assessment/engine';

// ---------------------------------------------------------------------------
// buildEvidenceBatch
// ---------------------------------------------------------------------------

describe('buildEvidenceBatch', () => {
  const assessmentId = 'test-assessment-123';

  const makeEvaluation = (overrides: Partial<ControlEvaluation> = {}): ControlEvaluation => ({
    controlId: 'CTL-001',
    controlName: 'Access Control Policy',
    domain: 'ACCESS',
    isCompliant: true,
    confidenceScore: 85,
    evidenceChunkId: 42,
    evidenceSnippet: 'All access requires MFA.',
    auditorNotes: 'Verified via SSO logs.',
    ...overrides,
  });

  it('produces correct batch structure for standard evaluations', () => {
    const evaluations: ControlEvaluation[] = [makeEvaluation()];
    const batch = buildEvidenceBatch(evaluations, assessmentId);

    expect(batch).toHaveLength(1);
    const row = batch[0];

    // Required columns
    expect(row.chunk_id).toBe(42);
    expect(row.scf_control_code).toBe('CTL-001');
    expect(row.control_requirement).toBe('Access Control Policy');
    expect(row.evidence_text).toBe('All access requires MFA.');
    expect(row.needs_review).toBe(false); // 85 >= 70

    // Optional columns
    expect(row.control_code).toBe('CTL-001');
    expect(row.domain_code).toBe('ACCESS');
    expect(row.control_name).toBe('Access Control Policy');
    expect(row.is_compliant).toBe(true);
    expect(row.confidence_score).toBe(85);
    expect(row.auditor_notes).toBe('Verified via SSO logs.');
    expect(row.trace_id).toBe(assessmentId);

    // No dual-phase → evidence_sources is null
    expect(row.evidence_sources).toBeNull();
  });

  it('sets needs_review=true when confidenceScore is between 0 (exclusive) and 70', () => {
    const batch = buildEvidenceBatch(
      [makeEvaluation({ confidenceScore: 50 })],
      assessmentId,
    );
    expect(batch[0].needs_review).toBe(true);
  });

  it('sets needs_review=false when confidenceScore is 0 (no evidence)', () => {
    const batch = buildEvidenceBatch(
      [makeEvaluation({ confidenceScore: 0 })],
      assessmentId,
    );
    expect(batch[0].needs_review).toBe(false);
  });

  it('uses fallback values when optional fields are missing', () => {
    const batch = buildEvidenceBatch(
      [makeEvaluation({ evidenceChunkId: undefined, evidenceSnippet: undefined, auditorNotes: undefined })],
      assessmentId,
    );

    expect(batch[0].chunk_id).toBe(0);
    expect(batch[0].evidence_text).toBe('No evidence found');
    expect(batch[0].auditor_notes).toBeNull();
  });

  it('includes evidence_sources when dual-phase data is present', () => {
    const evaluation = makeEvaluation({
      ismsPhase: { found: true, score: 0.82, docTitle: 'ISMS Policy', snippet: '...', chunkId: 10 },
      evidencePhase: { found: false, score: 0.3, docTitle: undefined, snippet: undefined, chunkId: null },
      combinedStatus: 'partial',
    });

    const batch = buildEvidenceBatch([evaluation], assessmentId);

    expect(batch[0].evidence_sources).toEqual({
      ismsPhase: evaluation.ismsPhase,
      evidencePhase: evaluation.evidencePhase,
      combinedStatus: 'partial',
      searchSource: null,
      isEstimated: false,
    });
  });

  it('flags needs_review and records provenance for estimated evaluations', () => {
    const batch = buildEvidenceBatch(
      [makeEvaluation({ confidenceScore: 90, isEstimated: true, searchSource: 'supabase-fallback' })],
      assessmentId,
    );
    // needs_review is true because the result is a non-authoritative estimate,
    // even though confidence (90) is above the borderline threshold.
    expect(batch[0].needs_review).toBe(true);
    expect(batch[0].evidence_sources).toMatchObject({
      isEstimated: true,
      searchSource: 'supabase-fallback',
    });
  });

  it('returns an empty array when given empty evaluations', () => {
    const batch = buildEvidenceBatch([], assessmentId);
    expect(batch).toEqual([]);
  });

  it('handles multiple evaluations in a single batch', () => {
    const evaluations = [
      makeEvaluation({ controlId: 'CTL-001' }),
      makeEvaluation({ controlId: 'CTL-002', isCompliant: false, confidenceScore: 30 }),
      makeEvaluation({ controlId: 'CTL-003', confidenceScore: 0 }),
    ];

    const batch = buildEvidenceBatch(evaluations, assessmentId);

    expect(batch).toHaveLength(3);
    expect(batch[0].scf_control_code).toBe('CTL-001');
    expect(batch[1].scf_control_code).toBe('CTL-002');
    expect(batch[1].needs_review).toBe(true);
    expect(batch[2].scf_control_code).toBe('CTL-003');
    expect(batch[2].needs_review).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RunAssessmentRequestSchema
// ---------------------------------------------------------------------------

describe('RunAssessmentRequestSchema', () => {
  it('validates a complete valid input', () => {
    const input = {
      frameworks: ['iso27001', 'soc2'],
      mode: 'deep',
      salesChannel: 'B2B_GEHC',
      productVersionId: 'pv-123',
    };

    const result = RunAssessmentRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.frameworks).toEqual(['iso27001', 'soc2']);
      expect(result.data.mode).toBe('deep');
      expect(result.data.salesChannel).toBe('B2B_GEHC');
      expect(result.data.productVersionId).toBe('pv-123');
    }
  });

  it('defaults mode to "quick" when omitted', () => {
    const input = { frameworks: ['iso27001'] };

    const result = RunAssessmentRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('quick');
    }
  });

  it('defaults forceReevaluate to false and accepts true', () => {
    const off = RunAssessmentRequestSchema.safeParse({ frameworks: ['iso27001'] });
    expect(off.success && off.data.forceReevaluate).toBe(false);

    const on = RunAssessmentRequestSchema.safeParse({ frameworks: ['iso27001'], forceReevaluate: true });
    expect(on.success && on.data.forceReevaluate).toBe(true);
  });

  it('defaults salesChannel and productVersionId to null when omitted', () => {
    const input = { frameworks: ['soc2'] };

    const result = RunAssessmentRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.salesChannel).toBeNull();
      expect(result.data.productVersionId).toBeNull();
    }
  });

  it('rejects an empty frameworks array', () => {
    const input = { frameworks: [] };
    const result = RunAssessmentRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects missing frameworks field', () => {
    const input = { mode: 'quick' };
    const result = RunAssessmentRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid mode values', () => {
    const input = { frameworks: ['iso27001'], mode: 'turbo' };
    const result = RunAssessmentRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid salesChannel values', () => {
    const input = { frameworks: ['iso27001'], salesChannel: 'INVALID_CHANNEL' };
    const result = RunAssessmentRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
