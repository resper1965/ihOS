// src/app/api/customer-assessments/[id]/answers/route.ts
// POST  — persist a batch of generated answers (replaces the assessment's
//         answer set; stamps posture_fingerprint; moves received → answering)
// PATCH — HITL review of a single answer (approve / edit / reject), audited
//
// customer_assessment_answers is newer than the generated Supabase types.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  BulkAnswersSchema,
  ReviewAnswerSchema,
  computeCounts,
  canTransition,
  type AssessmentStatus,
} from '@/lib/assessment/customer-assessments';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

async function refreshCounts(admin: any, assessmentId: string) {
  const { data: rows } = await admin
    .from('customer_assessment_answers')
    .select('draft_answer, review_status')
    .eq('assessment_id', assessmentId);
  const counts = computeCounts((rows ?? []) as Array<{ draft_answer: string | null; review_status: string }>);
  await admin.from('customer_assessments').update(counts).eq('id', assessmentId);
  return counts;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const auth = await requireInternalUser(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = BulkAnswersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const admin = createAdminClient() as any;
  const { data: assessment } = await admin
    .from('customer_assessments')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (!assessment) return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });

  const status = assessment.status as AssessmentStatus;
  if (status !== 'received' && status !== 'answering') {
    return NextResponse.json(
      { error: `Answers can only be written while received/answering (current: ${status})` },
      { status: 409 },
    );
  }

  // Replace semantics: a regeneration supersedes the previous answer set —
  // partial merges would leave orphaned rows from removed questions.
  const { error: deleteError } = await admin
    .from('customer_assessment_answers')
    .delete()
    .eq('assessment_id', id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const rows = parsed.data.answers.map((a) => ({
    assessment_id: id,
    question_text: a.question_text,
    question_context: a.question_context ?? null,
    cell_coords: a.cell_coords ?? null,
    sheet_name: a.sheet_name ?? null,
    row_index: a.row_index ?? null,
    draft_answer: a.draft_answer ?? null,
    final_answer: null,
    answer_source: a.answer_source ?? null,
    mapped_controls: a.mapped_controls,
    references: a.references,
    confidence: a.confidence ?? null,
    review_status: 'pending',
    needs_review: a.needs_review,
  }));

  const { error: insertError } = await admin
    .from('customer_assessment_answers')
    .insert(rows);
  if (insertError) {
    logger.error('Answer batch insert failed', { context: 'customer-assessments/answers', meta: { error: insertError.message } });
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const assessmentUpdates: Record<string, unknown> = {};
  if (parsed.data.posture_fingerprint) {
    assessmentUpdates.posture_fingerprint = parsed.data.posture_fingerprint;
  }
  if (status === 'received' && canTransition('received', 'answering')) {
    assessmentUpdates.status = 'answering';
  }
  if (Object.keys(assessmentUpdates).length > 0) {
    await admin.from('customer_assessments').update(assessmentUpdates).eq('id', id);
  }

  const counts = await refreshCounts(admin, id);

  await admin.from('customer_assessment_events').insert({
    assessment_id: id,
    event_type: 'answers_generated',
    from_status: status,
    to_status: assessmentUpdates.status ?? status,
    actor_id: auth.user!.id,
    detail: {
      answer_count: rows.length,
      needs_review_count: rows.filter((r) => r.needs_review).length,
      posture_fingerprint: parsed.data.posture_fingerprint ?? null,
    },
  });

  return NextResponse.json({ inserted: rows.length, counts }, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const auth = await requireInternalUser(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ReviewAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const admin = createAdminClient() as any;
  const { data: answer } = await admin
    .from('customer_assessment_answers')
    .select('id, assessment_id, draft_answer, final_answer, review_status')
    .eq('id', parsed.data.answer_id)
    .eq('assessment_id', id)
    .maybeSingle();
  if (!answer) return NextResponse.json({ error: 'Answer not found in this assessment' }, { status: 404 });

  const now = new Date().toISOString();
  const finalAnswer =
    parsed.data.review_status === 'edited'
      ? parsed.data.final_answer!
      : parsed.data.review_status === 'approved'
        ? (answer.final_answer ?? answer.draft_answer)
        : answer.final_answer;

  const { data: updated, error: updateError } = await admin
    .from('customer_assessment_answers')
    .update({
      review_status: parsed.data.review_status,
      final_answer: finalAnswer,
      needs_review: false,
      reviewed_by: auth.user!.id,
      reviewed_at: now,
    })
    .eq('id', parsed.data.answer_id)
    .select('*')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const counts = await refreshCounts(admin, id);

  await admin.from('customer_assessment_events').insert({
    assessment_id: id,
    event_type: 'answer_reviewed',
    actor_id: auth.user!.id,
    detail: {
      answer_id: parsed.data.answer_id,
      review_status: parsed.data.review_status,
      was_edited: parsed.data.review_status === 'edited',
    },
  });

  return NextResponse.json({ answer: updated, counts });
}
