import { createAdminClient } from "./admin";

/**
 * Secrets whose Vault value wins over process.env.
 *
 * Decision of 2026-09-10 (product owner), recorded in
 * docs/superpowers/specs/2026-09-10-defensible-numbers-design.md §1:
 * STANDARD_GRC_API_KEY is set in the application (Settings → Integrations),
 * because the value deployed in Vercel was revoked and Vercel access was not
 * available to replace it. It applies to this one key. Every other secret
 * keeps env-first, where deployed configuration stays authoritative over a
 * database row.
 *
 * The env var stays the fallback when the Vault holds nothing: tests set it
 * for every suite, and an empty Vault must not strip the key from them.
 */
const VAULT_FIRST = new Set(["STANDARD_GRC_API_KEY"]);

/**
 * How long a Vault value is reused. It never expired before; with the Vault
 * winning, a rotation would otherwise leave warm instances on the old key
 * until they recycled. The save route invalidates its own instance at once.
 */
const SECRET_TTL_MS = 60_000;

const secretsCache = new Map<string, { value: string; at: number }>();

/**
 * Resolves a secret. Env-first, except for names in VAULT_FIRST, which read
 * the Vault first and fall back to process.env.
 */
export async function getSecret(name: string): Promise<string | null> {
  const fromEnv = process.env[name] || null;
  if (fromEnv && !VAULT_FIRST.has(name)) return fromEnv;
  return (await readVault(name)) ?? fromEnv;
}

async function readVault(name: string): Promise<string | null> {
  const hit = secretsCache.get(name);
  if (hit && Date.now() - hit.at < SECRET_TTL_MS) return hit.value;

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

      const secretVal = rawError ? null : (rawData as any)?.decrypted_secret;
      return remember(name, typeof secretVal === "string" ? secretVal : null);
    }

    return remember(name, typeof data === "string" ? data : null);
  } catch (err) {
    console.warn(`[vault] Exception fetching secret ${name}:`, err);
    return null;
  }
}

/** Caches a found value. A miss is not cached, so a save is seen on the next read. */
function remember(name: string, value: string | null): string | null {
  if (!value) return null;
  secretsCache.set(name, { value, at: Date.now() });
  return value;
}

/**
 * Drops a cached secret so the next getSecret() call re-fetches it from the
 * Vault instead of serving a stale in-memory value. Call this after writing a
 * secret — otherwise a successful write keeps looking ineffective until the
 * cache expires, which is the exact confusion this exists to prevent.
 */
export function invalidateSecretCache(name: string): void {
  secretsCache.delete(name);
}

/**
 * Which source `getSecret` would actually resolve this name from, so any UI
 * that writes to the Vault can tell the operator whether their value is the
 * one in use. It follows getSecret's order: env-first, except for VAULT_FIRST
 * names, which report 'vault' whenever the Vault holds a value.
 */
export async function getSecretSource(name: string): Promise<'env' | 'vault' | 'none'> {
  if (process.env[name] && !VAULT_FIRST.has(name)) return 'env';
  if (await readVault(name)) return 'vault';
  return process.env[name] ? 'env' : 'none';
}
