// tests/unit/assessment/engine.test.ts
// T020: Unit tests for the assessment engine (src/lib/assessment/engine.ts)
// Only tests what's possible without external dependencies (types, constants).

import { describe, it, expect } from 'vitest';

// Import types and re-exports to verify they exist and are accessible
import type {
  AssessmentConfig,
  AssessmentResult,
  ControlEvaluation,
  FrameworkScore,
  ProgressCallback,
} from '@/lib/assessment/engine';
import { DEFAULT_FRAMEWORKS } from '@/lib/assessment/engine';

// ---------------------------------------------------------------------------
// Exported types — compile-time assertions
// ---------------------------------------------------------------------------

describe('engine exported types', () => {
  it('AssessmentConfig type has the expected shape', () => {
    // Type-level check: if this compiles, the type exists and has these fields
    const config: AssessmentConfig = {
      frameworks: ['iso27001'],
      mode: 'quick',
      salesChannel: null,
      productVersionId: null,
      confidenceThreshold: 70,
      similarityThreshold: 0.65,
    };

    expect(config.frameworks).toEqual(['iso27001']);
    expect(config.mode).toBe('quick');
    expect(config.confidenceThreshold).toBe(70);
    expect(config.similarityThreshold).toBe(0.65);
  });

  it('AssessmentConfig accepts "deep" mode', () => {
    const config: AssessmentConfig = {
      frameworks: ['soc2', 'iso27001'],
      mode: 'deep',
    };

    expect(config.mode).toBe('deep');
  });

  it('ControlEvaluation type has required and optional fields', () => {
    const evaluation: ControlEvaluation = {
      controlId: 'CTL-001',
      controlName: 'Access Control',
      domain: 'ACCESS',
      isCompliant: true,
      confidenceScore: 90,
    };

    expect(evaluation.controlId).toBe('CTL-001');
    expect(evaluation.isCompliant).toBe(true);
    // Optional fields should be undefined when omitted
    expect(evaluation.evidenceChunkId).toBeUndefined();
    expect(evaluation.ismsPhase).toBeUndefined();
    expect(evaluation.evidencePhase).toBeUndefined();
    expect(evaluation.combinedStatus).toBeUndefined();
  });

  it('ControlEvaluation supports dual-phase data', () => {
    const evaluation: ControlEvaluation = {
      controlId: 'CTL-002',
      controlName: 'Incident Response',
      domain: 'INCIDENT',
      isCompliant: false,
      confidenceScore: 40,
      ismsPhase: {
        found: true,
        score: 0.75,
        docTitle: 'ISMS Manual',
        docFilename: 'isms.pdf',
        snippet: 'Incident handling...',
        chunkId: 5,
      },
      evidencePhase: {
        found: false,
        score: 0.2,
      },
      combinedStatus: 'partial',
    };

    expect(evaluation.ismsPhase?.found).toBe(true);
    expect(evaluation.evidencePhase?.found).toBe(false);
    expect(evaluation.combinedStatus).toBe('partial');
  });

  it('FrameworkScore type has required fields', () => {
    const score: FrameworkScore = {
      frameworkId: 'iso27001',
      score: 73.5,
      implementedCount: 78,
      totalRequired: 120,
      missingControls: ['CTL-100', 'CTL-200'],
    };

    expect(score.frameworkId).toBe('iso27001');
    expect(score.score).toBe(73.5);
    expect(score.missingControls).toHaveLength(2);
    // Optional 2-phase fields
    expect(score.ismsScore).toBeUndefined();
    expect(score.evidenceScore).toBeUndefined();
  });

  it('AssessmentResult type has required and optional fields', () => {
    const result: AssessmentResult = {
      id: 'assessment-1',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:05:00Z',
      config: { frameworks: ['iso27001'], mode: 'quick' },
      controlEvaluations: [],
      frameworkScores: [],
      implementedControlIds: [],
      totalControlsEvaluated: 0,
      totalControlsCompliant: 0,
      totalControlsMissing: 0,
    };

    expect(result.id).toBe('assessment-1');
    expect(result.controlEvaluations).toEqual([]);
    // Optional 2-phase totals
    expect(result.totalIsmsCompliant).toBeUndefined();
    expect(result.totalConforming).toBeUndefined();
    expect(result.totalGap).toBeUndefined();
  });

  it('ProgressCallback type is a function accepting a progress object', () => {
    const callback: ProgressCallback = (progress) => {
      expect(progress.phase).toBeDefined();
      expect(progress.current).toBeDefined();
      expect(progress.total).toBeDefined();
      expect(progress.message).toBeDefined();
    };

    // Invoke it to verify shape
    callback({
      phase: 'evaluating',
      current: 5,
      total: 100,
      message: 'Evaluating CTL-005...',
    });
  });
});

// ---------------------------------------------------------------------------
// Re-exported DEFAULT_FRAMEWORKS (from frameworks.ts → framework-registry.ts)
// ---------------------------------------------------------------------------

describe('engine re-exports', () => {
  it('DEFAULT_FRAMEWORKS is re-exported and has 6 entries', () => {
    expect(DEFAULT_FRAMEWORKS).toBeDefined();
    expect(DEFAULT_FRAMEWORKS).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// MAX_PAGES constant (indirectly verifiable)
// ---------------------------------------------------------------------------

describe('MAX_PAGES constant', () => {
  it('is a reasonable value (verifiable via source inspection)', async () => {
    // MAX_PAGES is defined inside runAssessment and not exported,
    // so we verify the source file contains a reasonable constant.
    // This test reads the source to confirm the value rather than
    // importing a non-exported symbol.
    const fs = await import('fs');
    const path = await import('path');
    const engineSource = fs.readFileSync(
      path.resolve(__dirname, '../../../src/lib/assessment/engine.ts'),
      'utf-8',
    );

    const match = engineSource.match(/MAX_PAGES\s*=\s*(\d+)/);
    expect(match).not.toBeNull();

    const maxPages = Number(match![1]);
    expect(maxPages).toBeGreaterThanOrEqual(5);
    expect(maxPages).toBeLessThanOrEqual(100);
  });
});
