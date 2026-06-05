// src/lib/chat/persistence.ts
import { createClient } from '@/lib/supabase/server';
import type {
  Conversation,
  ConversationInsert,
  Message,
  MessageInsert,
  MessageRole,
} from '@/lib/supabase/types';

export async function createConversation(
  userId: string,
  title?: string
): Promise<Conversation> {
  const supabase = (await createClient()) as any;
  const row: ConversationInsert = { user_id: userId, title: title ?? null };
  const { data, error } = await supabase.from('conversations').insert(row).select().single();
  if (error) throw new Error(`Failed to create conversation: ${error.message}`);
  return data;
}

export async function getConversations(userId: string): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('conversations').select('*').eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to fetch conversations: ${error.message}`);
  return data ?? [];
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('conversations').select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch conversation: ${error.message}`);
  }
  return data;
}

export async function deleteConversation(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('conversations').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete conversation: ${error.message}`);
}

export async function saveMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  toolCalls?: Record<string, unknown>[]
): Promise<Message> {
  const supabase = (await createClient()) as any;
  const row: MessageInsert = { conversation_id: conversationId, role, content, tool_calls: toolCalls ?? null };
  const { data, error } = await supabase.from('messages').insert(row).select().single();
  if (error) throw new Error(`Failed to save message: ${error.message}`);
  return data;
}

export async function getMessages(conversationId: string, limit = 50): Promise<Message[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('messages').select('*').eq('conversation_id', conversationId)
    .order('created_at', { ascending: true }).limit(limit);
  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
  return data ?? [];
}
