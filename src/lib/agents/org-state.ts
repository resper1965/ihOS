// src/lib/agents/org-state.ts
import { createClient } from '@/lib/supabase/server';

export interface OrgStateRow {
  state_key: string;
  state_value: Record<string, unknown>;
}

/**
 * Retrieves a single organizational state variable by key.
 */
async function getOrgState(userId: string, key: string): Promise<Record<string, unknown> | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('agent_org_state')
      .select('state_value')
      .eq('user_id', userId)
      .eq('state_key', key)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.warn(`[OrgState] Failed to get state key ${key}:`, error.message);
      return null;
    }

    return (data?.state_value as Record<string, unknown>) ?? null;
  } catch (err) {
    console.error(`[OrgState] getOrgState error for key ${key}:`, err);
    return null;
  }
}

/**
 * Persists or updates a single organizational state variable.
 */
async function setOrgState(
  userId: string,
  key: string,
  value: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('agent_org_state')
      .upsert(
        {
          user_id: userId,
          state_key: key,
          state_value: value as any,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,state_key' }
      );

    if (error) {
      throw new Error(`Upsert failed: ${error.message}`);
    }
  } catch (err) {
    console.error(`[OrgState] setOrgState failed for key ${key}:`, err);
    throw err;
  }
}

/**
 * Retrieves all organizational state variables for a user.
 */
export async function getAllOrgStates(userId: string): Promise<OrgStateRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('agent_org_state')
      .select('state_key, state_value')
      .eq('user_id', userId);

    if (error) {
      console.warn('[OrgState] Failed to list states:', error.message);
      return [];
    }

    return (data as OrgStateRow[]) ?? [];
  } catch (err) {
    console.error('[OrgState] getAllOrgStates failed:', err);
    return [];
  }
}
