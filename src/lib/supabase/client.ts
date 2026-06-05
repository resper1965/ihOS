import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Creates a Supabase client for use in Client Components (browser).
 *
 * Uses the anon key — all queries go through RLS.
 * Call this inside components/hooks; each invocation reuses the
 * underlying GoTrueClient singleton automatically.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.",
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
