// src/app/api/threat-modeling/[id]/observed/route.ts
// GET — SI-only operational view: which threats of a DOCUMENTAL threat model
// are currently echoed by active DefectDojo findings (CWE class → STRIDE
// category, computed ON DEMAND).
//
// NPR v3 rule: the threat model itself is a documental calculation and never
// stores observation data. This endpoint is the SI team's read — it does NOT
// write anything back to the model, and it is internal-role gated.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  loadActiveFindingsForVersion,
  annotateEmpiricalConfirmation,
} from '@/lib/threat-modeling/empirical-correlation';
import { resolveVersionContext } from '@/lib/threat-modeling/lineage';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'ionic_user')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  try {
    const { data: row, error } = await admin
      .from('threat_models')
      .select('id, product_version, model_data')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'Threat model not found' }, { status: 404 });
    }

    const { productVersionId } = await resolveVersionContext(
      admin,
      (row as any).product_version,
    );
    const findings = await loadActiveFindingsForVersion(admin, productVersionId);

    // Computed on demand, returned to the SI caller only — the stored
    // documental model is never touched.
    const { data, observedThreatCount, correlatedFindingCount } =
      annotateEmpiricalConfirmation((row as any).model_data ?? {}, findings);

    const threats: Array<Record<string, unknown>> = data?.threat_model?.threats ?? [];
    return NextResponse.json({
      threat_model_id: id,
      product_version: (row as any).product_version,
      observed_threat_count: observedThreatCount,
      correlated_finding_count: correlatedFindingCount,
      total_active_findings: findings.length,
      correlation_level: 'stride-category',
      observed_threats: threats
        .filter((t) => t.empirically_observed === true)
        .map((t) => ({
          id: t.id,
          title: t.title,
          stride_category: t.stride_category,
          affected_component: t.affected_component,
          empirical_findings: t.empirical_findings ?? [],
        })),
      note:
        'SI operational view, computed on demand. The documental threat model never contains this data (NPR v3 separation of views).',
    });
  } catch (err) {
    logger.error('Observed correlation failed', {
      context: 'threat-modeling/observed',
      error: err,
    });
    return NextResponse.json({ error: 'Failed to compute observed correlation' }, { status: 500 });
  }
}
