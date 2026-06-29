import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createConversation, getConversations } from '@/lib/chat/persistence';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const conversations = await getConversations(user.id);
    return NextResponse.json({ data: conversations });
  } catch (err) {
    logger.error("GET conversations failed", { context: "conversations", error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { title?: string };
    const conversation = await createConversation(user.id, body.title);
    return NextResponse.json({ data: conversation }, { status: 201 });
  } catch (err) {
    logger.error("POST conversation failed", { context: "conversations", error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
