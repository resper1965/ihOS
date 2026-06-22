import { createAdminClient } from "./admin";

const secretsCache: Record<string, string> = {};

/**
 * Resolves a secret from Supabase Vault. Fallbacks to process.env if query fails or is empty.
 * Integrates an in-memory cache to prevent repeated database query overhead.
 */
export async function getSecret(name: string): Promise<string | null> {
  // Check process.env first (for local environment variable fallback/overrides)
  if (process.env[name]) {
    return process.env[name] || null;
  }

  // Check in-memory cache
  if (secretsCache[name]) {
    return secretsCache[name];
  }

  try {
    const supabase = createAdminClient();
    
    // Call the public.get_vault_secret RPC function
    const { data, error } = await (supabase as any).rpc("get_vault_secret", { secret_name: name });

    
    if (error) {
      console.warn(`[vault] Failed to fetch secret ${name} via RPC:`, error.message);
      
      // Fallback: try raw query directly using admin client (in case RPC privilege schema mapping isn't fully active)
      const { data: rawData, error: rawError } = await supabase
        .from("decrypted_secrets" as any)
        .select("decrypted_secret")
        .eq("name", name)
        .limit(1)
        .maybeSingle();

      if (!rawError && rawData) {
        const secretVal = (rawData as any).decrypted_secret;
        if (secretVal) {
          secretsCache[name] = secretVal;
          return secretVal;
        }
      }
      return null;
    }

    if (data) {
      secretsCache[name] = data;
      return data;
    }
  } catch (err) {
    console.warn(`[vault] Exception fetching secret ${name}:`, err);
  }

  return null;
}
