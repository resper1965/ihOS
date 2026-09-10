// src/lib/assessment/assessment-to-scorecard.ts
// Pipeline: Assessment results → intelligence_snapshots (scorecard)
// This ensures the dashboard scorecard always reflects REAL evaluated data,
// never hardcoded scores.

import { createAdminClient } from '@/lib/supabase/admin';
import type { AssessmentResult, FrameworkScore } from './engine';
import { resolveFrameworkName, resolveFrameworkIcon } from './framework-registry';
import { Redis } from '@upstash/redis';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || "";
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

/**
 * Whether a framework's score rests on anything.
 *
 * Two ways it does not:
 * - `totalRequired === 0`: nothing was required, so nothing was measured.
 *   Writing a score in that state produced the 2026-08-26 incident: an
 *   assessment that evaluated zero controls deleted the existing scorecard
 *   rows and wrote 0.0, and an operator had to remove them by hand.
 * - `score === null`: the projection could not decide a single requirement.
 *   This writer used to recompute implemented/total itself and write 0% —
 *   "cannot compute" turned into "0% compliant", one layer below where
 *   finding I2 closed it (spec 2026-09-10 §3.6).
 *
 * A computed zero — requirements decided, none satisfied — IS backed and must
 * still be written. That is a finding, not an absence.
 */
export function isScoreBacked<T extends { totalRequired: number; score: number | null }>(
  fw: T,
): fw is T & { score: number } {
  return fw.totalRequired > 0 && fw.score !== null;
}

/** One framework of the 'all' container, as a screen or an alert may show it. */
export interface StampedFrameworkEntry {
  code: string;
  name: string;
  /** 0-100, from the projection. */
  score: number;
  /** Requirements satisfied. */
  satisfied: number;
  /** Requirements in the official crosswalk: the denominator. */
  total: number;
  policyVersion: string;
  policyOwner: string | null;
}

/**
 * The entries of an 'all' scorecard row that can be shown: scored, with a
 * denominator, and stamped with the curation policy that produced them.
 *
 * Everything else is dropped rather than shown. Until 2026-09-10 the
 * agentic-triggers cron wrote this row from the legacy scf_framework_mappings
 * with no stamp; a number that cannot name its policy is not one this product
 * can defend (spec 2026-09-10 §4).
 */
export function stampedFrameworkEntries(snapshotData: unknown): StampedFrameworkEntry[] {
  const frameworks = (snapshotData as { frameworks?: unknown } | null | undefined)?.frameworks;
  if (!Array.isArray(frameworks)) return [];
  return frameworks.flatMap((raw): StampedFrameworkEntry[] => {
    const e = raw as Record<string, unknown>;
    if (
      typeof e.code !== 'string' ||
      typeof e.policy_version !== 'string' ||
      typeof e.score !== 'number' ||
      typeof e.total_required !== 'number' ||
      e.total_required <= 0
    ) {
      return [];
    }
    return [
      {
        code: e.code,
        name: typeof e.name === 'string' ? e.name : e.code,
        score: e.score,
        satisfied: typeof e.implemented === 'number' ? e.implemented : 0,
        total: e.total_required,
        policyVersion: e.policy_version,
        policyOwner: typeof e.policy_owner === 'string' ? e.policy_owner : null,
      },
    ];
  });
}

/**
 * After an assessment completes, sync its scores into intelligence_snapshots.
 * This replaces any previous scorecard snapshots for the evaluated frameworks,
 * so the dashboard always shows the latest REAL assessment results.
 */
