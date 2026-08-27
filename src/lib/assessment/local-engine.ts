import { createAdminClient } from '@/lib/supabase/admin';
import { generateEmbeddings } from '@/lib/chat/embeddings';
import type {
  AssessmentConfig,
  AssessmentResult,
  ControlEvaluation,
  FrameworkScore,
  ProgressCallback,
} from './engine';
import { projectFrameworkFromCrosswalk } from './projection';

// ---------------------------------------------------------------------------
// The control base
//
// Was: ./data/iso27001-annex-a.json — 93 hand-maintained ISO Annex A controls,
// a committed duplicate of a catalogue we do not own. Because this engine began
// with ISO controls it had to guess an SCF code for each one
// (`control.id.replace(/^A\./,'')` looked up in scf_framework_mappings) and
// substituted a hardcoded 'GOV-01.3' when the guess missed — deriving the
// domain from that default too.
//
// Now: scf_controls_cache, the vendor's catalogue, populated by
// src/lib/standard-api/sync/catalog.ts. The control IS the SCF control, so
// nothing is guessed and the fallback has nothing to fall back from.
//
// Consequence worth knowing before running this: the catalogue is roughly
// 1,468 controls rather than 93, and every control's description is embedded.
// That is ~16× the embedding cost of a run against the old JSON.
// ---------------------------------------------------------------------------

interface CatalogControl {
  id: string;          // control_code, e.g. "AAT-01"
  name: string;        // control_title
  domain: string;      // domain prefix of the code, e.g. "AAT"
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

  // Phase 1: Load the vendor's control catalogue from local storage.
  //
  // No mapping lookup happens here any more. It used to exist so an ISO Annex A
  // id could be turned into an SCF code; iterating SCF controls makes that
  // translation unnecessary. Framework requirements are joined later, by the
  // projection, from the official crosswalk.
  const { data: catalogRows, error: catalogError } = await (
    adminSupabase as unknown as {
      from: (t: string) => {
        select: (c: string) => Promise<{
          data: Array<Record<string, unknown>> | null;
          error: { message: string } | null;
        }>;
      };
    }
  )
    .from('scf_controls_cache')
    .select('control_code, control_title, control_description');

  if (catalogError) {
    throw new Error(`could not read scf_controls_cache: ${catalogError.message}`);
  }

  const controls: CatalogControl[] = (catalogRows ?? [])
    .map((r) => {
      const code = typeof r.control_code === 'string' ? r.control_code : '';
      return {
        id: code,
        name: typeof r.control_title === 'string' ? r.control_title : code,
        domain: code.split('-')[0] ?? '',
        description:
          typeof r.control_description === 'string' && r.control_description.length > 0
            ? r.control_description
            : typeof r.control_title === 'string'
              ? r.control_title
              : code,
      };
    })
    .filter((c) => c.id.length > 0);

  if (controls.length === 0) {
    // Silence here is what produced three nightly runs recording scores against
    // zero evaluated controls. An empty catalogue is a setup failure, not a 0%.
    throw new Error(
      'scf_controls_cache is empty — run the SCF catalogue sync before assessing. ' +
        'POST /api/admin/sync/scf',
    );
  }

  onProgress?.({
    phase: 'loading_controls',
    current: controls.length,
    total: controls.length,
    message: `Loaded ${controls.length} SCF controls from the local catalogue.`,
  });

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
    control: CatalogControl,
    queryEmbedding: number[],
  ): Promise<{ evaluation: ControlEvaluation; isCompliant: boolean }> {
    try {
      // The control IS the SCF control. No translation, and therefore no
      // fallback: the previous `scfCodes[0] || 'GOV-01.3'` silently attributed
      // an unmapped control to a default and derived its domain from that.
      const scfControlCode = control.id;
      const domainCode = control.domain;

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
      batch.map((control, idx) => evaluateControl(control, batchEmbeddings[idx]))
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

  // Catalogue coverage: what share of the SCF catalogue this organisation
  // conforms to. A real number, and NOT a framework score — kept on each
  // framework row as ismsScore/evidenceScore, which is what they always were.
  const ismsScore = Math.round((totalIsmsCompliant / controls.length) * 100);
  const evidenceScore = Math.round((totalEvidenceCompliant / controls.length) * 100);

  // What this replaces:
  //
  //   const score = Math.round((totalConforming / controls.length) * 100);
  //   config.frameworks.map(fwId => ({ frameworkId: fwId, score, ... }))
  //
  // One number — conforming controls over the catalogue's own length — assigned
  // to every requested framework. Asking for iso27001 and soc2 returned the
  // SAME figure twice, each labelled as that framework's compliance. A figure
  // that cannot differ between frameworks is not a framework figure, and
  // presenting it as one is the same defect class as the 25,589 fabricated
  // mapping rows: something framework-independent wearing a framework's name.
  //
  // Now each framework is projected separately from the official crosswalk, so
  // two frameworks differ exactly insofar as their requirements do.
  const frameworkScores: FrameworkScore[] = [];
  for (const fwId of config.frameworks) {
    const shared = {
      ismsScore,
      evidenceScore,
      conformingCount: totalConforming,
      partialCount: totalPartial,
      informalCount: totalInformal,
      gapCount: totalGap,
    };

    try {
      const projection = await projectFrameworkFromCrosswalk(fwId, evaluations);
      frameworkScores.push({
        frameworkId: fwId,
        // The projection returns a ratio; FrameworkScore is 0-100.
        score: projection.score === null ? null : projection.score * 100,
        implementedCount: projection.requirementsSatisfied,
        totalRequired: projection.requirementsTotal,
        missingControls: [],
        message:
          projection.reason === 'no_requirements_mapped'
            ? `No requirements mapped for ${fwId} — nothing to score against. ` +
              'Run the crosswalk sync, and check framework_identity_curation names it.'
            : undefined,
        policyVersion: projection.policyVersion,
        policyOwner: projection.policyOwner,
        requirementsNeedingReview: projection.requirementsNeedingReview,
        requirementsPartial: projection.requirementsPartial,
        requirementsUnevaluated: projection.requirementsUnevaluated,
        ...shared,
      });
    } catch (err) {
      // Absence of a score, stated. Not a zero.
      frameworkScores.push({
        frameworkId: fwId,
        score: null,
        implementedCount: 0,
        totalRequired: 0,
        missingControls: [],
        message: `Could not project ${fwId}: ${err instanceof Error ? err.message : 'unknown error'}`,
        ...shared,
      });
    }
  }

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
    // Reports catalogue coverage, and says that is what it is. The framework
    // figures are per-framework and live in frameworkScores — deliberately not
    // summarised into one number here, because that conflation is the defect
    // this change removed.
    message:
      `Assessment complete: ${totalConforming}/${evaluations.length} SCF controls fully conforming. ` +
      `Policies: ${totalIsmsCompliant}, Evidence: ${totalEvidenceCompliant}. ` +
      `Framework figures: ${frameworkScores
        .map((f) => `${f.frameworkId} ${f.score === null ? 'no score' : `${Math.round(f.score)}%`}`)
        .join(', ')}.`,
  });

  return result;
}

