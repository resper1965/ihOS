// src/lib/assessment/engine.ts
// Core Assessment Engine — orchestrates RAG + Standard API

import { searchDocuments } from '@/lib/chat/rag-search';
import * as standardApi from '@/lib/standard-api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssessmentConfig {
  frameworks: string[];
  mode: 'quick' | 'deep';
  salesChannel?: 'B2B_GEHC' | 'B2B_DIRECT' | null;
  productVersionId?: string | null;
  confidenceThreshold?: number;  // default 70
  similarityThreshold?: number;  // default 0.65
}

export interface ControlEvaluation {
  controlId: string;
  controlName: string;
  domain: string;
  isCompliant: boolean;
  confidenceScore: number;
  evidenceChunkId?: number;
  evidenceSnippet?: string;
  auditorNotes?: string;
}

export interface FrameworkScore {
  frameworkId: string;
  score: number;
  implementedCount: number;
  totalRequired: number;
  missingControls: string[];
  message?: string;
}

export interface AssessmentResult {
  id: string;
  startedAt: string;
  completedAt: string;
  config: AssessmentConfig;
  controlEvaluations: ControlEvaluation[];
  frameworkScores: FrameworkScore[];
  implementedControlIds: string[];
  totalControlsEvaluated: number;
  totalControlsCompliant: number;
  totalControlsMissing: number;
}

// ---------------------------------------------------------------------------
// Default frameworks
// ---------------------------------------------------------------------------

export const DEFAULT_FRAMEWORKS = [
  { id: 'iso27001', name: 'ISO/IEC 27001:2022' },
  { id: 'soc2', name: 'SOC 2 Type II' },
  { id: 'hipaa', name: 'HIPAA' },
  { id: 'nist_800_53', name: 'NIST 800-53' },
  { id: 'tx-ramp-level-2', name: 'TX-RAMP Level 2' },
  { id: 'fedramp', name: 'FedRAMP' },
];

// ---------------------------------------------------------------------------
// Progress callback
// ---------------------------------------------------------------------------

