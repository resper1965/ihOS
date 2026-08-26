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
 * `totalRequired === 0` means the run evaluated no controls for this framework
 * — the engine's framework filter matched nothing, or the API scoring call
 * failed. Writing a score in that state produced the 2026-08-26 incident: an
 * assessment that evaluated zero controls deleted the existing scorecard rows
 * and wrote 0.0, so the dashboard reported 0% for frameworks it had never
 * measured, and an operator had to remove the rows by hand.
 *
 * A genuine zero — controls required, none implemented — IS backed and must
 * still be written. That is a finding, not an absence.
 */
export function isScoreBacked(fw: { totalRequired: number; implementedCount: number }): boolean {
  return fw.totalRequired > 0;
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
  // of any one framework: a control's verdict is estimated because the
  // authoritative GRC API was unavailable during that run (see
  // isLocalFallbackEnabled — note it returns true whenever IS_CRON is set, so
  // automated runs estimate even when GRC_LOCAL_FALLBACK_ENABLED is unset), and
  // that condition applies to every framework scored in the same run.
  //
  // They are recorded on each framework row (not only the 'all' aggregate)
  // because the dashboard's framework list deliberately skips the aggregate
  // (`if (code === "all") continue` in compliance-data.ts) — a warning that
  // lives only on the aggregate would never reach the cards a user actually
  // reads. Estimated verdicts are already excluded from control_evaluation_cache
  // (engine.ts) and prefixed [ESTIMATED] in their auditor notes; without these
  // fields that distinction was lost at the dashboard, which showed a plain
  // green "Compliant" score with no indication part of it was estimated.
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
        `[syncScorecard] Skipping ${code}: 0 controls required, so no score is backed. Existing scorecard left untouched.`,
      );
      continue;
    }

    const score = fw.totalRequired > 0
      ? Math.round((fw.implementedCount / fw.totalRequired) * 100)
      : (fw.score ?? null);
    const coverage = fw.totalRequired > 0
      ? Math.round((fw.implementedCount / fw.totalRequired) * 100)
      : null;

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

  // ── 2. Update the "all" aggregate scorecard ────────────────────────
  const allFrameworks = result.frameworkScores.map((fw) => {
    const code = fw.frameworkId;
    const calculatedScore = fw.totalRequired > 0
      ? Math.round((fw.implementedCount / fw.totalRequired) * 100)
      : (fw.score ?? null);

    return {
      code,
      name: resolveFrameworkName(code),
      score: calculatedScore,
      coverage: calculatedScore,
      missing: fw.missingControls.length,
      icon: resolveFrameworkIcon(code),
      implemented: fw.implementedCount,
      total_required: fw.totalRequired,
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

  // The aggregate is only meaningful if at least one framework contributed a
  // backed score. Writing it from an all-unbacked run produced the null-scored
  // 'all' row the 2026-08-26 cleanup had to remove.
  const backedFrameworks = result.frameworkScores.filter(isScoreBacked);
  if (backedFrameworks.length === 0) {
    console.warn('[syncScorecard] No framework had a backed score; leaving the aggregate untouched.');
    return;
  }

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
        overall_score: result.totalControlsEvaluated > 0
          ? Math.round((result.totalControlsCompliant / result.totalControlsEvaluated) * 100)
          : null,
        isms_score: allIsmsScore,
        evidence_score: allEvidenceScore,
        conforming_count: conforming,
        partial_count: partial,
        informal_count: informal,
        gap_count: gap,
        run_estimated_count: runEstimatedCount,
        run_evaluation_error_count: runEvaluationErrorCount,
      },
      score: result.totalControlsEvaluated > 0
        ? Math.round((result.totalControlsCompliant / result.totalControlsEvaluated) * 100)
        : null,
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
