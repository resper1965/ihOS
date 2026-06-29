import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getConversation, getMessages, deleteConversation } from '@/lib/chat/persistence';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const conversation = await getConversation(id);
    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (conversation.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const messages = await getMessages(id);
    return NextResponse.json({ data: { ...conversation, messages } });
  } catch (err) {
    logger.error("GET conversation failed", { context: "conversations/detail", error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const conversation = await getConversation(id);
    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (conversation.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await deleteConversation(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    logger.error("DELETE conversation failed", { context: "conversations/detail", error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
