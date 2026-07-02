// src/lib/assessment/engine.ts
// Core Assessment Engine — orchestrates RAG + Standard API

import { searchDocuments } from '@/lib/chat/rag-search';
import * as standardApi from '@/lib/standard-api/client';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCorpusFingerprint } from './corpus-fingerprint';

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
  forceReevaluate?: boolean; // skip the persisted-evaluation cache and re-query RAG/Standard API for every control
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
  
  // 2-Phase addition:
  ismsPhase?: {
    found: boolean;
    score: number;
    docTitle?: string;
    docFilename?: string;
    snippet?: string;
    chunkId?: number | null;
  };
  evidencePhase?: {
    found: boolean;
    score: number;
    docTitle?: string;
    docFilename?: string;
    snippet?: string;
    chunkId?: number | null;
  };
  combinedStatus?: 'conforming' | 'partial' | 'informal' | 'gap';
  scfControlCode?: string;
  domainCode?: string;

  // Persisted-evaluation cache (see corpus-fingerprint.ts)
  fromCache?: boolean;
  cachedAt?: string;
}

export interface FrameworkScore {
  frameworkId: string;
  score: number;
  implementedCount: number;
  totalRequired: number;
  missingControls: string[];
  message?: string;
  
  // 2-Phase scores and counts
  ismsScore?: number;
  evidenceScore?: number;
  conformingCount?: number;
  partialCount?: number;
  informalCount?: number;
  gapCount?: number;
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
  
  // 2-Phase totals
  totalIsmsCompliant?: number;
  totalEvidenceCompliant?: number;
  totalConforming?: number;
  totalPartial?: number;
  totalInformal?: number;
  totalGap?: number;

  // Cache reuse stats — evidence of API-usage minimization
  totalFromCache?: number;
  totalFreshlyEvaluated?: number;
}

