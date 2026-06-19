// src/app/api/assessments/audit/route.ts
// Programmatic assessment endpoint — uses CRON_SECRET for auth instead of browser session
// This enables running assessments from CLI, cron jobs, or scripts

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAssessment, DEFAULT_FRAMEWORKS } from '@/lib/assessment/engine';
import { syncScorecard } from '@/lib/assessment/assessment-to-scorecard';
import type { AssessmentConfig } from '@/lib/assessment/engine';

export const maxDuration = 300; // 5 minutes for deep scans

export async function POST(req: Request) {
  try {
    // Auth: require CRON_SECRET header (same pattern as cron routes)
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      frameworks = DEFAULT_FRAMEWORKS.map(f => f.id),
      mode = 'quick',
      salesChannel = null,
      productVersionId = null,
    } = body;

    const config: AssessmentConfig = {
      frameworks,
      mode,
      salesChannel,
      productVersionId,
    };

    console.log('[Audit] Starting assessment:', JSON.stringify(config));
    const result = await runAssessment(config);
    console.log(`[Audit] Assessment complete: ${result.totalControlsCompliant}/${result.totalControlsEvaluated} controls compliant`);

    // Persist to Supabase via admin client (no RLS)
    const adminSupabase = createAdminClient();
    const { data: assessmentRecord, error: insertError } = await adminSupabase
      .from('assessments')
      .insert({
        name: `Audit: ${mode} scan — ${new Date().toISOString()}`,
        status: 'completed',
        mode,
        sales_channel: salesChannel,
        product_version_id: productVersionId,
        frameworks: frameworks,
        started_at: result.startedAt,
        completed_at: result.completedAt,
        total_controls: result.totalControlsEvaluated,
        compliant_controls: result.totalControlsCompliant,
        missing_controls: result.totalControlsMissing,
        implemented_control_ids: result.implementedControlIds,
        framework_scores: result.frameworkScores,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[Audit] Failed to persist assessment:', insertError.message);
    }

    // Batch-insert evidence evaluations
    if (assessmentRecord?.id && result.controlEvaluations.length > 0) {
      const evidenceBatch = result.controlEvaluations.map((evaluation) => ({
        chunk_id: evaluation.evidenceChunkId ?? 0,
        scf_control_code: evaluation.controlId,
        control_requirement: evaluation.controlName,
        evidence_text: evaluation.evidenceSnippet ?? 'No evidence found',
        needs_review: evaluation.confidenceScore > 0 && evaluation.confidenceScore < 70,
        control_code: evaluation.controlId,
        domain_code: evaluation.domain,
        control_name: evaluation.controlName,
        is_compliant: evaluation.isCompliant,
        confidence_score: evaluation.confidenceScore,
        missing_elements: null,
        auditor_notes: evaluation.auditorNotes || null,
        trace_id: assessmentRecord.id,
      }));

      const { error: evidenceError } = await adminSupabase
        .from('evidence_evaluations')
        .insert(evidenceBatch);

      if (evidenceError) {
        console.error('[Audit] Evidence insert error:', evidenceError.message);
      } else {
        console.log(`[Audit] Persisted ${evidenceBatch.length} evidence evaluations`);
      }
    }

    // Sync scorecard → dashboard will reflect real scores
    try {
      await syncScorecard(assessmentRecord?.id ?? result.id, result);
      console.log('[Audit] Scorecard synced successfully');
    } catch (scorecardErr) {
      console.error('[Audit] Scorecard sync failed:', scorecardErr instanceof Error ? scorecardErr.message : scorecardErr);
    }

    return NextResponse.json({
      success: true,
      data: {
        assessmentId: assessmentRecord?.id ?? result.id,
        totalControlsEvaluated: result.totalControlsEvaluated,
        totalControlsCompliant: result.totalControlsCompliant,
        totalControlsMissing: result.totalControlsMissing,
        frameworkScores: result.frameworkScores,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audit assessment failed.';
    console.error('[Audit] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
