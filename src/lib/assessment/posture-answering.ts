// src/lib/assessment/posture-answering.ts
// F3 (specs/003 Onda 2) — posture-grounded answering.
//
// Questionnaire answers must be grounded in the PERSISTED control verdicts
// (control_evaluation_cache, written by the assessment engine), not in a
// fresh opinion over raw chunks. This module implements the read side:
//
//   T301  question → SCF controls (embedding match via match_scf_controls)
//   T302  persisted verdicts for those controls in scope (version × channel)
//   T303  staleness detection (verdict older than the current corpus)
//
// Composition and the fail-closed prompt (T303/T304) live in the
// generate-answers route, which consumes these primitives.

import { logger } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCorpusFingerprint } from './corpus-fingerprint';

// ── T301: question → SCF controls ───────────────────────────────────────────

/** Mappings below this similarity are too weak to ground an answer on. */
export const QUESTION_MATCH_THRESHOLD = 0.6;
/** Mappings below this similarity ground the answer but flag it for review. */
export const CONFIDENT_MATCH_THRESHOLD = 0.7;
const QUESTION_MATCH_COUNT = 5;

export interface MappedControl {
  control_code: string;
  control_name: string;
  domain_code: string;
  similarity: number;
}

/**
 * Map a question embedding onto SCF controls using the existing
 * match_scf_controls RPC (same catalog the ingest tagger uses).
 */
export async function mapQuestionToControls(
  admin: SupabaseClient,
  questionEmbedding: number[],
): Promise<MappedControl[]> {
  const { data, error } = await admin.rpc('match_scf_controls', {
    query_embedding: JSON.stringify(questionEmbedding),
    match_threshold: QUESTION_MATCH_THRESHOLD,
    match_count: QUESTION_MATCH_COUNT,
  });

  if (error) {
    logger.warn('Question → SCF control mapping failed', {
      context: 'posture-answering',
      meta: { error: error.message },
    });
    return [];
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    control_code: String(row.control_code),
    control_name: String(row.control_name ?? row.control_code),
    domain_code: String(row.domain_code ?? ''),
    similarity: Number(row.similarity ?? 0),
  }));
}

// ── T302: persisted verdicts in scope ───────────────────────────────────────

export interface VerdictScope {
  productVersionId?: string | null;
  salesChannel?: 'B2B_GEHC' | 'B2B_DIRECT' | null;
}

export interface ControlVerdict {
  controlCode: string;
  combinedStatus: 'conforming' | 'partial' | 'informal' | 'gap';
  confidenceScore: number;
  evaluatedAt: string;
  scopeKey: string;
  mode: 'quick' | 'deep';
  /** True when the verdict predates the current document corpus. */
  stale: boolean;
  /** True when the verdict came from the non-authoritative local fallback. */
  isEstimated: boolean;
  evidenceDocTitle?: string;
  evidenceSnippet?: string;
  auditorNotes?: string;
}

/**
 * Rank how well a cached scope_key matches the requested scope. Higher wins;
 * -1 means the row belongs to a DIFFERENT version/channel and must never
 * ground an answer for this scope (channel isolation).
 */
export function rankScope(
  scopeKey: string,
  wanted: { versionPart: string; channelPart: string },
): number {
  const [versionPart, channelPart] = scopeKey.split(':');
  const versionOk = versionPart === wanted.versionPart || versionPart === 'global';
  const channelOk = channelPart === wanted.channelPart || channelPart === 'all';
  if (!versionOk || !channelOk) return -1;

  let rank = 0;
  if (versionPart === wanted.versionPart) rank += 2; // exact version beats global
  if (channelPart === wanted.channelPart) rank += 1; // exact channel beats all
  return rank;
}

interface CacheRow {
  control_code: string;
  mode: 'quick' | 'deep';
  scope_key: string;
  corpus_fingerprint: string;
  evaluation: Record<string, unknown>;
  evaluated_at: string;
}

/**
 * Pick the best verdict row per control: in-scope only, then highest scope
 * rank, deep over quick, newest last. Pure — exported for tests.
 */
export function selectBestVerdicts(
  rows: CacheRow[],
  wanted: { versionPart: string; channelPart: string },
  currentFingerprint: string,
): Map<string, ControlVerdict> {
  const best = new Map<string, { row: CacheRow; rank: number }>();

  for (const row of rows) {
    const rank = rankScope(row.scope_key, wanted);
    if (rank < 0) continue;

    const existing = best.get(row.control_code);
    const beats =
      !existing ||
      rank > existing.rank ||
      (rank === existing.rank && row.mode === 'deep' && existing.row.mode === 'quick') ||
      (rank === existing.rank && row.mode === existing.row.mode && row.evaluated_at > existing.row.evaluated_at);
    if (beats) best.set(row.control_code, { row, rank });
  }

  const verdicts = new Map<string, ControlVerdict>();
  for (const [code, { row }] of best) {
    const ev = row.evaluation ?? {};
    const ismsPhase = ev.ismsPhase as Record<string, unknown> | undefined;
    verdicts.set(code, {
      controlCode: code,
      combinedStatus: (ev.combinedStatus as ControlVerdict['combinedStatus']) ?? 'gap',
      confidenceScore: Number(ev.confidenceScore ?? 0),
      evaluatedAt: row.evaluated_at,
      scopeKey: row.scope_key,
      mode: row.mode,
      stale: row.corpus_fingerprint !== currentFingerprint,
      isEstimated: ev.isEstimated === true,
      evidenceDocTitle: (ismsPhase?.docTitle as string | undefined) ?? undefined,
      evidenceSnippet: (ev.evidenceSnippet as string | undefined) ?? undefined,
      auditorNotes: (ev.auditorNotes as string | undefined) ?? undefined,
    });
  }
  return verdicts;
}

