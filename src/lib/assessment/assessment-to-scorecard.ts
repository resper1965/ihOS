// src/lib/assessment/assessment-to-scorecard.ts
// Pipeline: Assessment results → intelligence_snapshots (scorecard)
// This ensures the dashboard scorecard always reflects REAL evaluated data,
// never hardcoded scores.

import { createAdminClient } from '@/lib/supabase/admin';
import type { AssessmentResult, FrameworkScore } from './engine';

const FRAMEWORK_ICONS: Record<string, string> = {
  'BR-LGPD': '🇧🇷',
  'HI-2013': '🏥',
  'TX-LEVEL-2': '⭐',
  'iso27001': '🔒',
  'iso27701': '🛡️',
  'EU-GDPR': '🇪🇺',
  'IEC-62304': '⚕️',
};

const FRAMEWORK_NAMES: Record<string, string> = {
  'BR-LGPD': 'LGPD',
  'HI-2013': 'HIPAA',
  'TX-LEVEL-2': 'TX-RAMP L2',
  'iso27001': 'ISO 27001:2022',
  'iso27701': 'ISO 27701:2019',
  'EU-GDPR': 'EU GDPR',
  'IEC-62304': 'IEC 62304',
};

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

  // ── 1. Upsert individual framework scorecards ──────────────────────
  for (const fw of result.frameworkScores) {
    const code = fw.frameworkId;
    const score = fw.totalRequired > 0
      ? Math.round((fw.implementedCount / fw.totalRequired) * 100)
      : (fw.score ?? null);
    const coverage = fw.totalRequired > 0
      ? Math.round((fw.implementedCount / fw.totalRequired) * 100)
      : null;

    const snapshotData = {
      name: FRAMEWORK_NAMES[code] ?? code,
      score,
      coverage,
      missing: fw.missingControls.length,
      source: 'assessment_engine',
      assessment_id: assessmentId,
      implemented: fw.implementedCount,
      total_required: fw.totalRequired,
      evaluated_at: result.completedAt,
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
      name: FRAMEWORK_NAMES[code] ?? code,
      score: calculatedScore,
      coverage: calculatedScore,
      missing: fw.missingControls.length,
      icon: FRAMEWORK_ICONS[code] ?? '📋',
      implemented: fw.implementedCount,
      total_required: fw.totalRequired,
    };
  });

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
      },
      snapshot_data: {
        frameworks: allFrameworks,
        evaluated_at: result.completedAt,
        overall_score: result.totalControlsEvaluated > 0
          ? Math.round((result.totalControlsCompliant / result.totalControlsEvaluated) * 100)
          : null,
      },
      score: result.totalControlsEvaluated > 0
        ? Math.round((result.totalControlsCompliant / result.totalControlsEvaluated) * 100)
        : null,
      user_id: null,
      metadata: null,
    });

  console.log(
    `[syncScorecard] Updated ${result.frameworkScores.length} framework scorecards + 'all' from assessment ${assessmentId}`,
  );
}
