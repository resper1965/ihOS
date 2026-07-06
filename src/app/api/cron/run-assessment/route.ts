// src/app/api/cron/run-assessment/route.ts
// Cron endpoint to trigger assessment runs without user auth.
// Protected by CRON_SECRET header.

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { runAssessment, DEFAULT_FRAMEWORKS } from '@/lib/assessment/engine';
import { syncScorecard } from '@/lib/assessment/assessment-to-scorecard';
import { buildEvidenceBatch } from '@/lib/assessment/persistence';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    // ── Auth via CRON_SECRET ────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction && !cronSecret) {
      return NextResponse.json({ error: 'Internal configuration error' }, { status: 500 });
    }

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Parse request body ──────────────────────────────────────────────────
    let body: { frameworks?: string[]; mode?: 'quick' | 'deep'; forceReevaluate?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const frameworks = body.frameworks ?? DEFAULT_FRAMEWORKS;
    const mode = body.mode ?? 'deep';
    const forceReevaluate = body.forceReevaluate ?? false;

    logger.info('Cron assessment triggered', { context: 'cron/run-assessment', meta: { frameworks, mode } });

    // ── Run assessment engine ───────────────────────────────────────────────
    let result;
    try {
      result = await runAssessment({ frameworks, mode, forceReevaluate });
    } catch (runErr) {
      const msg = runErr instanceof Error ? runErr.message : String(runErr);
      logger.error('runAssessment threw: ' + msg, { context: 'cron/run-assessment', error: runErr });
      return NextResponse.json({ success: false, error: 'runAssessment failed: ' + msg, stage: 'run' }, { status: 500 });
    }

    const adminSupabase = createAdminClient();

    // Persist assessment record
    const { data: assessmentRecord, error: insertError } = await adminSupabase
      .from('assessments')
      .insert({
        name: `${mode === 'quick' ? 'Quick' : 'Deep'} Scan — Cron ${new Date().toLocaleDateString('pt-BR')}`,
        status: 'completed',
        mode,
        frameworks: frameworks as any,
        started_at: result.startedAt,
        completed_at: result.completedAt,
        total_controls: result.totalControlsEvaluated,
        compliant_controls: result.totalControlsCompliant,
        missing_controls: result.totalControlsMissing,
        implemented_control_ids: result.implementedControlIds,
        framework_scores: result.frameworkScores as any,
      })
      .select('id')
      .single();

    if (insertError) {
      logger.error('Failed to persist cron assessment', { context: 'cron/run-assessment', meta: { error: insertError.message } });
    }

    // Persist evidence evaluations
    if (assessmentRecord?.id && result.controlEvaluations.length > 0) {
      try {
        const evidenceBatch = buildEvidenceBatch(result.controlEvaluations, assessmentRecord.id);
        const { error: evidenceErr } = await adminSupabase
          .from('evidence_evaluations')
          .insert(evidenceBatch as any);
        if (evidenceErr) {
          logger.error('Evidence insert error', { context: 'cron/run-assessment', meta: { error: evidenceErr.message } });
        }
      } catch (e) {
        logger.error('Evidence batch threw', { context: 'cron/run-assessment', error: e });
      }
    }

    // Sync scorecard
    try {
      await syncScorecard(assessmentRecord?.id ?? result.id, result);
    } catch (e) {
      logger.warn('Scorecard sync failed (non-fatal)', { context: 'cron/run-assessment', error: e });
    }

    return NextResponse.json({
      success: true,
      assessmentId: assessmentRecord?.id ?? result.id,
      frameworks,
      mode,
      totalControls: result.totalControlsEvaluated,
      compliantControls: result.totalControlsCompliant,
      missingControls: result.totalControlsMissing,
      frameworkScores: result.frameworkScores,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron assessment failed';
    const stack = err instanceof Error ? err.stack?.slice(0, 500) : undefined;
    logger.error(message, { context: 'cron/run-assessment', error: err });
    return NextResponse.json({ success: false, error: message, stack }, { status: 500 });
  }
}