/**
 * Load the persisted verdicts for the mapped controls in the requested
 * version × channel scope. Verdicts from other channels/versions are never
 * returned (isolation), and staleness is computed against the live corpus.
 */
export async function getPersistedVerdicts(
  admin: SupabaseClient,
  controlCodes: string[],
  scope: VerdictScope,
): Promise<Map<string, ControlVerdict>> {
  if (controlCodes.length === 0) return new Map();

  const wanted = {
    versionPart: scope.productVersionId ?? 'global',
    channelPart: scope.salesChannel ?? 'all',
  };

  try {
    const currentFingerprint = await getCorpusFingerprint(scope.productVersionId ?? null);

    // control_evaluation_cache is not yet in the generated Supabase types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from('control_evaluation_cache')
      .select('control_code, mode, scope_key, corpus_fingerprint, evaluation, evaluated_at')
      .in('control_code', controlCodes);

    if (error) {
      logger.warn('Persisted verdict lookup failed', {
        context: 'posture-answering',
        meta: { error: error.message },
      });
      return new Map();
    }

    return selectBestVerdicts((data ?? []) as CacheRow[], wanted, currentFingerprint);
  } catch (err) {
    logger.warn('Persisted verdict lookup unavailable', {
      context: 'posture-answering',
      meta: { error: err instanceof Error ? err.message : 'unknown' },
    });
    return new Map();
  }
}

// ── T303: posture block for the answer prompt ───────────────────────────────

const STATUS_LABEL: Record<ControlVerdict['combinedStatus'], string> = {
  conforming: 'CONFORMING — policy and operational evidence found',
  partial: 'PARTIAL — policy exists, operational evidence missing',
  informal: 'INFORMAL — practice observed without formal policy',
  gap: 'GAP — no indexed evidence',
};

export interface PostureGrounding {
  /** Prompt block describing the persisted verdicts (empty string if none). */
  contextBlock: string;
  /** Controls the question mapped to, enriched with their verdict when any. */
  mappedControls: Array<{
    code: string;
    name: string;
    similarity: number;
    status?: ControlVerdict['combinedStatus'];
    stale?: boolean;
  }>;
  /** True when any grounding verdict predates the current corpus. */
  hasStaleVerdict: boolean;
  /** True when the mapping is too weak to answer confidently. */
  weakMapping: boolean;
  /** True when at least one mapped control has a persisted verdict. */
  hasVerdicts: boolean;
}

/** Compose the grounding block from mapping + verdicts. Pure — testable. */
export function buildPostureGrounding(
  mapped: MappedControl[],
  verdicts: Map<string, ControlVerdict>,
): PostureGrounding {
  const mappedControls = mapped.map((m) => {
    const v = verdicts.get(m.control_code);
    return {
      code: m.control_code,
      name: m.control_name,
      similarity: m.similarity,
      status: v?.combinedStatus,
      stale: v?.stale,
    };
  });

  const grounded = mapped
    .map((m) => ({ m, v: verdicts.get(m.control_code) }))
    .filter((x): x is { m: MappedControl; v: ControlVerdict } => x.v !== undefined);

  const hasStaleVerdict = grounded.some((g) => g.v.stale);
  const weakMapping =
    mapped.length === 0 || mapped.every((m) => m.similarity < CONFIDENT_MATCH_THRESHOLD);

  let contextBlock = '';
  if (grounded.length > 0) {
    const lines = grounded.map(({ m, v }) => {
      const flags: string[] = [];
      if (v.stale) flags.push('STALE — corpus changed since this evaluation; re-run the assessment');
      if (v.isEstimated) flags.push('ESTIMATED — non-authoritative local fallback');
      const flagSuffix = flags.length > 0 ? ` [${flags.join('; ')}]` : '';
      const evidence = v.evidenceDocTitle ? ` Evidence: "${v.evidenceDocTitle}".` : '';
      return (
        `- ${m.control_code} (${m.control_name}): ${STATUS_LABEL[v.combinedStatus]}. ` +
        `Confidence ${v.confidenceScore}/100, evaluated ${v.evaluatedAt} (${v.mode} mode).${evidence}${flagSuffix}`
      );
    });
    contextBlock = `EVALUATED POSTURE (persisted control verdicts — the primary source of truth):\n${lines.join('\n')}`;
  }

  return {
    contextBlock,
    mappedControls,
    hasStaleVerdict,
    weakMapping,
    hasVerdicts: grounded.length > 0,
  };
}
