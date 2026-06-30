import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const id = params.id;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing ID' }, { status: 400 });
    }

    const body = await request.json();
    
    // Construct updates object
    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    const { error } = await supabase
      .from('assessments')
      .update(updates)
      .eq('id', id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update assessment' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const id = params.id;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing ID' }, { status: 400 });
    }

    // Manually delete related records to avoid foreign key constraint errors
    // since the database might not have ON DELETE CASCADE configured.
    await supabase.from('poam_items').delete().eq('assessment_id', id);
    await supabase.from('evidence_evaluations').delete().eq('assessment_id', id);
    await supabase.from('intelligence_snapshots').delete().eq('assessment_id', id);

    const { error } = await supabase
      .from('assessments')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete assessment' },
      { status: 500 }
    );
  }
}
