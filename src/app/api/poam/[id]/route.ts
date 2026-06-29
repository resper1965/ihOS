import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// PATCH: Update POA&M item status / risk_acceptance_expires_at
// ─────────────────────────────────────────────────────────────────────────────

const UpdatePoamSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'risk_accepted']).optional(),
  risk_acceptance_expires_at: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = UpdatePoamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: `Invalid request: ${parsed.error.issues.map((i) => i.message).join(', ')}` },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) {
      updates.status = parsed.data.status;
    }
    if (parsed.data.risk_acceptance_expires_at !== undefined) {
      updates.risk_acceptance_expires_at = parsed.data.risk_acceptance_expires_at;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update.' },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('poam_items')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      logger.error('Failed to update POA&M item', { context: 'poam/PATCH', meta: { error: error.message, id } });
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    logger.info('POA&M item updated', { context: 'poam/PATCH', meta: { id, ...updates } });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update POA&M item.';
    logger.error(message, { context: 'poam/PATCH', error: err });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE: Remove a POA&M item
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { error } = await supabase
      .from('poam_items')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Failed to delete POA&M item', { context: 'poam/DELETE', meta: { error: error.message, id } });
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    logger.info('POA&M item deleted', { context: 'poam/DELETE', meta: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete POA&M item.';
    logger.error(message, { context: 'poam/DELETE', error: err });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
