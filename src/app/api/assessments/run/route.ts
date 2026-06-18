// src/app/api/assessments/run/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAssessment, DEFAULT_FRAMEWORKS } from '@/lib/assessment/engine';
import type { AssessmentConfig } from '@/lib/assessment/engine';

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
        framework_scores: result.frameworkScores,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[Assessment] Failed to persist:', insertError.message);
      // Return result anyway even if persistence fails
    }

    // ── Batch-insert evidence evaluations ────────────────────────────────
    // Uses admin client to bypass RLS since this is a server-side pipeline.
    // Errors are logged but never fail the assessment response.
    if (assessmentRecord?.id && result.controlEvaluations.length > 0) {
      try {
        const adminSupabase = createAdminClient();

        const evidenceBatch = result.controlEvaluations.map((evaluation) => ({
          assessment_id: assessmentRecord.id,
          control_code: evaluation.controlId,
          domain_code: evaluation.domain,
          control_name: evaluation.controlName,
          is_compliant: evaluation.isCompliant,
          confidence_score: evaluation.confidenceScore,
          missing_elements: null,
          auditor_notes: evaluation.auditorNotes || null,
          evidence_sources: evaluation.evidenceChunkId
            ? [{ chunk_id: evaluation.evidenceChunkId, snippet: evaluation.evidenceSnippet }]
            : null,
          needs_review: evaluation.confidenceScore > 0 && evaluation.confidenceScore < 70,
        }));

        const { error: evidenceInsertError } = await adminSupabase
          .from('evidence_evaluations')
          .insert(evidenceBatch);

        if (evidenceInsertError) {
          console.error(
            '[Assessment] Failed to persist evidence evaluations:',
            evidenceInsertError.message,
          );
        } else {
          console.log(
            `[Assessment] Persisted ${evidenceBatch.length} evidence evaluations for assessment ${assessmentRecord.id}`,
          );
        }
      } catch (evidenceErr) {
        console.error(
          '[Assessment] Evidence evaluation insert threw:',
          evidenceErr instanceof Error ? evidenceErr.message : evidenceErr,
        );
      }
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
    console.error('[Assessment] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
