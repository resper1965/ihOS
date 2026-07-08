// src/app/api/customer-assessments/route.ts
// GET  — inbox: list customer assessments (optional ?status= filter)
// POST — register a received client questionnaire (channel + version REQUIRED:
//        an answer must never mix sales-channel document overlays)
//
// customer_assessments is newer than the generated Supabase types.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ASSESSMENT_STATUSES,
  CreateAssessmentSchema,
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

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireInternalUser(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const status = request.nextUrl.searchParams.get('status');
  if (status && !ASSESSMENT_STATUSES.includes(status as any)) {
    return NextResponse.json({ error: `Invalid status filter: ${status}` }, { status: 400 });
  }

  const admin = createAdminClient() as any;
  let query = admin
    .from('customer_assessments')
    .select('*, product_versions(version_code)')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    logger.error('Customer assessment list failed', { context: 'customer-assessments', meta: { error: error.message } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assessments: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireInternalUser(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateAssessmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const admin = createAdminClient() as any;

  // The version must exist — a questionnaire answered against a nonexistent
  // version would silently fall back to global-only documents.
  const { data: version } = await admin
    .from('product_versions')
    .select('id')
    .eq('id', parsed.data.product_version_id)
    .maybeSingle();
  if (!version) {
    return NextResponse.json({ error: 'product_version_id does not exist' }, { status: 400 });
  }

  const { data: inserted, error: insertError } = await admin
    .from('customer_assessments')
    .insert({ ...parsed.data, status: 'received', created_by: auth.user!.id })
    .select('*')
    .single();

  if (insertError) {
    logger.error('Customer assessment insert failed', { context: 'customer-assessments', meta: { error: insertError.message } });
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { error: eventError } = await admin.from('customer_assessment_events').insert({
    assessment_id: inserted.id,
    event_type: 'status_change',
    from_status: null,
    to_status: 'received',
    actor_id: auth.user!.id,
    detail: { client_name: parsed.data.client_name, source_file: parsed.data.source_file ?? null },
  });
  if (eventError) {
    // A missing audit event is a real compliance gap — never drop it silently.
    logger.error('Customer assessment audit event insert failed', {
      context: 'customer-assessments',
      meta: { assessment_id: inserted.id, error: eventError.message },
    });
  }

  return NextResponse.json({ assessment: inserted }, { status: 201 });
}
