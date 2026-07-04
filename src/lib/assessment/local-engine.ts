import { createAdminClient } from '@/lib/supabase/admin';
import { generateEmbeddings } from '@/lib/chat/embeddings';
import type {
  AssessmentConfig,
  AssessmentResult,
  ControlEvaluation,
  FrameworkScore,
  ProgressCallback,
} from './engine';
import ISO27001_ANNEX_A from './data/iso27001-annex-a.json';

// ---------------------------------------------------------------------------
// ISO 27001:2022 Annex A Controls (93 controls, 4 themes)
// Data loaded from ./data/iso27001-annex-a.json
// ---------------------------------------------------------------------------

interface AnnexAControl {
  id: string;
  name: string;
  domain: string; // A.5–A.8
  description: string;
}

// ---------------------------------------------------------------------------
// Confidence thresholds for RAG similarity
// ---------------------------------------------------------------------------
// RRF combined_score ranges from 0 to ~0.033 (1/(rank+60) sum)
// Any result returned already passed the vector similarity >= match_threshold filter
const SCORE_STRONG = 0.025;      // >= this: strong evidence (top-ranked match)
const SCORE_PARTIAL = 0.015;     // >= this: partial evidence, needs review
const MATCH_THRESHOLD = 0.20;    // Minimum cosine similarity for vector search in RPC

// ---------------------------------------------------------------------------
// Local Assessment Engine
// ---------------------------------------------------------------------------

