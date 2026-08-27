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

    if (typeof data === "string" && data) {
      secretsCache[name] = data;
      return data;
    }
  } catch (err) {
    console.warn(`[vault] Exception fetching secret ${name}:`, err);
  }

  return null;
}

/**
 * Drops a cached secret so the next getSecret() call re-fetches it from the
 * Vault instead of serving a stale in-memory value. Call this after writing a
 * secret — otherwise a successful write keeps looking ineffective until the
 * process restarts, which is the exact confusion this exists to prevent.
 */
export function invalidateSecretCache(name: string): void {
  delete secretsCache[name];
}

/**
 * Which source `getSecret` would actually resolve this name from.
 *
 * `getSecret` checks process.env FIRST and returns immediately, so a value
 * stored in the Vault is inert wherever the env var is set. That precedence is
 * deliberate — deployed configuration should stay authoritative, and a database
 * row must not silently override what an operator set in Vercel. But it means
 * any UI that writes to the Vault has to tell the operator whether their value
 * is the one in use, or they will reasonably conclude the app ignored them.
 */
export async function getSecretSource(name: string): Promise<'env' | 'vault' | 'none'> {
  if (process.env[name]) return 'env';
  const fromVault = await getSecret(name).catch(() => null);
  return fromVault ? 'vault' : 'none';
}