export type ProgressCallback = (progress: {
  phase: 'loading_controls' | 'evaluating' | 'scoring' | 'complete';
  current: number;
  total: number;
  message: string;
}) => void;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export async function runAssessment(
  config: AssessmentConfig,
  onProgress?: ProgressCallback,
): Promise<AssessmentResult> {
  const startedAt = new Date().toISOString();
  const confidenceThreshold = config.confidenceThreshold ?? 70;
  const similarityThreshold = config.similarityThreshold ?? 0.65;

  // ── Phase 1: Load SCF Controls ───────────────────────────────────────
  onProgress?.({
    phase: 'loading_controls',
    current: 0,
    total: 0,
    message: 'Loading SCF control catalog...',
  });

  const scfVersion = await standardApi.getLatestScfVersion();
  const allControls: any[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const batch = await standardApi.getScfControls(scfVersion.scf_version_id, page, perPage);
    const items = batch.data || [];
    allControls.push(...items);
    if (items.length < perPage) break;
    page++;
  }

  onProgress?.({
    phase: 'loading_controls',
    current: allControls.length,
    total: allControls.length,
    message: `Loaded ${allControls.length} SCF controls.`,
  });

  // ── Phase 2: Evaluate each control ──────────────────────────────────
  const evaluations: ControlEvaluation[] = [];
  const implementedControlIds: string[] = [];

  // Build category filter based on sales channel
  const categoryFilters: string[] = ['ISMS_CORE', 'OPERATIONAL'];
  if (config.salesChannel === 'B2B_GEHC') categoryFilters.push('B2B_GEHC');
  else if (config.salesChannel === 'B2B_DIRECT') categoryFilters.push('B2B_DIRECT');
  else {
    categoryFilters.push('B2B_GEHC', 'B2B_DIRECT');
  }

  for (let i = 0; i < allControls.length; i++) {
    const control = allControls[i];
    const controlId = control.control_id || control.id || `CTRL-${i}`;
    const controlName = control.control_name || control.name || controlId;
    const controlDomain = control.domain || controlId.split('-')[0] || 'UNKNOWN';
    const controlDescription = control.control_description || control.description || controlName;

    onProgress?.({
      phase: 'evaluating',
      current: i + 1,
      total: allControls.length,
      message: `Evaluating ${controlId}: ${controlName}`,
    });

    // Step 2a: Search RAG for evidence
    const ragResults = await searchDocuments(controlDescription, {
      productVersionId: config.productVersionId || undefined,
      limit: 3,
      threshold: similarityThreshold,
    });

    // Quick mode: skip controls with no RAG evidence
    if (config.mode === 'quick' && ragResults.length === 0) {
      evaluations.push({
        controlId,
        controlName,
        domain: controlDomain,
        isCompliant: false,
        confidenceScore: 0,
        auditorNotes: 'No evidence found in ISMS documents (Quick Scan).',
      });
      continue;
    }

    if (ragResults.length === 0) {
      // Deep mode: no evidence found
      evaluations.push({
        controlId,
        controlName,
        domain: controlDomain,
        isCompliant: false,
        confidenceScore: 0,
        auditorNotes: 'No evidence found in any ISMS document.',
      });
      continue;
    }

    // Step 2b: Validate via Standard API evaluate-evidence
    const bestEvidence = ragResults[0];
    try {
      const evalResult = await standardApi.evaluateEvidence({
        controlRequirement: controlDescription,
        evidenceDescription: bestEvidence.content,
      } as any);

      const isCompliant = (evalResult as any).is_compliant === true
        && ((evalResult as any).confidence_score ?? 0) >= confidenceThreshold;

      evaluations.push({
        controlId,
        controlName,
        domain: controlDomain,
        isCompliant,
        confidenceScore: (evalResult as any).confidence_score ?? 0,
        evidenceChunkId: bestEvidence.id,
        evidenceSnippet: bestEvidence.content.slice(0, 200),
        auditorNotes: (evalResult as any).auditor_notes ?? '',
      });

      if (isCompliant) {
        implementedControlIds.push(controlId);
      }
    } catch (err) {
      // If evaluate-evidence fails, mark as non-compliant but log the error
      evaluations.push({
        controlId,
        controlName,
        domain: controlDomain,
        isCompliant: false,
        confidenceScore: 0,
        evidenceChunkId: bestEvidence.id,
        evidenceSnippet: bestEvidence.content.slice(0, 200),
        auditorNotes: `Evidence evaluation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }

    // Rate limiting: small delay between API calls
    if (i % 10 === 9) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // ── Phase 3: Calculate scores per framework ─────────────────────────
  onProgress?.({
    phase: 'scoring',
    current: 0,
    total: config.frameworks.length,
    message: 'Calculating compliance scores...',
  });

  const frameworkScores: FrameworkScore[] = [];

  for (let i = 0; i < config.frameworks.length; i++) {
    const frameworkId = config.frameworks[i];

    onProgress?.({
      phase: 'scoring',
      current: i + 1,
      total: config.frameworks.length,
      message: `Scoring ${frameworkId}...`,
    });

    try {
      const scoreResult = await standardApi.complianceScore({
        regulation_id: frameworkId,
        scf_controls_implemented: implementedControlIds,
      });

      frameworkScores.push({
        frameworkId,
        score: scoreResult.score ?? scoreResult.overall_score ?? 0,
        implementedCount: scoreResult.scf_controls_implemented_count ?? implementedControlIds.length,
        totalRequired: scoreResult.total_required_controls ?? 0,
        missingControls: (scoreResult.missing_controls ?? []).map((c: any) => typeof c === 'string' ? c : c.control_id || c),
        message: scoreResult.message,
      });
    } catch (err) {
      frameworkScores.push({
        frameworkId,
        score: 0,
        implementedCount: 0,
        totalRequired: 0,
        missingControls: [],
        message: `Score calculation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }
  }

  // ── Phase 4: Compile result ─────────────────────────────────────────
  const completedAt = new Date().toISOString();
  const totalCompliant = evaluations.filter(e => e.isCompliant).length;

  const result: AssessmentResult = {
    id: crypto.randomUUID(),
    startedAt,
    completedAt,
    config,
    controlEvaluations: evaluations,
    frameworkScores,
    implementedControlIds,
    totalControlsEvaluated: evaluations.length,
    totalControlsCompliant: totalCompliant,
    totalControlsMissing: evaluations.length - totalCompliant,
  };

  onProgress?.({
    phase: 'complete',
    current: 1,
    total: 1,
    message: `Assessment complete: ${totalCompliant}/${evaluations.length} controls compliant.`,
  });

  return result;
}