// ---------------------------------------------------------------------------
// Default frameworks (re-exported from canonical registry)
// Ponytail rung 2: import from the source, not a re-export barrel
export { DEFAULT_FRAMEWORKS } from './framework-registry';

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
  let allControls: any[] = [];
  let page = 1;
  const perPage = 200;

  const MAX_PAGES = 20;
  while (page <= MAX_PAGES) {
    const batch = await standardApi.getScfControls(scfVersion.scf_version_id, page, perPage);
    const items = batch.data || [];
    allControls.push(...items);
    if (items.length < perPage) break;
    page++;
  }

  if (page > MAX_PAGES) {
    console.warn(`[Assessment] Reached max page limit (${MAX_PAGES}), loaded ${allControls.length} controls`);
  }

  // Optimize: Filter controls by selected frameworks to avoid timing out on 1,468 items
  if (config.frameworks && config.frameworks.length > 0) {
    try {
      const supabase = await createClient();
      const { data: mappings } = await supabase
        .from('scf_framework_mappings')
        .select('scf_control_code')
        .in('framework_code', config.frameworks);
        
      if (mappings && mappings.length > 0) {
        const relevantControlIds = new Set(mappings.map((m: any) => m.scf_control_code));
        allControls = allControls.filter(c => relevantControlIds.has(c.control_id || c.id));
      } else {
        // If no mappings exist for the selected frameworks, do NOT evaluate all 1,468 controls!
        // This avoids the 5-minute Vercel timeout.
        allControls = [];
      }
    } catch (err) {
      console.warn('[Assessment] Failed to filter controls by framework, falling back to all controls:', err);
      // In case of DB error, we also avoid evaluating 1,468 controls to prevent timeout
      allControls = [];
    }
  }

  onProgress?.({
    phase: 'loading_controls',
    current: allControls.length,
    total: allControls.length,
    message: `Loaded ${allControls.length} relevant SCF controls.`,
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

  // ── Persisted-evaluation cache ────────────────────────────────────────
  // The document corpus is the source of truth for control status. Reuse the
  // last evaluation for a control unless the corpus changed since then (or
  // the caller explicitly forces a re-evaluation), so RAG search and the
  // Standard GRC Engine API are only called for what actually needs it.
  const scopeKey = `${config.productVersionId ?? 'global'}:${config.salesChannel ?? 'all'}`;
  const corpusFingerprint = await getCorpusFingerprint(config.productVersionId ?? null);
  const cacheMap = new Map<string, { corpusFingerprint: string; evaluation: ControlEvaluation; evaluatedAt: string }>();
  if (!config.forceReevaluate) {
    const admin = createAdminClient();
    // control_evaluation_cache is not yet in the generated Supabase types
    // (see plan.md Stream A1 — types need regeneration); cast until then.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cacheRows } = await (admin as any)
      .from('control_evaluation_cache')
      .select('control_code, corpus_fingerprint, evaluation, evaluated_at')
      .eq('mode', config.mode)
      .eq('scope_key', scopeKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (cacheRows ?? []) as any[]) {
      cacheMap.set(row.control_code, {
        corpusFingerprint: row.corpus_fingerprint,
        evaluation: row.evaluation,
        evaluatedAt: row.evaluated_at,
      });
    }
  }

  // Retry helper for API calls
  async function retryApiCall<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    let lastErr;
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, i))); // Exponential backoff
      }
    }
    throw lastErr;
  }

  // Evaluate in batches of 10 to prevent API timeouts while avoiding rate limits
  const BATCH_SIZE = 10;
  for (let i = 0; i < allControls.length; i += BATCH_SIZE) {
    const batch = allControls.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (control, batchIndex): Promise<ControlEvaluation> => {
      const globalIndex = i + batchIndex;
      const controlId = control.control_id || control.id || `CTRL-${globalIndex}`;
      const controlName = control.control_name || control.name || controlId;
      const controlDomain = control.domain || controlId.split('-')[0] || 'UNKNOWN';
      const controlDescription = control.control_description || control.description || controlName;

      // Cache hit: the document corpus hasn't changed since this control was
      // last evaluated for this scope — reuse it instead of calling RAG/API.
      const cached = cacheMap.get(controlId);
      if (cached && cached.corpusFingerprint === corpusFingerprint) {
        onProgress?.({
          phase: 'evaluating',
          current: globalIndex + 1,
          total: allControls.length,
          message: `${controlId}: reused persisted evaluation (no documentation changes)`,
        });
        return { ...cached.evaluation, controlId, controlName, domain: controlDomain, fromCache: true, cachedAt: cached.evaluatedAt };
      }

      onProgress?.({
        phase: 'evaluating',
        current: globalIndex + 1,
        total: allControls.length,
        message: `Evaluating ${controlId}: ${controlName}`,
      });

      // Step 2a: Search RAG for evidence using all category filters
      const ragResults = await searchDocuments(controlDescription, {
        productVersionId: config.productVersionId || undefined,
        limit: 3,
        threshold: similarityThreshold,
        categories: categoryFilters,
      });

      if (ragResults.length === 0) {
        return {
          controlId,
          controlName,
          domain: controlDomain,
          isCompliant: false,
          confidenceScore: 0,
          auditorNotes: 'No evidence found in any ISMS document.',
          combinedStatus: 'gap' as const,
          ismsPhase: { found: false, score: 0 },
          evidencePhase: { found: false, score: 0 },
        };
      }

      const bestEvidenceId = ragResults[0].id;
      // Combine all retrieved chunks to give LLM full context
      const combinedEvidence = ragResults.map(r => r.content).join('\n\n---\n\n');

      // Quick mode: skip LLM and rely on RAG similarity threshold
      if (config.mode === 'quick') {
        // We know ragResults > 0 and the first result met the semantic threshold
        // Map similarity (0-1) to confidence score (0-100)
        const mappedConfidence = Math.round(ragResults[0].similarity * 100);
        const isCompliant = mappedConfidence >= confidenceThreshold;
        
        // Derive dual-phase status from RAG results
        const ismsPhase = {
          found: ragResults[0].similarity >= similarityThreshold,
          score: ragResults[0].similarity,
          docTitle: ragResults[0].metadata?.documentTitle,
          snippet: ragResults[0].content?.slice(0, 200),
          chunkId: ragResults[0].id,
        };
        // Quick mode: evidence phase = same as ISMS (no separate check)
        const evidencePhase = { found: false, score: 0 };
        const combinedStatus: 'conforming' | 'partial' | 'informal' | 'gap' =
          ismsPhase.found ? 'partial' : 'gap';

        return {
          controlId,
          controlName,
          domain: controlDomain,
          isCompliant,
          confidenceScore: mappedConfidence,
          evidenceChunkId: bestEvidenceId,
          evidenceSnippet: ragResults[0].content.slice(0, 200),
          auditorNotes: isCompliant ? 'Approved via semantic similarity (Quick Scan).' : 'Similarity below threshold (Quick Scan).',
          ismsPhase,
          evidencePhase,
          combinedStatus,
        };
      }

      // Deep mode: Validate via Standard API evaluate-evidence with full context and retries
      // Also run dual-phase: separate ISMS policy check and operational evidence check
      try {
        // Phase 1: ISMS policy search (narrower category)
        const ismsResults = await searchDocuments(controlDescription, {
          productVersionId: config.productVersionId || undefined,
          limit: 3,
          threshold: similarityThreshold,
          categories: ['ISMS_CORE'],
        });
        const ismsPhase = {
          found: ismsResults.length > 0 && ismsResults[0].similarity >= similarityThreshold,
          score: ismsResults[0]?.similarity ?? 0,
          docTitle: ismsResults[0]?.metadata?.documentTitle,
          snippet: ismsResults[0]?.content?.slice(0, 200),
          chunkId: ismsResults[0]?.id ?? null,
        };

        // Phase 2: Operational evidence search
        const evidenceResults = await searchDocuments(controlDescription, {
          productVersionId: config.productVersionId || undefined,
          limit: 3,
          threshold: similarityThreshold,
          categories: ['OPERATIONAL', 'ISMS_CORE'],
        });
        const evidencePhase = {
          found: evidenceResults.length > 0 && evidenceResults[0].similarity >= similarityThreshold,
          score: evidenceResults[0]?.similarity ?? 0,
          docTitle: evidenceResults[0]?.metadata?.documentTitle,
          snippet: evidenceResults[0]?.content?.slice(0, 200),
          chunkId: evidenceResults[0]?.id ?? null,
        };

        // Determine combined status
        const combinedStatus: 'conforming' | 'partial' | 'informal' | 'gap' =
          ismsPhase.found && evidencePhase.found ? 'conforming'
          : ismsPhase.found ? 'partial'
          : evidencePhase.found ? 'informal'
          : 'gap';

        const evalResult = await retryApiCall(() => standardApi.evaluateEvidence({
          controlRequirement: controlDescription,
          evidenceDescription: combinedEvidence,
        } as any));

        const confidence = (evalResult as any).confidence_score ?? 0;
        const isCompliant = (evalResult as any).is_compliant === true && confidence >= confidenceThreshold;

        return {
          controlId,
          controlName,
          domain: controlDomain,
          isCompliant,
          confidenceScore: confidence,
          evidenceChunkId: bestEvidenceId,
          evidenceSnippet: ragResults[0].content.slice(0, 200),
          auditorNotes: (evalResult as any).auditor_notes ?? '',
          ismsPhase,
          evidencePhase,
          combinedStatus,
        };
      } catch (err) {
        // Mark as evaluation_error instead of non-compliant (audit item #6)
        return {
          controlId,
          controlName,
          domain: controlDomain,
          isCompliant: false,
          confidenceScore: 0,
          evidenceChunkId: bestEvidenceId,
          evidenceSnippet: ragResults[0].content.slice(0, 200),
          auditorNotes: `[EVALUATION_ERROR] API evaluation failed after retries: ${err instanceof Error ? err.message : 'Unknown error'}`,
          combinedStatus: 'gap' as const,
          ismsPhase: { found: false, score: 0 },
          evidencePhase: { found: false, score: 0 },
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    // Store evaluations and track implemented controls
    for (const result of batchResults) {
      evaluations.push(result);
      if (result.isCompliant) {
        implementedControlIds.push(result.controlId);
      }
    }

    // Persist freshly-evaluated (non-cached, non-error) controls so the next
    // run can reuse them until the document corpus changes.
    const toCache = batchResults.filter(
      (r) => !r.fromCache && !r.auditorNotes?.startsWith('[EVALUATION_ERROR]'),
    );
    if (toCache.length > 0) {
      const admin = createAdminClient();
      const evaluatedAt = new Date().toISOString();
      const cacheRows = toCache.map((r) => ({
        control_code: r.controlId,
        mode: config.mode,
        product_version_id: config.productVersionId ?? null,
        sales_channel: config.salesChannel ?? null,
        scope_key: scopeKey,
        corpus_fingerprint: corpusFingerprint,
        evaluation: r,
        evaluated_at: evaluatedAt,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: cacheError } = await (admin as any)
        .from('control_evaluation_cache')
        .upsert(cacheRows, { onConflict: 'control_code,mode,scope_key' });
      if (cacheError) {
        console.warn('[Assessment] Failed to persist control evaluation cache:', cacheError.message);
      }
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

  // Compute dual-phase totals
  const totalIsmsCompliant = evaluations.filter(e => e.ismsPhase?.found).length;
  const totalEvidenceCompliant = evaluations.filter(e => e.evidencePhase?.found).length;
  const totalConforming = evaluations.filter(e => e.combinedStatus === 'conforming').length;
  const totalPartial = evaluations.filter(e => e.combinedStatus === 'partial').length;
  const totalInformal = evaluations.filter(e => e.combinedStatus === 'informal').length;
  const totalGap = evaluations.filter(e => e.combinedStatus === 'gap').length;
  const totalFromCache = evaluations.filter(e => e.fromCache).length;
  const totalFreshlyEvaluated = evaluations.length - totalFromCache;

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
    // 2-Phase totals
    totalIsmsCompliant,
    totalEvidenceCompliant,
    totalConforming,
    totalPartial,
    totalInformal,
    totalGap,
    totalFromCache,
    totalFreshlyEvaluated,
  };

  onProgress?.({
    phase: 'complete',
    current: 1,
    total: 1,
    message: `Assessment complete: ${totalCompliant}/${evaluations.length} controls compliant (${totalConforming} conforming, ${totalPartial} partial, ${totalInformal} informal, ${totalGap} gaps). ${totalFromCache} reused from cache, ${totalFreshlyEvaluated} freshly evaluated.`,
  });

  return result;
}
