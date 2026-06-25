// src/app/api/threat-modeling/[id]/route.ts
// GET   — get a single threat model by id
// PATCH — submit a review (status change) for a threat model

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ihosEngine } from '@/lib/ihos-engine';
import type { ThreatModelRecord, ThreatModelData, ThreatModelStatus } from '@/lib/supabase/types';

// ── GET — get single threat model ───────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('threat_models')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Threat model not found' }, { status: 404 });
  }

  return NextResponse.json({ model: data as ThreatModelRecord });
}

// ── PATCH — submit review ───────────────────────────────────────────────────

const VALID_REVIEW_STATUSES: ThreatModelStatus[] = ['reviewed', 'approved', 'rejected'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: { status?: string; comment?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { status, comment } = body;

  if (!status || !VALID_REVIEW_STATUSES.includes(status as ThreatModelStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_REVIEW_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Try engine review first
  try {
    const result = await ihosEngine.reviewThreatModel(id, {
      status: status as 'draft' | 'reviewed' | 'approved',
      review_notes: comment ? [comment] : undefined,
    });

    return NextResponse.json({ success: true, model: result });
  } catch (engineErr) {
    console.warn(
      '[ThreatModeling] Engine review failed, falling back to direct update:',
      engineErr instanceof Error ? engineErr.message : engineErr,
    );
  }

  // Fallback: update directly in Supabase
  // First fetch the current record
  const { data: existing, error: fetchError } = await admin
    .from('threat_models')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Threat model not found' }, { status: 404 });
  }

  const record = existing as ThreatModelRecord;
  const updatedData: ThreatModelData = {
    ...record.data,
    status: status as ThreatModelStatus,
    reviewed_by: user.email ?? user.id,
    review_comment: comment || undefined,
    reviewed_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updateError } = await (admin as any)
    .from('threat_models')
    .update({ data: updatedData, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    console.error('[ThreatModeling] Review update error:', updateError.message);
    return NextResponse.json({ error: 'Failed to update threat model' }, { status: 500 });
  }

  return NextResponse.json({ success: true, model: updated as ThreatModelRecord });
}
