// src/app/api/assessments/run/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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
