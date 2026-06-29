import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAssessment, DEFAULT_FRAMEWORKS } from '@/lib/assessment/engine';
import { syncScorecard } from '@/lib/assessment/assessment-to-scorecard';
import { RunAssessmentRequestSchema, buildEvidenceBatch } from '@/lib/assessment/persistence';
import type { AssessmentConfig } from '@/lib/assessment/engine';
import { logger } from '@/lib/logger';

export const maxDuration = 300; // 5 minutes for deep scans

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await req.json();

    // Validate request body
    const parsed = RunAssessmentRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: `Invalid request: ${parsed.error.issues.map(i => i.message).join(', ')}` },
        { status: 400 },
      );
    }

    const { frameworks, mode, salesChannel, productVersionId } = parsed.data;

    const config: AssessmentConfig = {
      frameworks,
      mode,
      salesChannel,
      productVersionId,
    };

    console.log('[Assessment] Starting:', JSON.stringify(config));

    // Run the assessment engine
    const result = await runAssessment(config);

    // Persist to Supabase
    const { data: assessmentRecord, error: insertError } = await supabase
      .from('assessments')
      .insert({
        name: `${mode === 'quick' ? 'Quick' : 'Deep'} Scan — ${new Date().toLocaleDateString('en-US')}`,
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
        framework_scores: result.frameworkScores as any,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (insertError) {
      logger.error('Failed to persist assessment', { context: 'assessments/run', meta: { error: insertError.message } });
      // Return result anyway even if persistence fails
    }

    // ── Batch-insert evidence evaluations ────────────────────────────────
    // Uses admin client to bypass RLS since this is a server-side pipeline.
    // Errors are logged but never fail the assessment response.
    if (assessmentRecord?.id && result.controlEvaluations.length > 0) {
      try {
        const adminSupabase = createAdminClient();
        const evidenceBatch = buildEvidenceBatch(result.controlEvaluations, assessmentRecord.id);

        const { error: evidenceInsertError } = await adminSupabase
          .from('evidence_evaluations')
          .insert(evidenceBatch as any);

        if (evidenceInsertError) {
          logger.error('Failed to persist evidence evaluations', { context: 'assessments/run', meta: { error: evidenceInsertError.message } });
        } else {
          logger.info(`Persisted ${evidenceBatch.length} evidence evaluations`, { context: 'assessments/run', meta: { assessmentId: assessmentRecord.id } });
        }
      } catch (evidenceErr) {
        logger.error('Evidence evaluation insert threw', { context: 'assessments/run', error: evidenceErr });
      }
    }

    // ── Sync scorecard: Assessment results → intelligence_snapshots ──────
    // This ensures the dashboard always reflects REAL evaluated data.
    try {
      await syncScorecard(assessmentRecord?.id ?? result.id, result);
      logger.info('Scorecard synced', { context: 'assessments/run' });
    } catch (scorecardErr) {
      logger.warn('Scorecard sync failed (non-fatal)', { context: 'assessments/run', error: scorecardErr });
    }

    return NextResponse.json({
      success: true,
      data: {
        assessmentId: assessmentRecord?.id ?? result.id,
        ...result,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Assessment failed.';
    logger.error(message, { context: 'assessments/run', error: err });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
