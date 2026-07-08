// src/app/api/dashboard/observed-posture/route.ts
// GET — Moment 2 (continuous observation) summary for the dashboard:
// active DefectDojo findings by severity + SCF controls currently observed
// violated/degraded + sync freshness. Read-only over already-synced data.
//
// defectdojo_findings/runtime_control_signals are newer than the generated
// Supabase types.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getObservedPosture } from '@/lib/posture/observed-status';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createAdminClient() as any;

    const [{ data: findings }, posture] = await Promise.all([
      admin
        .from('defectdojo_findings')
        .select('severity, is_mitigated, risk_accepted')
        .eq('active', true),
      getObservedPosture(createAdminClient()),
    ]);

    const severityCounts: Record<string, number> = {
      Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0,
    };
    let riskAccepted = 0;
    for (const f of (findings ?? []) as Array<{ severity: string; is_mitigated: boolean; risk_accepted: boolean }>) {
      if (f.is_mitigated) continue;
      severityCounts[f.severity] = (severityCounts[f.severity] ?? 0) + 1;
      if (f.risk_accepted) riskAccepted++;
    }

    return NextResponse.json({
      configured: (findings ?? []).length > 0 || posture.totalSignals > 0,
      severity_counts: severityCounts,
      risk_accepted: riskAccepted,
      violated_controls: posture.violated,
      degraded_controls: posture.degraded,
      last_synced_at: posture.lastSyncedAt,
    });
  } catch (err) {
    logger.error('Observed posture summary failed', { context: 'dashboard/observed-posture', error: err });
    return NextResponse.json(
      { error: 'Failed to load observed posture' },
      { status: 500 },
    );
  }
}
