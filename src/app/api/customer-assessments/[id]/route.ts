// src/app/api/customer-assessments/[id]/route.ts
// GET   — assessment detail + its answers + audit trail
// PATCH — status transition (validated against the state machine) and/or
//         metadata updates (due_date). Every transition is audited.
//
// customer_assessments is newer than the generated Supabase types.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ASSESSMENT_STATUSES,
  type AssessmentStatus,
  canTransition,
  allowedTransitions,
} from '@/lib/assessment/customer-assessments';

export const dynamic = 'force-dynamic';

async function requireInternalUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, error: 'Unauthorized', status: 401 as const };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'ionic_user')) {
    return { user: null, error: 'Forbidden', status: 403 as const };
  }
  return { user, error: null, status: 200 as const };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const auth = await requireInternalUser(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const admin = createAdminClient() as any;

  const { data: assessment, error } = await admin
    .from('customer_assessments')
    .select('*, product_versions(version_code)')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
  }

  const [{ data: answers }, { data: events }] = await Promise.all([
    admin
      .from('customer_assessment_answers')
      .select('*')
      .eq('assessment_id', id)
      .order('row_index', { ascending: true, nullsFirst: false }),
    admin
      .from('customer_assessment_events')
      .select('*')
      .eq('assessment_id', id)
      .order('created_at', { ascending: true }),
  ]);

  return NextResponse.json({
    assessment,
    answers: answers ?? [],
    events: events ?? [],
    allowed_transitions: allowedTransitions(assessment.status as AssessmentStatus),
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const auth = await requireInternalUser(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  let body: { status?: string; due_date?: string | null; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const admin = createAdminClient() as any;
  const { data: current, error: fetchError } = await admin
    .from('customer_assessments')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};

  if (body.due_date !== undefined) {
    if (body.due_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) {
      return NextResponse.json({ error: 'due_date must be YYYY-MM-DD or null' }, { status: 400 });
    }
    updates.due_date = body.due_date;
  }

  const fromStatus = current.status as AssessmentStatus;
  let toStatus: AssessmentStatus | null = null;

  if (body.status !== undefined) {
    if (!ASSESSMENT_STATUSES.includes(body.status as AssessmentStatus)) {
      return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
    }
    toStatus = body.status as AssessmentStatus;
    if (toStatus !== fromStatus && !canTransition(fromStatus, toStatus)) {
      return NextResponse.json(
        {
          error: `Invalid transition: ${fromStatus} → ${toStatus}`,
          allowed_transitions: allowedTransitions(fromStatus),
        },
        { status: 409 },
      );
    }
    if (toStatus !== fromStatus) {
      updates.status = toStatus;
      if (toStatus === 'in_review' || toStatus === 'approved') updates.reviewed_by = auth.user!.id;
      if (toStatus === 'exported') updates.exported_at = new Date().toISOString();
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data: updated, error: updateError } = await admin
    .from('customer_assessments')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    logger.error('Customer assessment update failed', { context: 'customer-assessments', meta: { error: updateError.message } });
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (toStatus && toStatus !== fromStatus) {
    await admin.from('customer_assessment_events').insert({
      assessment_id: id,
      event_type: 'status_change',
      from_status: fromStatus,
      to_status: toStatus,
      actor_id: auth.user!.id,
      detail: body.note ? { note: body.note } : {},
    });
  }

  return NextResponse.json({
    assessment: updated,
    allowed_transitions: allowedTransitions(updated.status as AssessmentStatus),
  });
}
