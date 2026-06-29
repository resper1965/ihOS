import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// GET: List POA&M items (optionally filter by ?assessmentId=xxx)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const assessmentId = searchParams.get('assessmentId');

    let query = supabase
      .from('poam_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (assessmentId) {
      query = query.eq('assessment_id', assessmentId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to fetch POA&M items', { context: 'poam/GET', meta: { error: error.message } });
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch POA&M items.';
    logger.error(message, { context: 'poam/GET', error: err });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST: Create a new POA&M item from an assessment gap
// ─────────────────────────────────────────────────────────────────────────────

const CreatePoamSchema = z.object({
  assessment_id: z.string().uuid(),
  control_code: z.string().min(1),
  status: z.enum(['open', 'in_progress', 'resolved', 'risk_accepted']).default('open'),
  risk_acceptance_expires_at: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = CreatePoamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: `Invalid request: ${parsed.error.issues.map((i) => i.message).join(', ')}` },
        { status: 400 },
      );
    }

    const { assessment_id, control_code, status, risk_acceptance_expires_at } = parsed.data;

    const { data, error } = await supabase
      .from('poam_items')
      .insert({
        assessment_id,
        control_code,
        status,
        risk_acceptance_expires_at: risk_acceptance_expires_at ?? null,
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to create POA&M item', { context: 'poam/POST', meta: { error: error.message } });
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    logger.info('POA&M item created', { context: 'poam/POST', meta: { id: data.id, control_code } });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create POA&M item.';
    logger.error(message, { context: 'poam/POST', error: err });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