export async function runLocalAssessment(
  config: AssessmentConfig,
  onProgress?: ProgressCallback,
): Promise<AssessmentResult> {
  const startedAt = new Date().toISOString();
  const adminSupabase = createAdminClient();

  // Phase 1: Load controls and SCF framework mappings
  const controls = ISO27001_ANNEX_A;
  onProgress?.({
    phase: 'loading_controls',
    current: controls.length,
    total: controls.length,
    message: `Loaded ${controls.length} ISO 27001:2022 Annex A controls. Loading SCF mappings...`,
  });

  // Query scf_framework_mappings for target mapping lookup
  const { data: mappingsData, error: mappingsError } = await adminSupabase
    .from('scf_framework_mappings')
    .select('target_control_id, scf_control_code')
    .eq('framework_code', 'iso27001');

  if (mappingsError) {
    console.error('[Audit] Failed to load SCF framework mappings:', mappingsError.message);
  }

  // Group mappings in a Map for fast lookup
  const mappingsMap = new Map<string, string[]>();
  if (mappingsData) {
    for (const m of mappingsData) {
      const key = m.target_control_id;
      const list = mappingsMap.get(key) || [];
      list.push(m.scf_control_code);
      mappingsMap.set(key, list);
    }
  }

  // Phase 2: Evaluate each control against RAG evidence
  const evaluations: ControlEvaluation[] = [];
  const implementedControlIds: string[] = [];

  onProgress?.({
    phase: 'evaluating',
    current: 0,
    total: controls.length,
    message: 'Generating embeddings for all control descriptions...',
  });

  // Batch generate embeddings to minimize API roundtrips
  const controlDescriptions = controls.map(c => c.description);
  const queryEmbeddings = await generateEmbeddings(controlDescriptions);

  // Helper: evaluate a single control against RAG evidence
  async function evaluateControl(
    control: AnnexAControl,
    queryEmbedding: number[],
    mappingsMap: Map<string, string[]>,
  ): Promise<{ evaluation: ControlEvaluation; isCompliant: boolean }> {
    try {
      // Map control ID to SCF code
      const targetId = control.id.replace(/^A\./, '');
      const scfCodes = mappingsMap.get(targetId) || [];
      const scfControlCode = scfCodes[0] || 'GOV-01.3'; // Fallback
      const domainCode = scfControlCode.split('-')[0];

      // --- PHASE 1: ISMS policies/procedures RAG search ---
      const { data: ismsData, error: ismsError } = await adminSupabase.rpc('match_documents_hybrid', {
        query_text: control.description,
        query_embedding: queryEmbedding,
        match_threshold: MATCH_THRESHOLD,
        match_count: 5,
        filter_framework: null,
        filter_version_id: null,
        filter_categories: ['ISMS_CORE'],
      } as any);

      if (ismsError) {
        console.error(`[Audit] ISMS Phase RPC error for ${control.id}:`, ismsError.message);
      }

      // Accept both the 20260705000001 semantic taxonomy and the legacy
      // lowercase values (rows in databases where the migration hasn't run).
      const ismsMatches = (ismsData || []).filter((chunk: any) =>
        ['POLICY', 'PROCEDURE', 'policy', 'manual', 'soa', 'matrix', 'procedure'].includes(chunk.doc_type)
      );

      let ismsPhase = { found: false, score: 0 } as any;
      if (ismsMatches.length > 0) {
        const bestIsms = ismsMatches[0];
        ismsPhase = {
          found: true,
          score: bestIsms.similarity ?? 0,
          docTitle: bestIsms.doc_title ?? bestIsms.doc_filename ?? 'Unknown',
          docFilename: bestIsms.doc_filename,
          snippet: bestIsms.content.slice(0, 300),
          chunkId: bestIsms.id,
        };
      }

      // --- PHASE 2: Evidence/Implementation RAG search ---
      const { data: evidenceData, error: evidenceError } = await adminSupabase.rpc('match_documents_hybrid', {
        query_text: control.description,
        query_embedding: queryEmbedding,
        match_threshold: MATCH_THRESHOLD,
        match_count: 5,
        filter_framework: null,
        filter_version_id: null,
        filter_categories: ['OPERATIONAL', 'ISMS_CORE'],
      } as any);

      if (evidenceError) {
        console.error(`[Audit] Evidence Phase RPC error for ${control.id}:`, evidenceError.message);
      }

      const evidenceMatches = (evidenceData || []).filter((chunk: any) =>
        chunk.doc_category === 'OPERATIONAL' ||
        ['EVIDENCE_RECORD', 'TEST_REPORT', 'evidence', 'audit_report', 'internal_audit'].includes(chunk.doc_type)
      );

      let evidencePhase = { found: false, score: 0 } as any;
      if (evidenceMatches.length > 0) {
        const bestEv = evidenceMatches[0];
        evidencePhase = {
          found: true,
          score: bestEv.similarity ?? 0,
          docTitle: bestEv.doc_title ?? bestEv.doc_filename ?? 'Unknown',
          docFilename: bestEv.doc_filename,
          snippet: bestEv.content.slice(0, 300),
          chunkId: bestEv.id,
        };
      }

      // --- 4-State Compliance Logic ---
      const ismsCompliant = ismsPhase.score >= SCORE_STRONG;
      const evidenceCompliant = evidencePhase.score >= SCORE_STRONG;

      let combinedStatus: 'conforming' | 'partial' | 'informal' | 'gap';
      if (ismsCompliant && evidenceCompliant) combinedStatus = 'conforming';
      else if (ismsCompliant && !evidenceCompliant) combinedStatus = 'partial';
      else if (!ismsCompliant && evidenceCompliant) combinedStatus = 'informal';
      else combinedStatus = 'gap';

      const isCompliant = combinedStatus === 'conforming'; // Only fully conforming is compliant
      const ismsNorm = Math.min(100, Math.round((ismsPhase.score / 0.033) * 100));
      const evNorm = Math.min(100, Math.round((evidencePhase.score / 0.033) * 100));
      const confidenceScore = Math.round((ismsNorm + evNorm) / 2);

      // Construct structured auditor notes
      const ismsStatusStr = ismsCompliant ? 'COMPLIANT' : 'NON-COMPLIANT';
      const evStatusStr = evidenceCompliant ? 'COMPLIANT' : 'NON-COMPLIANT';
      let auditorNotes = `Dual-Phase Audit (Auditor Mode):\n`;
      auditorNotes += `- Phase 1 (ISMS/Policies): ${ismsStatusStr} (RRF Score: ${ismsPhase.score.toFixed(4)})\n`;
      if (ismsPhase.found) auditorNotes += `  Document: "${ismsPhase.docTitle}"\n`;
      auditorNotes += `- Phase 2 (Technical Evidence): ${evStatusStr} (RRF Score: ${evidencePhase.score.toFixed(4)})\n`;
      if (evidencePhase.found) auditorNotes += `  Document: "${evidencePhase.docTitle}"\n`;
      auditorNotes += `Combined Status: ${combinedStatus.toUpperCase()}`;

      return {
        evaluation: {
          controlId: control.id,
          controlName: control.name,
          domain: control.domain,
          isCompliant,
          confidenceScore,
          evidenceChunkId: evidencePhase.chunkId ?? ismsPhase.chunkId ?? undefined,
          evidenceSnippet: evidencePhase.snippet ?? ismsPhase.snippet ?? undefined,
          auditorNotes,
          ismsPhase,
          evidencePhase,
          combinedStatus,
          scfControlCode,
          domainCode,
        },
        isCompliant,
      };
    } catch (err) {
      console.error(`[Audit] Error evaluating ${control.id}:`, err instanceof Error ? err.message : err);
      return {
        evaluation: {
          controlId: control.id,
          controlName: control.name,
          domain: control.domain,
          isCompliant: false,
          confidenceScore: 0,
          auditorNotes: `Evaluation error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          ismsPhase: { found: false, score: 0 },
          evidencePhase: { found: false, score: 0 },
          combinedStatus: 'gap',
        },
        isCompliant: false,
      };
    }
  }

  // Process controls in batches of 5 for parallelization
  const BATCH_SIZE = 5;
  for (let i = 0; i < controls.length; i += BATCH_SIZE) {
    const batch = controls.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = queryEmbeddings.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map((control, idx) =>
        evaluateControl(control, batchEmbeddings[idx], mappingsMap)
      )
    );

    for (const { evaluation, isCompliant } of results) {
      evaluations.push(evaluation);
      if (isCompliant) {
        implementedControlIds.push(evaluation.controlId);
      }
    }

    // Update progress after each batch
    onProgress?.({
      phase: 'evaluating',
      current: Math.min(i + batch.length, controls.length),
      total: controls.length,
      message: `[${batch[batch.length - 1].id}] ${batch[batch.length - 1].name}`,
    });

    // Rate limiting: delay every 2 batches (10 controls) to avoid throttling
    if ((i / BATCH_SIZE) % 2 === 1) {
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }

  // Phase 3: Calculate scores
  onProgress?.({
    phase: 'scoring',
    current: 0,
    total: config.frameworks.length,
    message: 'Calculating compliance scores...',
  });

  const totalIsmsCompliant = evaluations.filter(e => (e.ismsPhase?.score ?? 0) >= SCORE_STRONG).length;
  const totalEvidenceCompliant = evaluations.filter(e => (e.evidencePhase?.score ?? 0) >= SCORE_STRONG).length;
  const totalConforming = evaluations.filter(e => e.combinedStatus === 'conforming').length;
  const totalPartial = evaluations.filter(e => e.combinedStatus === 'partial').length;
  const totalInformal = evaluations.filter(e => e.combinedStatus === 'informal').length;
  const totalGap = evaluations.filter(e => e.combinedStatus === 'gap').length;

  const ismsScore = Math.round((totalIsmsCompliant / controls.length) * 100);
  const evidenceScore = Math.round((totalEvidenceCompliant / controls.length) * 100);
  const score = Math.round((totalConforming / controls.length) * 100);

  const frameworkScores: FrameworkScore[] = config.frameworks.map(fwId => ({
    frameworkId: fwId,
    score,
    implementedCount: totalConforming,
    totalRequired: controls.length,
    missingControls: evaluations
      .filter(e => e.combinedStatus !== 'conforming')
      .map(e => e.controlId),
    ismsScore,
    evidenceScore,
    conformingCount: totalConforming,
    partialCount: totalPartial,
    informalCount: totalInformal,
    gapCount: totalGap,
  }));

  // Phase 4: Result
  const completedAt = new Date().toISOString();
  const result: AssessmentResult = {
    id: crypto.randomUUID(),
    startedAt,
    completedAt,
    config,
    controlEvaluations: evaluations,
    frameworkScores,
    implementedControlIds,
    totalControlsEvaluated: evaluations.length,
    totalControlsCompliant: totalConforming,
    totalControlsMissing: evaluations.length - totalConforming,
    totalIsmsCompliant,
    totalEvidenceCompliant,
    totalConforming,
    totalPartial,
    totalInformal,
    totalGap,
  };

  onProgress?.({
    phase: 'complete',
    current: 1,
    total: 1,
    message: `Assessment complete: ${totalConforming}/${evaluations.length} controls fully conforming (${score}%). Policies: ${totalIsmsCompliant}, Evidence: ${totalEvidenceCompliant}.`,
  });

  return result;
}

