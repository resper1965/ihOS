import { exec } from 'child_process';
import { promisify } from 'util';
import { runAssessment } from './engine';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildEvidenceBatch } from './persistence';

const execAsync = promisify(exec);

/**
 * Triggers the GRC Python calibration script to recalculate control scoring,
 * and runs an automated quick scan to refresh scorecard snapshots.
 * Executed asynchronously in the background.
 */
export async function triggerGrcRecalibration(productVersionId: string, userId: string): Promise<void> {
  console.log(`[GRC Trigger] Starting recalibration for product version: ${productVersionId}`);
  
  try {
    // 1. Run Python Calibration script
    const pythonScriptPath = process.env.CALIBRATION_SCRIPT_PATH || '/home/resper/ihos-api/run_scrms_calibration.py';
    let stdout = '';
    let stderr = '';
    
    try {
      console.log(`[GRC Trigger] Executing: python3 ${pythonScriptPath}`);
      const res = await execAsync(`python3 ${pythonScriptPath}`);
      stdout = res.stdout;
      stderr = res.stderr;
    } catch (execErr: any) {
      console.warn(`[GRC Trigger] python3 execution failed, trying wsl:`, execErr.message);
      // Fallback for hybrid Windows dev host environment
      const res = await execAsync(`wsl python3 ${pythonScriptPath}`);
      stdout = res.stdout;
      stderr = res.stderr;
    }
    
    console.log('[GRC Trigger] Python stdout:', stdout);
    if (stderr) {
      console.warn('[GRC Trigger] Python stderr:', stderr);
    }

    // 2. Trigger automated quick assessment scan to verify new evidence & update scorecards
    console.log('[GRC Trigger] Spawning automated quick assessment scan...');
    
    const adminSupabase = createAdminClient();
    const { data: version } = await adminSupabase
      .from('product_versions')
      .select('version_code')
      .eq('id', productVersionId)
      .single();
      
    const versionCode = version?.version_code || 'v2.2.x';

    const config = {
      frameworks: ['iso27001', 'iso27701'],
      mode: 'quick' as const,
      productVersionId,
    };
    
    const result = await runAssessment(config);
    
    // Persist assessment result
    const { data: assessmentRecord, error: insertError } = await adminSupabase
      .from('assessments')
      .insert({
        name: `Auto Scan (${versionCode}) — ${new Date().toLocaleDateString('en-US')}`,
        status: 'completed',
        mode: 'quick',
        product_version_id: productVersionId,
        frameworks: config.frameworks,
        started_at: result.startedAt,
        completed_at: result.completedAt,
        total_controls: result.totalControlsEvaluated,
        compliant_controls: result.totalControlsCompliant,
        missing_controls: result.totalControlsMissing,
        implemented_control_ids: result.implementedControlIds,
        framework_scores: result.frameworkScores as any,
        created_by: userId,
        sales_channel: null,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[GRC Trigger] Failed to persist auto-assessment:', insertError.message);
    } else if (assessmentRecord?.id && result.controlEvaluations.length > 0) {
      // Persist evidence evaluations using shared utility
      try {
        const evidenceBatch = buildEvidenceBatch(result.controlEvaluations, assessmentRecord.id);
        const { error: evidenceInsertError } = await adminSupabase
          .from('evidence_evaluations')
          .insert(evidenceBatch as any);

        if (evidenceInsertError) {
          console.error('[GRC Trigger] Failed to persist evidence evaluations:', evidenceInsertError.message);
        }
      } catch (evidenceErr) {
        console.error('[GRC Trigger] Evidence persist threw:', evidenceErr instanceof Error ? evidenceErr.message : evidenceErr);
      }
    }
    
    console.log('[GRC Trigger] Auto-assessment scan and scorecard sync complete!');
  } catch (err) {
    console.error('[GRC Trigger] Recalibration failed:', err);
  }
}