export async function syncScorecard(
  assessmentId: string,
  result: AssessmentResult,
): Promise<void> {
  const adminSupabase = createAdminClient();

  // Run-scoped result quality. These are properties of the ASSESSMENT RUN, not
  // of any one framework. `is_estimated` is now only ever a historical fact:
  // the local fallback that produced it was removed on 2026-09-09, so no new
  // run can set it. Rows written before that date still carry it and must
  // still be shown — the dashboard's framework list skips the 'all' aggregate
  // (`if (code === "all") continue` in compliance-data.ts), so a warning that
  // lived only on the aggregate would never reach the cards a user reads.
  const runEstimatedCount = result.totalEstimated ?? 0;
  const runEvaluationErrorCount = result.totalEvaluationErrors ?? 0;

  // ── 1. Upsert individual framework scorecards ──────────────────────
  for (const fw of result.frameworkScores) {
    const code = fw.frameworkId;

    // Nothing was evaluated for this framework, so there is no score to state.
    // Crucially this also skips the DELETE below: overwriting a real previous
    // score with an unbacked one is how the 2026-08-26 incident destroyed the
    // only figures on the dashboard.
    if (!isScoreBacked(fw)) {
      console.warn(
        `[syncScorecard] Skipping ${code}: score not backed (0 controls required or cannot compute). Existing scorecard left untouched.`,
      );
      continue;
    }

    // The projection's score, not a recomputation: recomputing is what turned
    // a null ("cannot compute") into 0%. isScoreBacked narrowed it to a number.
    const score = Math.round(fw.score);
    const coverage = Math.round((fw.implementedCount / fw.totalRequired) * 100);

    const snapshotData = {
      name: resolveFrameworkName(code),
      score,
      coverage,
      missing: fw.missingControls.length,
      source: 'assessment_engine',
      assessment_id: assessmentId,
      implemented: fw.implementedCount,
      total_required: fw.totalRequired,
      evaluated_at: result.completedAt,
      // Which curation policy produced this score, and who answers for it.
      policy_version: fw.policyVersion ?? null,
      policy_owner: fw.policyOwner ?? null,
      // 2-Phase addition:
      isms_score: fw.ismsScore ?? null,
      evidence_score: fw.evidenceScore ?? null,
      conforming_count: fw.conformingCount ?? null,
      partial_count: fw.partialCount ?? null,
      informal_count: fw.informalCount ?? null,
      gap_count: fw.gapCount ?? null,
      // Run-scoped result quality (see above) — never omit, so the UI can
      // qualify the score instead of presenting it as fully authoritative.
      run_estimated_count: runEstimatedCount,
      run_evaluation_error_count: runEvaluationErrorCount,
    };

    // Delete previous scorecard for this framework, then insert fresh
    await adminSupabase
      .from('intelligence_snapshots')
      .delete()
      .eq('snapshot_type', 'scorecard')
      .eq('framework_code', code);

    await adminSupabase
      .from('intelligence_snapshots')
      .insert({
        snapshot_type: 'scorecard',
        framework_code: code,
        input_payload: {
          assessment_id: assessmentId,
          mode: result.config.mode,
          source: 'assessment_engine',
        },
        result_payload: {
          score,
          implemented: fw.implementedCount,
          total_required: fw.totalRequired,
          missing_controls: fw.missingControls.slice(0, 20),
          policy_version: fw.policyVersion ?? null,
          policy_owner: fw.policyOwner ?? null,
          isms_score: fw.ismsScore ?? null,
          evidence_score: fw.evidenceScore ?? null,
          conforming_count: fw.conformingCount ?? null,
          partial_count: fw.partialCount ?? null,
          informal_count: fw.informalCount ?? null,
          gap_count: fw.gapCount ?? null,
          run_estimated_count: runEstimatedCount,
          run_evaluation_error_count: runEvaluationErrorCount,
        },
        snapshot_data: snapshotData,
        score: score,
        user_id: null,
        metadata: null,
      });
  }

  // ── 2. Update the "all" container ──────────────────────────────────
  // It holds the per-framework entries that the agent tool, the MCP tool and
  // the Overview cards read. It no longer holds a cross-framework score:
  // `overall_score` divided compliant controls by evaluated controls, summed
  // across every framework — a blend of different standards in a unit no
  // other screen used (spec 2026-09-10 §2, §4).
  //
  // Only backed frameworks get an entry. Writing the container from an
  // all-unbacked run produced the null-scored 'all' row the 2026-08-26
  // cleanup had to remove.
  const backedFrameworks = result.frameworkScores.filter(isScoreBacked);
  if (backedFrameworks.length === 0) {
    console.warn('[syncScorecard] No framework had a backed score; leaving the aggregate untouched.');
    return;
  }

  const allFrameworks = backedFrameworks.map((fw) => {
    const code = fw.frameworkId;
    const score = Math.round(fw.score);

    return {
      code,
      name: resolveFrameworkName(code),
      score,
      coverage: score,
      missing: fw.missingControls.length,
      icon: resolveFrameworkIcon(code),
      implemented: fw.implementedCount,
      total_required: fw.totalRequired,
      policy_version: fw.policyVersion ?? null,
      policy_owner: fw.policyOwner ?? null,
      // 2-Phase addition:
      isms_score: fw.ismsScore ?? null,
      evidence_score: fw.evidenceScore ?? null,
      conforming_count: fw.conformingCount ?? null,
      partial_count: fw.partialCount ?? null,
      informal_count: fw.informalCount ?? null,
      gap_count: fw.gapCount ?? null,
      run_estimated_count: runEstimatedCount,
      run_evaluation_error_count: runEvaluationErrorCount,
    };
  });

  const totalIsms = result.totalIsmsCompliant ?? 0;
  const totalEv = result.totalEvidenceCompliant ?? 0;
  const conforming = result.totalConforming ?? 0;
  const partial = result.totalPartial ?? 0;
  const informal = result.totalInformal ?? 0;
  const gap = result.totalGap ?? 0;

  const allIsmsScore = result.totalControlsEvaluated > 0
    ? Math.round((totalIsms / result.totalControlsEvaluated) * 100)
    : null;
  const allEvidenceScore = result.totalControlsEvaluated > 0
    ? Math.round((totalEv / result.totalControlsEvaluated) * 100)
    : null;

  // Delete old "all" scorecard
  await adminSupabase
    .from('intelligence_snapshots')
    .delete()
    .eq('snapshot_type', 'scorecard')
    .eq('framework_code', 'all');

  await adminSupabase
    .from('intelligence_snapshots')
    .insert({
      snapshot_type: 'scorecard',
      framework_code: 'all',
      input_payload: {
        assessment_id: assessmentId,
        source: 'assessment_engine',
      },
      result_payload: {
        frameworks_evaluated: allFrameworks.length,
        total_controls: result.totalControlsEvaluated,
        total_compliant: result.totalControlsCompliant,
        isms_score: allIsmsScore,
        evidence_score: allEvidenceScore,
        conforming_count: conforming,
        partial_count: partial,
        informal_count: informal,
        gap_count: gap,
        run_estimated_count: runEstimatedCount,
        run_evaluation_error_count: runEvaluationErrorCount,
      },
      snapshot_data: {
        frameworks: allFrameworks,
        evaluated_at: result.completedAt,
        isms_score: allIsmsScore,
        evidence_score: allEvidenceScore,
        conforming_count: conforming,
        partial_count: partial,
        informal_count: informal,
        gap_count: gap,
        run_estimated_count: runEstimatedCount,
        run_evaluation_error_count: runEvaluationErrorCount,
      },
      // No cross-framework score. Each framework's lives in its own entry.
      score: null,
      user_id: null,
      metadata: null,
    });

  // Invalidate Redis cache for framework scores
  if (redis) {
    try {
      await redis.del("ihos:framework_scores");
      console.log("[syncScorecard] Invalidated Redis cache for framework scores");
    } catch (cacheErr) {
      console.warn("[syncScorecard] Redis cache invalidation failed:", cacheErr);
    }
  }

  console.log(
    `[syncScorecard] Updated ${result.frameworkScores.length} framework scorecards + 'all' from assessment ${assessmentId}`,
  );
}
