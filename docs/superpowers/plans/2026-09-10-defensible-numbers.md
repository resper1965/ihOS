# Defensible Numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every compliance number the product shows comes from one stamped writer, in one unit per framework, and the path that produces it runs again.

**Architecture:** The vendor key is read from the Vault first (this key only), so an operator can replace the revoked key from Settings. The Standard-API engine reads the SCF catalogue from `scf_controls_cache` instead of a vendor endpoint that does not exist, and it evaluates exactly the controls the official crosswalk scores from. `assessment-to-scorecard.ts` becomes the only scorecard writer and stamps each framework with its curation policy. The legacy calculation and its three outlets are deleted, readers ask for the `'all'` row by name, and the Overview shows one card per framework.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Vault), Vitest, Zod, TanStack Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-10-defensible-numbers-design.md`

## Global Constraints

- Baselines measured before any change: **683 tests across 82 files**, `tsc --noEmit` **199** locally (CI ratchet `TSC_BASELINE: 195`), ESLint **1,222** (`ESLINT_BASELINE: 1222`). None may rise. Measure after every task:
  - tests: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- --testTimeout=60000"`
  - tsc: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npx tsc --noEmit 2>&1 | grep -c 'error TS'"` → must be ≤ 199
  - eslint: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npx eslint . 2>&1 | grep -oE '[0-9]+ problems'"` → must be ≤ 1222
- Run tests through WSL as above. `npx`/`vitest` from the Windows side of the `W:` mount is broken.
- A single test file: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- <path> --testTimeout=60000"`.
- **Never print a secret value.** Refer to a key by its fingerprint, prefix or length only.
- **Production and dev share one Supabase project.** Do not run any SQL, script or RPC against the real database. In particular, never call `set_vault_secret` with real parameter names: its third parameter has a DEFAULT, so a two-argument call writes. The purge SQL in Task 6 is for the operator to apply.
- Do not use `VERCEL_OIDC_TOKEN`. Do not change the git remote.
- Commit messages: conventional commits in English, ending with the line `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Write them with `git commit -F - <<'MSG' … MSG` (a heredoc in bash).
- Comment density and voice: match the surrounding code. This codebase explains *why* in comments, and dates the incident a comment refers to.
- `'all'` scorecard JSON uses snake_case keys (`total_required`, `isms_score`, …). New keys follow that: `policy_version`, `policy_owner`.

## Plan decisions (beyond the spec's text)

These came up while planning. Each is a ruling. The spec is still the authority.

1. **The syncs go through `getSecret`.** `sync/catalog.ts:33` and `sync/crosswalk.ts:248` read `process.env.STANDARD_GRC_API_KEY` directly. Without this change, §1 would not reach the catalogue sync or the crosswalk walk: they would keep sending the revoked env key. Folded into Task 1.
2. **`scripts/probe-standard-api.ts` stays env-based.** It is a local diagnostic that writes the key into `.env.local` by design (`--set`). Only its `/scf/versions/latest` entry changes (Task 3).
3. **`loadCachedCatalogue` pages past 1,000 rows.** supabase-js caps an unbounded select at 1,000, and `crosswalk.ts` already documents that cap against this catalogue (~1,468 controls per version). The read it replaces in `local-engine.ts` does not page.
4. **One crosswalk read, shared.** The projection's read of `scf_control_mappings` moves into `readCrosswalkRows`. The engine's control filter uses the same function, so the evaluated set and the scored set come from the same read by construction. It stays unpaged, exactly as it is today; the ceiling is marked in a `ponytail:` comment.
5. **Readers show only stamped entries.** `stampedFrameworkEntries` (Task 5) drops any `'all'` entry without a `policy_version`. The stats route and the cron both use it, so a legacy row left in the table until the purge is applied cannot reach the Overview or seed a notification baseline.
6. **`stats.score` is removed** from the stats payload and its Zod schema. It read the cross-framework blend the spec drops. The Overview's only consumer of it (`page.tsx:155`) is replaced in Task 7.
7. **`frameworks[]` in the `'all'` row is built from backed frameworks only.** An unbacked framework has no score, so it gets no entry.
8. **`/api/compliance/mappings/sync` returns `scf_version: scf_version_id`.** The version label came from the dead endpoint. The Control Crosswalk page shows the field in its success toast.
9. **The `MAX_PAGES` source-inspection test is deleted** (`tests/unit/assessment/engine.test.ts`, describe `'MAX_PAGES constant'`). The pagination loop it inspects is deleted in Task 3.

---

### Task 1: The vendor key — the Vault wins, for this key only

**Files:**
- Modify: `src/lib/supabase/vault.ts` (whole file)
- Modify: `src/app/api/settings/integrations/standard-api/key/route.ts:1-14` (header comment)
- Modify: `src/app/api/settings/integrations/standard-api/route.ts:146-149` (probe URL)
- Modify: `src/lib/standard-api/sync/catalog.ts:32-36, 49` (`authHeaders`)
- Modify: `src/lib/standard-api/sync/crosswalk.ts:25-26, 248-249`
- Create: `tests/unit/lib/vault-precedence.test.ts`
- Modify: `tests/api/standard-api-key.test.ts` (header, imports, `beforeEach`, the test at line 60)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `getSecret(name: string): Promise<string | null>`, `getSecretSource(name: string): Promise<'env' | 'vault' | 'none'>`, `invalidateSecretCache(name: string): void`. Same signatures as today. For `'STANDARD_GRC_API_KEY'` the Vault now wins, and cached values expire after 60 s.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/lib/vault-precedence.test.ts`:

```ts
// tests/unit/lib/vault-precedence.test.ts
// STANDARD_GRC_API_KEY is read from the Vault first — decision of 2026-09-10,
// docs/superpowers/specs/2026-09-10-defensible-numbers-design.md §1. Every
// other secret keeps env-first. These pin both halves, the cache expiry that
// lets a rotation reach warm instances, and that the catalogue sync (which
// read process.env directly) now sends the Vault key too.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSupabaseAdmin } from '../../setup';
import { getSecret, getSecretSource, invalidateSecretCache } from '@/lib/supabase/vault';

const VAULT_KEY = 'standard_live_fromvault0000000000000000';

/** The Vault answers get_vault_secret with these values, and nothing else. */
function vaultHolds(values: Record<string, string>) {
  mockSupabaseAdmin.rpc.mockImplementation(async (_fn: string, args: { secret_name: string }) => ({
    data: values[args.secret_name] ?? null,
    error: null,
  }));
}

describe('getSecret precedence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSecretCache('STANDARD_GRC_API_KEY');
    invalidateSecretCache('OPENAI_API_KEY');
    mockSupabaseAdmin.rpc.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    mockSupabaseAdmin.rpc.mockResolvedValue({ data: [], error: null });
  });

  it('reads STANDARD_GRC_API_KEY from the Vault even when the env var is set', async () => {
    // tests/setup.ts sets the env var to 'fake-grc-key' for every suite.
    vaultHolds({ STANDARD_GRC_API_KEY: VAULT_KEY });
    expect(await getSecret('STANDARD_GRC_API_KEY')).toBe(VAULT_KEY);
    expect(await getSecretSource('STANDARD_GRC_API_KEY')).toBe('vault');
  });

  it('falls back to the env var when the Vault holds no key', async () => {
    vaultHolds({});
    expect(await getSecret('STANDARD_GRC_API_KEY')).toBe('fake-grc-key');
    expect(await getSecretSource('STANDARD_GRC_API_KEY')).toBe('env');
  });

  it('keeps OPENAI_API_KEY env-first, without asking the Vault', async () => {
    vaultHolds({ OPENAI_API_KEY: 'vault-openai-must-not-win' });
    expect(await getSecret('OPENAI_API_KEY')).toBe('fake-openai-key');
    expect(await getSecretSource('OPENAI_API_KEY')).toBe('env');
    expect(mockSupabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('re-reads the Vault after 60 seconds, so a rotation reaches warm instances', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
    vaultHolds({ STANDARD_GRC_API_KEY: VAULT_KEY });
    expect(await getSecret('STANDARD_GRC_API_KEY')).toBe(VAULT_KEY);

    const ROTATED = 'standard_live_rotated000000000000000000';
    vaultHolds({ STANDARD_GRC_API_KEY: ROTATED });

    vi.setSystemTime(new Date('2026-09-10T12:00:30Z'));
    expect(await getSecret('STANDARD_GRC_API_KEY')).toBe(VAULT_KEY);

    vi.setSystemTime(new Date('2026-09-10T12:01:01Z'));
    expect(await getSecret('STANDARD_GRC_API_KEY')).toBe(ROTATED);
  });

  it('sends the Vault key from the catalogue sync, which used to read process.env directly', async () => {
    vaultHolds({ STANDARD_GRC_API_KEY: VAULT_KEY });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ data: [{ scf_version_id: 'v1' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getLatestScfVersionId } = await import('@/lib/standard-api/sync/catalog');
    const { createThrottle } = await import('@/lib/standard-api/sync/throttle');

    expect(await getLatestScfVersionId(createThrottle())).toBe('v1');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${VAULT_KEY}`);
  });
});
```

In `tests/api/standard-api-key.test.ts`:

Replace the header comment (lines 1-5) with:

```ts
// tests/api/standard-api-key.test.ts
// Storing a credential, so the gate and the non-disclosure are the tests that
// matter. Also pins which source is in use after a save: since 2026-09-10 the
// Vault wins for this key (vault.ts, VAULT_FIRST), so a saved key is the one
// in use even where the env var is set.
```

Replace the import line `import { mockSupabaseServer } from '../setup';` with:

```ts
import { mockSupabaseServer, mockSupabaseAdmin } from '../setup';
```

In the `beforeEach`, after `asRole('admin');`, add:

```ts
    mockSupabaseAdmin.rpc.mockResolvedValue({ data: [], error: null });
```

Replace the whole test `it('warns that a stored key is shadowed when the env var is set', …)` with these two:

```ts
  it('reports a saved key as in use even when the env var is set', async () => {
    // Inverted on 2026-09-10. This test used to assert the env var shadowed a
    // saved key; the Vault now wins for this key (spec §1).
    const key = 'standard_live_0123456789abcdef0123456789abcdef';
    mockSupabaseAdmin.rpc.mockImplementation(async (fn: string) =>
      fn === 'get_vault_secret' ? { data: key, error: null } : { data: null, error: null },
    );

    const { POST } = await import('@/app/api/settings/integrations/standard-api/key/route');
    const body = await (await POST(req({ key }))).json();

    expect(body.shadowedByEnv).toBe(false);
  });

  it('reports the env var as in use when the Vault read comes back empty', async () => {
    // The save call succeeded but the read did not find it: the response must
    // not claim the new key is in use.
    mockSupabaseAdmin.rpc.mockResolvedValue({ data: null, error: null });

    const { POST } = await import('@/app/api/settings/integrations/standard-api/key/route');
    const body = await (await POST(req({ key: 'standard_live_0123456789abcdef0123456789abcdef' }))).json();

    expect(body.shadowedByEnv).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- tests/unit/lib/vault-precedence.test.ts tests/api/standard-api-key.test.ts --testTimeout=60000"`
Expected: FAIL. The Vault-wins test gets `'fake-grc-key'`, the rotation test gets the first key, the catalogue test sends `Bearer fake-grc-key`, and the saved-key test gets `shadowedByEnv: true`. The OPENAI and empty-Vault tests may already pass.

- [ ] **Step 3: Rewrite `src/lib/supabase/vault.ts`**

Replace the whole file with:

```ts
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
```

The three `as any` casts are the ones the file already has. Do not add more, because ESLint must not rise.

- [ ] **Step 4: Route the syncs through `getSecret`**

In `src/lib/standard-api/sync/catalog.ts`, after `import { createThrottle, type Throttle } from './throttle';`, add:

```ts
import { getSecret } from '@/lib/supabase/vault';
```

Replace `function authHeaders(…) { … }` (lines 32-36) with:

```ts
async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  // Through getSecret, not process.env: since 2026-09-10 the key is set in the
  // Vault (vault.ts, VAULT_FIRST), and a direct env read would keep sending
  // the revoked one.
  const key = await getSecret('STANDARD_GRC_API_KEY');
  if (!key) throw new Error('STANDARD_GRC_API_KEY is set neither in the Vault nor in the environment');
  return { Authorization: `Bearer ${key}`, ...extra };
}
```

In `requestJson`, replace `const res = await fetch(\`${API_BASE}${path}\`, { headers: authHeaders() });` with:

```ts
    const res = await fetch(`${API_BASE}${path}`, { headers: await authHeaders() });
```

In `src/lib/standard-api/sync/crosswalk.ts`, after `import { createThrottle, type Throttle } from './throttle';`, add:

```ts
import { getSecret } from '@/lib/supabase/vault';
```

Replace lines 248-249:

```ts
  const key = process.env.STANDARD_GRC_API_KEY;
  if (!key) throw new Error('STANDARD_GRC_API_KEY is not set');
```

with:

```ts
  // Through getSecret, not process.env — see authHeaders in catalog.ts.
  const key = await getSecret('STANDARD_GRC_API_KEY');
  if (!key) throw new Error('STANDARD_GRC_API_KEY is set neither in the Vault nor in the environment');
```

- [ ] **Step 5: Fix the Settings probe and the key route's header**

In `src/app/api/settings/integrations/standard-api/route.ts`, replace:

```ts
  // 1. GET /scf/versions/latest — proves the credential authenticates at all.
  try {
    const versionsRes = await probe(`${baseUrl}/scf/versions/latest`, {
```

with:

```ts
  // 1. GET /scf/versions — proves the credential authenticates at all. This
  //    probed /scf/versions/latest until 2026-09-10; that endpoint does not
  //    exist, so the probe could never report the key as working.
  try {
    const versionsRes = await probe(`${baseUrl}/scf/versions`, {
```

In `src/app/api/settings/integrations/standard-api/key/route.ts`, replace lines 1-14 (the header comment, up to and including the "Auth gate mirrors …" paragraph) with:

```ts
// POST /api/settings/integrations/standard-api/key
//
// Lets an admin/ionic_user store the Standard GRC API key in Supabase Vault.
//
// Since 2026-09-10 the Vault wins for this key (src/lib/supabase/vault.ts,
// VAULT_FIRST): a key saved here is the one in use, and the env var is only
// the fallback for an empty Vault. `shadowedByEnv` still reports the source
// actually resolved after the save, so the response never claims a success
// that changed nothing.
//
// Auth gate mirrors src/app/api/settings/integrations/standard-api/route.ts
// (itself copied from src/app/api/compliance/mappings/sync/route.ts:18-29).
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- tests/unit/lib/vault-precedence.test.ts tests/api/standard-api-key.test.ts tests/api/integration-health.test.ts --testTimeout=60000"`
Expected: PASS.

- [ ] **Step 7: Full suite, tsc, eslint**

Run the three Global Constraints commands. Expected: every test passes, with the new ones added (683 + 6 = 689: five in the new file, plus one net in the key test); tsc ≤ 199; eslint ≤ 1222.

- [ ] **Step 8: Commit**

```bash
git add src/lib/supabase/vault.ts src/lib/standard-api/sync/catalog.ts src/lib/standard-api/sync/crosswalk.ts src/app/api/settings/integrations/standard-api/route.ts src/app/api/settings/integrations/standard-api/key/route.ts tests/unit/lib/vault-precedence.test.ts tests/api/standard-api-key.test.ts
git commit -F - <<'MSG'
feat(vault): the Vault wins for the Standard API key, and the syncs read it

The key deployed in Vercel is revoked and Vercel access is unavailable, so
the key is now set from Settings. For STANDARD_GRC_API_KEY only, getSecret
reads the Vault first and falls back to the env var; every other secret
stays env-first. Cached values expire after 60 s so a rotation reaches warm
instances.

The catalogue sync and the crosswalk walk read process.env directly and
would have kept sending the revoked key; both go through getSecret now.
The Settings probe stops probing /scf/versions/latest, which does not exist.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 2: The client names the status

**Files:**
- Modify: `src/lib/standard-api/client.ts` (`post()` ~lines 156-170, `get()` ~lines 221-230; one new helper)
- Test: `tests/unit/lib/standard-api-client.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: unchanged exports. A non-OK response now throws `StandardApiClientError` with `code: 'HTTP_<status>'`, `status: <status>`, and a message naming the status and the endpoint, even when the body is not JSON. When the body carries the vendor's `error` object, that object is used unchanged. The existing 422 test pins this.

- [ ] **Step 1: Write the failing test**

In `tests/unit/lib/standard-api-client.test.ts`, find the test `'throws StandardApiClientError with fallback on HTTP error without error body'`. Directly after it, inside the same `describe`, add:

```ts
  it('names the status and the endpoint when the error body is not JSON', async () => {
    // 2026-08-29 to 2026-09-10: the vendor answered an HTML page, the client
    // parsed the body before checking the status, and twelve nightly failures
    // logged "Unexpected token '<'" instead of an HTTP status.
    const htmlResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => {
        throw new SyntaxError(`Unexpected token '<', "<!DOCTYPE"... is not valid JSON`);
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse));

    const client = await import('@/lib/standard-api/client');

    const postErr = await client.complianceScore({ framework_code: 'iso27001' }).catch((e: unknown) => e);
    expect(postErr).toBeInstanceOf(client.StandardApiClientError);
    const p = postErr as InstanceType<typeof client.StandardApiClientError>;
    expect(p.code).toBe('HTTP_404');
    expect(p.status).toBe(404);
    expect(p.message).toContain('404');
    expect(p.message).toContain('/intelligence/compliance-score');

    const getErr = await client.getScfControls('v1', 1, 100).catch((e: unknown) => e);
    expect(getErr).toBeInstanceOf(client.StandardApiClientError);
    const g = getErr as InstanceType<typeof client.StandardApiClientError>;
    expect(g.code).toBe('HTTP_404');
    expect(g.message).toContain('/scf/');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- tests/unit/lib/standard-api-client.test.ts --testTimeout=60000"`
Expected: FAIL. `code` is `'NETWORK_ERROR'` and `status` is `0`, because the SyntaxError is caught as a network failure.

- [ ] **Step 3: Add the helper and check status first**

In `src/lib/standard-api/client.ts`, directly above `async function post<TReq, TRes>(`, add:

```ts
/**
 * The error for a non-OK response. The status is decided before the body is
 * read, because a failed response's body is not guaranteed to be JSON. From
 * 2026-08-29 to 2026-09-10 the vendor answered /scf/versions/latest with an
 * HTML page; the old parse-first order threw on it, and twelve nightly
 * failures logged "Unexpected token '<'" instead of an HTTP status.
 *
 * 401/403 are HARD authorization errors (missing/invalid credential, RBAC
 * denial, insufficient scope, cross-tenant block) — callers must NEVER degrade
 * them to local estimation, which would mask a security/config problem (B3).
 */
async function errorFromResponse(response: Response, endpoint: string): Promise<StandardApiClientError> {
  const body = (await response.json().catch(() => null)) as
    | { error?: StandardApiError; detail?: unknown }
    | null;
  if (body?.error) {
    return new StandardApiClientError(body.error.message, body.error.code, response.status, body.error.details);
  }
  const detail = typeof body?.detail === "string" ? body.detail : response.statusText;
  return new StandardApiClientError(
    `HTTP ${response.status} on ${endpoint}${detail ? `: ${detail}` : ""}`,
    `HTTP_${response.status}`,
    response.status,
  );
}
```

In **both** `post()` and `get()`, replace the block that starts at
`const json = (await response.json()) as { data?: TRes; error?: StandardApiError };`
and ends at the closing `}` of the `if (!response.ok) { … }` that follows it (the comment inside and the `throw` go with it) with:

```ts
    if (!response.ok) {
      throw await errorFromResponse(response, endpoint);
    }

    const json = (await response.json()) as { data?: TRes; error?: StandardApiError };
```

Leave the next line, `return (json.data !== undefined ? json.data : json) as TRes;`, unchanged in both functions.

- [ ] **Step 4: Run the test to verify it passes**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- tests/unit/lib/standard-api-client.test.ts --testTimeout=60000"`
Expected: PASS. The 422 test still gets `'Invalid framework code'`, and the 500 test still gets `HTTP_500`.

- [ ] **Step 5: Full suite, tsc, eslint** (Global Constraints commands). All within baseline.

- [ ] **Step 6: Commit**

```bash
git add src/lib/standard-api/client.ts tests/unit/lib/standard-api-client.test.ts
git commit -F - <<'MSG'
fix(standard-api): check the status before parsing the body

get() and post() parsed the body first. When the vendor answered with an
HTML page, the parse threw and the error reaching the log named a JSON
token, not the status: twelve nightly assessment failures read
"Unexpected token '<'" instead of 404. A non-OK response now yields
HTTP_<status> with the endpoint in the message; a vendor error body is
still used when it parses.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 3: The engine reads the catalogue from the cache

**Files:**
- Modify: `src/lib/standard-api/sync/catalog.ts` (add `CachedControl`, `CatalogueReader`, `loadCachedCatalogue` after `getCachedScfVersionId`)
- Modify: `src/lib/assessment/local-engine.ts:31-36` (interface), `:64-106` (catalogue load)
- Modify: `src/lib/assessment/engine.ts:203-222` (version + catalogue), `:607-609` (projection call)
- Modify: `src/lib/standard-api/client.ts:320-325` (delete `getLatestScfVersion`), `src/lib/standard-api/index.ts:13`
- Modify: `src/app/api/compliance/mappings/sync/route.ts:5, 33-34, 96`
- Modify: `scripts/probe-standard-api.ts` (one `PROBES` entry)
- Create: `tests/unit/standard-api/cached-catalogue.test.ts`
- Modify: `tests/unit/assessment/engine.test.ts` (delete the `'MAX_PAGES constant'` describe and its banner comment)

**Interfaces:**
- Consumes: `getCachedScfVersionId(client?)` (exists in `catalog.ts`), `getLatestScfVersionId(throttle: Throttle): Promise<string>` (exists), `createThrottle(opts?)` from `sync/throttle.ts`.
- Produces:
  - `interface CachedControl { id: string; name: string; domain: string; description: string }`
  - `interface CatalogueReader` (the chain `from → select → eq → order → range`)
  - `loadCachedCatalogue(scfVersionId: string, client?: CatalogueReader): Promise<CachedControl[]>`
  - In `engine.ts`, a local `const scfVersionId: string` that Task 4 uses.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/standard-api/cached-catalogue.test.ts`:

```ts
// tests/unit/standard-api/cached-catalogue.test.ts
// Both engines read the SCF catalogue from scf_controls_cache through one
// function (spec 2026-09-10 §3). The Standard-API engine used to fetch it live
// against /scf/versions/latest, an endpoint that does not exist, and failed
// every night from 2026-08-29.

import { describe, it, expect, vi } from 'vitest';
import { loadCachedCatalogue, type CatalogueReader } from '@/lib/standard-api/sync/catalog';
import { controlIdentity } from '@/lib/assessment/engine';

/** A reader over fixed rows that honours .range(), like PostgREST does. */
function readerOver(rows: Array<Record<string, unknown>>) {
  const range = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
  const eq = vi.fn(() => ({ order: () => ({ range }) }));
  const client: CatalogueReader = { from: () => ({ select: () => ({ eq }) }) };
  return { client, range, eq };
}

describe('loadCachedCatalogue', () => {
  it('maps a cache row to a control that controlIdentity accepts', async () => {
    const { client, eq } = readerOver([
      { control_code: 'AAT-01', control_title: 'AI governance', control_description: 'Mechanisms exist.' },
    ]);

    const [control] = await loadCachedCatalogue('v-cached', client);

    expect(control).toEqual({ id: 'AAT-01', name: 'AI governance', domain: 'AAT', description: 'Mechanisms exist.' });
    expect(String(controlIdentity(control as unknown as Record<string, unknown>))).toBe('AAT-01');
    expect(eq).toHaveBeenCalledWith('scf_version_id', 'v-cached');
  });

  it('falls back from description to title to code, and drops rows with no code', async () => {
    const { client } = readerOver([
      { control_code: 'GOV-01', control_title: 'Governance', control_description: '' },
      { control_code: 'HRS-02', control_title: null, control_description: null },
      { control_code: null, control_title: 'orphan' },
    ]);

    const out = await loadCachedCatalogue('v', client);

    expect(out.map((c) => c.id)).toEqual(['GOV-01', 'HRS-02']);
    expect(out.map((c) => c.name)).toEqual(['Governance', 'HRS-02']);
    expect(out.map((c) => c.description)).toEqual(['Governance', 'HRS-02']);
  });

  it('reads past the 1,000-row cap', async () => {
    // A version holds ~1,468 controls; supabase-js stops an unbounded select at 1,000.
    const rows = Array.from({ length: 1468 }, (_, i) => ({
      control_code: `C-${String(i).padStart(4, '0')}`,
      control_title: 't',
    }));
    const { client, range } = readerOver(rows);

    expect(await loadCachedCatalogue('v', client)).toHaveLength(1468);
    expect(range).toHaveBeenCalledWith(0, 999);
    expect(range).toHaveBeenCalledWith(1000, 1999);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- tests/unit/standard-api/cached-catalogue.test.ts --testTimeout=60000"`
Expected: FAIL. `loadCachedCatalogue` is not exported.

- [ ] **Step 3: Add `loadCachedCatalogue` to `sync/catalog.ts`**

Directly after the closing `}` of `getCachedScfVersionId` (just before `// ── Frameworks ──`), add:

```ts
/** One control of the vendor catalogue, as both engines evaluate it. */
export interface CachedControl {
  id: string;          // control_code, e.g. "AAT-01" — what controlIdentity reads
  name: string;        // control_title
  domain: string;      // domain prefix of the code, e.g. "AAT"
  description: string;
}

/** The chain loadCachedCatalogue reads through; a test substitutes it. */
export interface CatalogueReader {
  from(t: string): {
    select(c: string): {
      eq(col: string, v: string): {
        order(col: string, o: { ascending: boolean }): {
          range(from: number, to: number): PromiseLike<{
            data: Array<Record<string, unknown>> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

const CATALOGUE_PAGE = 1000;

/**
 * The cached catalogue at one version, mapped for evaluation.
 *
 * Moved here from local-engine.ts so the Standard-API engine reads the same
 * source (spec 2026-09-10 §3). That engine fetched the catalogue live against
 * /scf/versions/latest, which does not exist, and failed every night from
 * 2026-08-29 to 2026-09-10.
 *
 * Paged with .range(): supabase-js caps an unbounded select at 1,000 rows and
 * a version holds ~1,468 controls — the cap crosswalk.ts documents.
 */
export async function loadCachedCatalogue(
  scfVersionId: string,
  client?: CatalogueReader,
): Promise<CachedControl[]> {
  const db = client ?? (createAdminClient() as unknown as CatalogueReader);
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += CATALOGUE_PAGE) {
    const { data, error } = await db
      .from('scf_controls_cache')
      .select('control_code, control_title, control_description')
      .eq('scf_version_id', scfVersionId)
      .order('control_code', { ascending: true })
      .range(from, from + CATALOGUE_PAGE - 1);
    if (error) throw new Error(`could not read scf_controls_cache: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < CATALOGUE_PAGE) break;
  }

  return rows
    .map((r) => {
      const code = typeof r.control_code === 'string' ? r.control_code : '';
      return {
        id: code,
        name: typeof r.control_title === 'string' ? r.control_title : code,
        domain: code.split('-')[0] ?? '',
        description:
          typeof r.control_description === 'string' && r.control_description.length > 0
            ? r.control_description
            : typeof r.control_title === 'string'
              ? r.control_title
              : code,
      };
    })
    .filter((c) => c.id.length > 0);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- tests/unit/standard-api/cached-catalogue.test.ts --testTimeout=60000"`
Expected: PASS.

- [ ] **Step 5: `local-engine.ts` uses it**

Replace the `interface CatalogControl { … }` block (lines 31-36) with:

```ts
type CatalogControl = CachedControl;
```

and add to the imports at the top:

```ts
import type { CachedControl } from '@/lib/standard-api/sync/catalog';
```

Replace the section from
`  const { getCachedScfVersionId } = await import('@/lib/standard-api/sync/catalog');`
through the closing `    .filter((c) => c.id.length > 0);` of the `controls` mapping (lines ~64-106) with:

```ts
  const { getCachedScfVersionId, loadCachedCatalogue } = await import('@/lib/standard-api/sync/catalog');
  const scfVersionId = await getCachedScfVersionId();
  const controls: CatalogControl[] = await loadCachedCatalogue(scfVersionId);
```

Keep the comment block above it and the `if (controls.length === 0) { throw … }` guard below it. Then run `grep -n "adminSupabase" src/lib/assessment/local-engine.ts`. If the only remaining hit is its declaration, delete that line too.

- [ ] **Step 6: `engine.ts` uses it**

Replace the section from `  const scfVersion = await standardApi.getLatestScfVersion();` through the closing `}` of `if (page > MAX_PAGES) { … }` (lines ~203-222) with:

```ts
  // The catalogue comes from the local cache, at the version the cache holds —
  // the source local-engine.ts reads. Fetching it live used a version endpoint
  // that does not exist (/scf/versions/latest) and failed every night from
  // 2026-08-29 to 2026-09-10. Principle VIII is reconciled in spec 2026-09-10
  // §3: scf_controls_cache is the vendor's catalogue, synced from the API.
  const { getCachedScfVersionId, loadCachedCatalogue } = await import('@/lib/standard-api/sync/catalog');
  const scfVersionId = await getCachedScfVersionId();
  let allControls: any[] = await loadCachedCatalogue(scfVersionId);
```

(`let allControls: any[]` replaces the existing `let allControls: any[] = [];`, so the lint count is unchanged.)

In the projection call (~line 607), replace:

```ts
      // The version this run fetched its catalogue against (line ~203), not
      // "latest" — those differ while a crosswalk walk is in flight.
      const projection = await projectFrameworkFromCrosswalk(frameworkId, evaluations, {
        scfVersionId: scfVersion.scf_version_id,
      });
```

with:

```ts
      // The version this run read its catalogue at, not the API's "latest" —
      // those differ while a crosswalk walk is in flight.
      const projection = await projectFrameworkFromCrosswalk(frameworkId, evaluations, {
        scfVersionId,
      });
```

- [ ] **Step 7: Delete `getLatestScfVersion`, and fix its last caller**

In `src/lib/standard-api/client.ts`, delete the doc comment `/** Fetch the latest SCF version details from the GRC Engine. */` and the function `getLatestScfVersion` under it. In `src/lib/standard-api/index.ts`, delete the line `  getLatestScfVersion,`.

In `src/app/api/compliance/mappings/sync/route.ts`, replace:

```ts
import { getLatestScfVersion, getScfControls } from "@/lib/standard-api/client";
```

with:

```ts
import { getScfControls } from "@/lib/standard-api/client";
import { getLatestScfVersionId } from "@/lib/standard-api/sync/catalog";
import { createThrottle } from "@/lib/standard-api/sync/throttle";
```

Replace:

```ts
    // 1. Get latest SCF version
    const { scf_version_id, version_label } = await getLatestScfVersion();
```

with:

```ts
    // 1. The newest catalogue version, asked the way the catalogue sync asks.
    // This called GET /scf/versions/latest until 2026-09-10; it does not exist.
    const scf_version_id = await getLatestScfVersionId(createThrottle());
```

Replace `      scf_version: version_label,` with `      scf_version: scf_version_id,`.

In `scripts/probe-standard-api.ts`, replace:

```ts
  { path: '/scf/versions/latest', note: 'catalogue version pin', used: true },
```

with:

```ts
  { path: '/scf/versions', note: 'catalogue versions', used: true },
```

- [ ] **Step 8: Delete the `MAX_PAGES` test**

In `tests/unit/assessment/engine.test.ts`, delete the banner comment `// MAX_PAGES constant (indirectly verifiable)` (with its dashed lines) and the whole `describe('MAX_PAGES constant', …)` block. The loop it inspected no longer exists.

- [ ] **Step 9: Verify nothing still calls the dead endpoint**

Run: `grep -rnE "getLatestScfVersion\(|/scf/versions/latest['\"\`]" src tests scripts`
Expected: no output. If `tests/setup.ts`'s client mock lists `getLatestScfVersion`, delete that entry and rerun.

- [ ] **Step 10: Full suite, tsc, eslint** (Global Constraints commands). All within baseline.

- [ ] **Step 11: Commit**

```bash
git add src/lib/standard-api/sync/catalog.ts src/lib/assessment/local-engine.ts src/lib/assessment/engine.ts src/lib/standard-api/client.ts src/lib/standard-api/index.ts src/app/api/compliance/mappings/sync/route.ts scripts/probe-standard-api.ts tests/unit/standard-api/cached-catalogue.test.ts tests/unit/assessment/engine.test.ts tests/setup.ts
git commit -F - <<'MSG'
fix(assessment): read the catalogue from the cache, not a dead endpoint

The nightly assessment has failed every night since 2026-08-29: it fetched
GET /scf/versions/latest, which the vendor never had. Both engines now read
the catalogue through loadCachedCatalogue, at the version the cache holds,
paged past supabase-js's 1,000-row cap. getLatestScfVersion is deleted;
the Control Crosswalk sync asks for versions the way the catalogue sync
does.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

(If `tests/setup.ts` was not changed in Step 9, drop it from `git add`.)

---

### Task 4: The engine evaluates what the crosswalk scores

**Files:**
- Modify: `src/lib/assessment/projection.ts:196-238` (extract `readCrosswalkRows`, add `controlCodesForFrameworks`)
- Modify: `src/lib/assessment/engine.ts:5` (import), `:~224-248` (the filter)
- Create: `tests/unit/assessment/crosswalk-control-set.test.ts`

**Interfaces:**
- Consumes: `const scfVersionId: string` in `runAssessment` (Task 3). `ReadableClient` (exists in `projection.ts`). `resolveVendorFrameworkCode(localCode, client: CurationReader): Promise<string>` (exists in `curation/identity.ts`; it throws when no curated slug exists).
- Produces:
  - `readCrosswalkRows(localFrameworkCode: string, scfVersionId: string, client: ReadableClient): Promise<Array<Record<string, unknown>>>`
  - `controlCodesForFrameworks(localFrameworkCodes: string[], scfVersionId: string, client?: ReadableClient): Promise<Set<string>>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/assessment/crosswalk-control-set.test.ts`:

```ts
// tests/unit/assessment/crosswalk-control-set.test.ts
// The engine evaluates exactly the controls the score is computed from
// (spec 2026-09-10 §3.1). It used to choose them from the legacy
// scf_framework_mappings: for ISO 27001 + 27701 that evaluated 613 controls
// that never reached a score, and skipped 14 that did.

import { describe, it, expect } from 'vitest';
import { controlCodesForFrameworks, type ReadableClient } from '@/lib/assessment/projection';

interface Row {
  framework_code: string;
  scf_version_id: string;
  control_code: string;
  requirement_code: string;
}

/** framework_identity_curation + scf_control_mappings, filtered the way PostgREST would. */
function crosswalk(curation: Record<string, string>, rows: Row[]): ReadableClient {
  function query(table: string, filters: Record<string, string>): unknown {
    return {
      eq: (col: string, v: string) => query(table, { ...filters, [col]: v }),
      maybeSingle: async () => {
        const vendor = table === 'framework_identity_curation' ? curation[filters.local_code] : undefined;
        return { data: vendor ? { vendor_framework_code: vendor, confidence: 'high' } : null, error: null };
      },
      then: (onFulfilled: (r: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve({
          data: rows.filter(
            (r) => r.framework_code === filters.framework_code && r.scf_version_id === filters.scf_version_id,
          ),
          error: null,
        }).then(onFulfilled, onRejected),
    };
  }
  return { from: (table: string) => ({ select: () => query(table, {}) }) } as unknown as ReadableClient;
}

const V = 'v-cached';
const curation = { iso27001: 'iso-27001-2022', iso27701: 'iso-27701-2019' };
const rows: Row[] = [
  { framework_code: 'iso-27001-2022', scf_version_id: V, control_code: 'GOV-09', requirement_code: '5.1' },
  { framework_code: 'iso-27001-2022', scf_version_id: V, control_code: 'GOV-09', requirement_code: '5.2' },
  { framework_code: 'iso-27001-2022', scf_version_id: V, control_code: 'SEA-02.1', requirement_code: '8.1' },
  { framework_code: 'iso-27701-2019', scf_version_id: V, control_code: 'HRS-05.1', requirement_code: '6.4' },
  // Another catalogue version: must not leak into this one.
  { framework_code: 'iso-27001-2022', scf_version_id: 'v-old', control_code: 'AST-01.2', requirement_code: '5.9' },
];

describe('controlCodesForFrameworks', () => {
  it('selects the distinct controls of each curated slug at the cached version', async () => {
    const set = await controlCodesForFrameworks(['iso27001', 'iso27701'], V, crosswalk(curation, rows));
    expect([...set].sort()).toEqual(['GOV-09', 'HRS-05.1', 'SEA-02.1']);
  });

  it('skips a framework nobody has curated, without dropping the others', async () => {
    const set = await controlCodesForFrameworks(['iso27001', 'soc2'], V, crosswalk(curation, rows));
    expect([...set].sort()).toEqual(['GOV-09', 'SEA-02.1']);
  });

  it('selects nothing when the crosswalk maps nothing at that version', async () => {
    const set = await controlCodesForFrameworks(['iso27001'], 'v-empty', crosswalk(curation, rows));
    expect(set.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- tests/unit/assessment/crosswalk-control-set.test.ts --testTimeout=60000"`
Expected: FAIL. `controlCodesForFrameworks` is not exported.

- [ ] **Step 3: Extract the read and add the selector in `projection.ts`**

In `projectFrameworkFromCrosswalk`, replace the section from
`  const { resolveVendorFrameworkCode } = await import('@/lib/assessment/curation/identity');`
through
`  if (mappingError) throw new Error(\`scf_control_mappings: ${mappingError.message}\`);`
with:

```ts
  const rows = await readCrosswalkRows(localFrameworkCode, scfVersionId, client);
```

and in the `return computeProjection({ … })` that follows, replace `mappings: (rows ?? []) as unknown as ProjectionInput['mappings'],` with:

```ts
    mappings: rows as unknown as ProjectionInput['mappings'],
```

Then, directly after the closing `}` of `projectFrameworkFromCrosswalk`, add:

```ts
/**
 * The official crosswalk rows for one framework at one catalogue version.
 *
 * Shared by the projection (what a score is computed from) and by the engine's
 * control filter (what gets evaluated), so the two sets come from one read.
 * They were two different tables until 2026-09-10 (spec §3.4).
 *
 * Throws when the framework has no curated identity — see
 * resolveVendorFrameworkCode for why that is not a zero.
 */
export async function readCrosswalkRows(
  localFrameworkCode: string,
  scfVersionId: string,
  client: ReadableClient,
): Promise<Array<Record<string, unknown>>> {
  const { resolveVendorFrameworkCode } = await import('@/lib/assessment/curation/identity');
  const vendorCode = await resolveVendorFrameworkCode(
    localFrameworkCode,
    client as unknown as import('@/lib/assessment/curation/identity').CurationReader,
  );

  // ponytail: unpaged, as it was inside the projection. Both callers share this
  // read, so they see the same rows; page it here if one framework's rows at a
  // version ever pass supabase-js's 1,000-row default cap.
  const { data, error } = await client
    .from('scf_control_mappings')
    .select('requirement_code, control_code, relationship_type, relationship_strength, is_official')
    .eq('framework_code', vendorCode)
    .eq('scf_version_id', scfVersionId);
  if (error) throw new Error(`scf_control_mappings: ${error.message}`);
  return data ?? [];
}

/**
 * The distinct SCF control codes the official crosswalk maps to these
 * frameworks at this version: the set the engine evaluates.
 *
 * A framework with no curated identity contributes nothing, and says so in
 * the log. Its projection reports no score for the same reason, so evaluating
 * controls for it would cost vendor calls and change no number.
 */
export async function controlCodesForFrameworks(
  localFrameworkCodes: string[],
  scfVersionId: string,
  client?: ReadableClient,
): Promise<Set<string>> {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const db = client ?? (createAdminClient() as unknown as ReadableClient);
  const codes = new Set<string>();
  for (const framework of localFrameworkCodes) {
    let rows: Array<Record<string, unknown>>;
    try {
      rows = await readCrosswalkRows(framework, scfVersionId, db);
    } catch (err) {
      console.warn(
        `[projection] ${framework}: no controls selected — ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }
    for (const row of rows) {
      if (typeof row.control_code === 'string' && row.control_code.length > 0) codes.add(row.control_code);
    }
  }
  return codes;
}
```

- [ ] **Step 4: Run the new test and the existing projection tests**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- tests/unit/assessment --testTimeout=60000"`
Expected: PASS, including every pre-existing projection test (the query chain is unchanged).

- [ ] **Step 5: The engine uses it**

In `src/lib/assessment/engine.ts`, replace `import { projectFrameworkFromCrosswalk } from './projection';` with:

```ts
import { projectFrameworkFromCrosswalk, controlCodesForFrameworks } from './projection';
```

Replace the whole block from `  // Optimize: Filter controls by selected frameworks to avoid timing out on 1,468 items` through the closing `}` of its `if (config.frameworks && config.frameworks.length > 0) { … }`, which ends just before `  // ── Privacy-role applicability`, with:

```ts
  // Evaluate exactly the controls the score is computed from: the official
  // crosswalk's controls for the selected frameworks, at the cached version,
  // through the read the projection itself uses (projection.ts,
  // readCrosswalkRows). This read scf_framework_mappings, the legacy table,
  // until 2026-09-10 (spec §3.1).
  //
  // No mapped controls means nothing to evaluate — never all 1,468, which does
  // not fit Vercel's 300-second limit.
  if (config.frameworks && config.frameworks.length > 0) {
    const relevant = await controlCodesForFrameworks(config.frameworks, scfVersionId);
    if (relevant.size === 0) {
      console.warn('[Assessment] The crosswalk maps no controls to the selected frameworks; evaluating none.');
    }
    allControls = allControls.filter((c) => relevant.has(controlIdentity(c)));
  }
```

Then run: `grep -n "createClient\b\|createAdminClient" src/lib/assessment/engine.ts`
Remove each import (`createClient` from `@/lib/supabase/server`, `createAdminClient` from `@/lib/supabase/admin`) whose only remaining hit is its import line.

Then run: `grep -n "scf_framework_mappings" src/lib/assessment/engine.ts`
Expected: no hits in code. A hit inside a comment is fine.

- [ ] **Step 6: Full suite, tsc, eslint** (Global Constraints commands). All within baseline.

- [ ] **Step 7: Commit**

```bash
git add src/lib/assessment/projection.ts src/lib/assessment/engine.ts tests/unit/assessment/crosswalk-control-set.test.ts
git commit -F - <<'MSG'
fix(assessment): evaluate the controls the crosswalk scores from

The engine chose which controls to evaluate from the legacy
scf_framework_mappings, while the score is projected from the official
crosswalk. For ISO 27001 + 27701 that evaluated 613 controls that never
reached a score and skipped 14 that did, leaving their requirements
permanently "unevaluated". Both now go through readCrosswalkRows, so the
evaluated set and the scored set are one read.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 5: One writer, and it stamps

**Files:**
- Modify: `src/lib/assessment/assessment-to-scorecard.ts` (`isScoreBacked`, `syncScorecard`, new `stampedFrameworkEntries`)
- Test: `tests/unit/assessment/scorecard-backing.test.ts`

**Interfaces:**
- Consumes: `FrameworkScore` from `engine.ts` (`score: number | null` on a 0-100 scale, `implementedCount` = requirements satisfied, `totalRequired` = requirements total, `policyVersion?`, `policyOwner?`).
- Produces:
  - `isScoreBacked<T extends { totalRequired: number; score: number | null }>(fw: T): fw is T & { score: number }`
  - `interface StampedFrameworkEntry { code: string; name: string; score: number; satisfied: number; total: number; policyVersion: string; policyOwner: string | null }`
  - `stampedFrameworkEntries(snapshotData: unknown): StampedFrameworkEntry[]`. Tasks 6 and 7 import this.
  - `'all'` row: `snapshot_data.frameworks[]` entries carry `policy_version` and `policy_owner`; there is no `snapshot_data.overall_score`; the top-level `score` is `null`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `tests/unit/assessment/scorecard-backing.test.ts` with:

```ts
// tests/unit/assessment/scorecard-backing.test.ts
// A score with nothing behind it must not be written. On 2026-08-26 an
// assessment that evaluated zero controls (finding A9) caused syncScorecard to
// delete the existing rows and write 0.0 for two frameworks, so the dashboard
// showed 0% for frameworks it had never measured. 0% is a real finding —
// "evaluated, nothing compliant" — and must stay distinguishable from
// "not evaluated", and from "could not compute".

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseAdmin } from '../../setup';
import {
  isScoreBacked,
  syncScorecard,
  stampedFrameworkEntries,
} from '@/lib/assessment/assessment-to-scorecard';
import type { AssessmentResult, FrameworkScore } from '@/lib/assessment/engine';

describe('isScoreBacked', () => {
  it('accepts a framework where controls were actually required and evaluated', () => {
    expect(isScoreBacked({ totalRequired: 582, implementedCount: 341, score: 58.6 })).toBe(true);
  });

  it('accepts a genuine zero — required controls, none implemented', () => {
    // This is a measurement, not an absence. It must still be written.
    expect(isScoreBacked({ totalRequired: 582, implementedCount: 0, score: 0 })).toBe(true);
  });

  it('rejects a framework where nothing was required, so nothing was measured', () => {
    expect(isScoreBacked({ totalRequired: 0, implementedCount: 0, score: null })).toBe(false);
  });

  it('rejects the incoherent case rather than guessing which field to trust', () => {
    // totalRequired 0 with a positive implementedCount cannot both be true;
    // refusing is safer than picking one.
    expect(isScoreBacked({ totalRequired: 0, implementedCount: 5, score: 0 })).toBe(false);
  });

  it('rejects "cannot compute" even when requirements exist', () => {
    // The projection returns null when no requirement is decidable. This
    // writer used to recompute implemented/total and write 0% — "cannot
    // compute" turned into "0% compliant" (spec 2026-09-10 §3.6).
    expect(isScoreBacked({ totalRequired: 148, implementedCount: 0, score: null })).toBe(false);
  });
});

describe('syncScorecard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const stamped: FrameworkScore = {
    frameworkId: 'iso27001',
    score: 22.97,
    implementedCount: 34,
    totalRequired: 148,
    missingControls: [],
    policyVersion: '2026-08-27.1',
    policyOwner: 'GRC lead',
  };

  function run(frameworkScores: FrameworkScore[]): AssessmentResult {
    return {
      config: { mode: 'deep' },
      frameworkScores,
      completedAt: '2026-09-11T02:10:00Z',
      totalControlsEvaluated: 80,
      totalControlsCompliant: 30,
    } as unknown as AssessmentResult;
  }

  function inserted(code: string) {
    return mockSupabaseAdmin.insert.mock.calls
      .map((c: unknown[]) => c[0] as { framework_code: string; score: unknown; snapshot_data: Record<string, unknown> })
      .find((row: { framework_code: string }) => row.framework_code === code);
  }

  it('writes the projection score with its policy stamp', async () => {
    await syncScorecard('a1', run([stamped]));
    const row = inserted('iso27001');
    expect(row?.score).toBe(23);
    expect(row?.snapshot_data.policy_version).toBe('2026-08-27.1');
    expect(row?.snapshot_data.policy_owner).toBe('GRC lead');
  });

  it("keeps frameworks[] in the 'all' row, and no cross-framework score", async () => {
    await syncScorecard('a1', run([stamped]));
    const all = inserted('all');
    expect(all?.score).toBeNull();
    expect(all?.snapshot_data).not.toHaveProperty('overall_score');
    const entries = all?.snapshot_data.frameworks as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      code: 'iso27001',
      score: 23,
      implemented: 34,
      total_required: 148,
      policy_version: '2026-08-27.1',
      policy_owner: 'GRC lead',
    });
  });

  it('writes nothing for a framework the projection could not score', async () => {
    await syncScorecard('a1', run([{ ...stamped, score: null }]));
    expect(mockSupabaseAdmin.insert).not.toHaveBeenCalled();
  });
});

describe('stampedFrameworkEntries', () => {
  it("returns the stamped entries of an 'all' row, mapped for display", () => {
    expect(
      stampedFrameworkEntries({
        frameworks: [
          {
            code: 'iso27001',
            name: 'ISO 27001',
            score: 23,
            implemented: 34,
            total_required: 148,
            policy_version: '2026-08-27.1',
            policy_owner: 'GRC lead',
          },
        ],
      }),
    ).toEqual([
      {
        code: 'iso27001',
        name: 'ISO 27001',
        score: 23,
        satisfied: 34,
        total: 148,
        policyVersion: '2026-08-27.1',
        policyOwner: 'GRC lead',
      },
    ]);
  });

  it('drops an entry with no policy stamp — the legacy cron wrote those', () => {
    expect(
      stampedFrameworkEntries({
        frameworks: [{ code: 'iso27001', name: 'ISO 27001', score: 61, implemented: 355, total_required: 582 }],
      }),
    ).toEqual([]);
  });

  it('drops an entry with no score or no requirements, and keeps a real zero', () => {
    const out = stampedFrameworkEntries({
      frameworks: [
        { code: 'a', score: null, implemented: 0, total_required: 148, policy_version: 'p' },
        { code: 'b', score: 0, implemented: 0, total_required: 0, policy_version: 'p' },
        { code: 'c', score: 0, implemented: 0, total_required: 148, policy_version: 'p' },
      ],
    });
    expect(out.map((e) => e.code)).toEqual(['c']);
  });

  it('returns nothing for a missing or malformed row', () => {
    expect(stampedFrameworkEntries(null)).toEqual([]);
    expect(stampedFrameworkEntries(undefined)).toEqual([]);
    expect(stampedFrameworkEntries({ score: 85 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- tests/unit/assessment/scorecard-backing.test.ts --testTimeout=60000"`
Expected: FAIL. `stampedFrameworkEntries` is not exported, the `score: null` case returns `true`, and the writer records `24` (34/148 recomputed) with no `policy_version`.

- [ ] **Step 3: Rewrite `isScoreBacked` and add the reader**

Replace the doc comment and body of `isScoreBacked` (lines 15-30) with:

```ts
/**
 * Whether a framework's score rests on anything.
 *
 * Two ways it does not:
 * - `totalRequired === 0`: nothing was required, so nothing was measured.
 *   Writing a score in that state produced the 2026-08-26 incident: an
 *   assessment that evaluated zero controls deleted the existing scorecard
 *   rows and wrote 0.0, and an operator had to remove them by hand.
 * - `score === null`: the projection could not decide a single requirement.
 *   This writer used to recompute implemented/total itself and write 0% —
 *   "cannot compute" turned into "0% compliant", one layer below where
 *   finding I2 closed it (spec 2026-09-10 §3.6).
 *
 * A computed zero — requirements decided, none satisfied — IS backed and must
 * still be written. That is a finding, not an absence.
 */
export function isScoreBacked<T extends { totalRequired: number; score: number | null }>(
  fw: T,
): fw is T & { score: number } {
  return fw.totalRequired > 0 && fw.score !== null;
}

/** One framework of the 'all' container, as a screen or an alert may show it. */
export interface StampedFrameworkEntry {
  code: string;
  name: string;
  /** 0-100, from the projection. */
  score: number;
  /** Requirements satisfied. */
  satisfied: number;
  /** Requirements in the official crosswalk: the denominator. */
  total: number;
  policyVersion: string;
  policyOwner: string | null;
}

/**
 * The entries of an 'all' scorecard row that can be shown: scored, with a
 * denominator, and stamped with the curation policy that produced them.
 *
 * Everything else is dropped rather than shown. Until 2026-09-10 the
 * agentic-triggers cron wrote this row from the legacy scf_framework_mappings
 * with no stamp; a number that cannot name its policy is not one this product
 * can defend (spec 2026-09-10 §4).
 */
export function stampedFrameworkEntries(snapshotData: unknown): StampedFrameworkEntry[] {
  const frameworks = (snapshotData as { frameworks?: unknown } | null | undefined)?.frameworks;
  if (!Array.isArray(frameworks)) return [];
  return frameworks.flatMap((raw): StampedFrameworkEntry[] => {
    const e = raw as Record<string, unknown>;
    if (
      typeof e.code !== 'string' ||
      typeof e.policy_version !== 'string' ||
      typeof e.score !== 'number' ||
      typeof e.total_required !== 'number' ||
      e.total_required <= 0
    ) {
      return [];
    }
    return [
      {
        code: e.code,
        name: typeof e.name === 'string' ? e.name : e.code,
        score: e.score,
        satisfied: typeof e.implemented === 'number' ? e.implemented : 0,
        total: e.total_required,
        policyVersion: e.policy_version,
        policyOwner: typeof e.policy_owner === 'string' ? e.policy_owner : null,
      },
    ];
  });
}
```

- [ ] **Step 4: The per-framework rows take the projection score and the stamp**

In `syncScorecard`, replace:

```ts
    const score = fw.totalRequired > 0
      ? Math.round((fw.implementedCount / fw.totalRequired) * 100)
      : (fw.score ?? null);
    const coverage = fw.totalRequired > 0
      ? Math.round((fw.implementedCount / fw.totalRequired) * 100)
      : null;
```

with:

```ts
    // The projection's score, not a recomputation: recomputing is what turned
    // a null ("cannot compute") into 0%. isScoreBacked narrowed it to a number.
    const score = Math.round(fw.score);
    const coverage = Math.round((fw.implementedCount / fw.totalRequired) * 100);
```

In `snapshotData`, after `evaluated_at: result.completedAt,`, add:

```ts
      // Which curation policy produced this score, and who answers for it.
      policy_version: fw.policyVersion ?? null,
      policy_owner: fw.policyOwner ?? null,
```

In the per-framework `result_payload`, after `total_required: fw.totalRequired,`, add:

```ts
          policy_version: fw.policyVersion ?? null,
          policy_owner: fw.policyOwner ?? null,
```

- [ ] **Step 5: The `'all'` row keeps its frameworks, and loses the blend**

Replace the block from `  // ── 2. Update the "all" aggregate scorecard ────────────────────────` through the closing `});` of `const allFrameworks = result.frameworkScores.map(…)` with:

```ts
  // ── 2. Update the "all" container ──────────────────────────────────
  // It holds the per-framework entries that the agent tool, the MCP tool and
  // the Overview cards read. It no longer holds a cross-framework score:
  // `overall_score` divided compliant controls by evaluated controls, summed
  // across every framework — a blend of different standards in a unit no
  // other screen used (spec 2026-09-10 §2, §4).
  //
  // Only backed frameworks get an entry. Writing the container from an
  // all-unbacked run produced the null-scored 'all' row the 2026-08-26
  // cleanup had to remove.
  const backedFrameworks = result.frameworkScores.filter(isScoreBacked);
  if (backedFrameworks.length === 0) {
    console.warn('[syncScorecard] No framework had a backed score; leaving the aggregate untouched.');
    return;
  }

  const allFrameworks = backedFrameworks.map((fw) => {
    const code = fw.frameworkId;
    const score = Math.round(fw.score);

    return {
      code,
      name: resolveFrameworkName(code),
      score,
      coverage: score,
      missing: fw.missingControls.length,
      icon: resolveFrameworkIcon(code),
      implemented: fw.implementedCount,
      total_required: fw.totalRequired,
      policy_version: fw.policyVersion ?? null,
      policy_owner: fw.policyOwner ?? null,
      // 2-Phase addition:
      isms_score: fw.ismsScore ?? null,
      evidence_score: fw.evidenceScore ?? null,
      conforming_count: fw.conformingCount ?? null,
      partial_count: fw.partialCount ?? null,
      informal_count: fw.informalCount ?? null,
      gap_count: fw.gapCount ?? null,
      run_estimated_count: runEstimatedCount,
      run_evaluation_error_count: runEvaluationErrorCount,
    };
  });
```

Delete the now-duplicated block further down:

```ts
  // The aggregate is only meaningful if at least one framework contributed a
  // backed score. Writing it from an all-unbacked run produced the null-scored
  // 'all' row the 2026-08-26 cleanup had to remove.
  const backedFrameworks = result.frameworkScores.filter(isScoreBacked);
  if (backedFrameworks.length === 0) {
    console.warn('[syncScorecard] No framework had a backed score; leaving the aggregate untouched.');
    return;
  }
```

In the `'all'` insert's `snapshot_data`, delete:

```ts
        overall_score: result.totalControlsEvaluated > 0
          ? Math.round((result.totalControlsCompliant / result.totalControlsEvaluated) * 100)
          : null,
```

and replace the top-level:

```ts
      score: result.totalControlsEvaluated > 0
        ? Math.round((result.totalControlsCompliant / result.totalControlsEvaluated) * 100)
        : null,
```

with:

```ts
      // No cross-framework score. Each framework's lives in its own entry.
      score: null,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- tests/unit/assessment/scorecard-backing.test.ts --testTimeout=60000"`
Expected: PASS.

- [ ] **Step 7: Full suite, tsc, eslint** (Global Constraints commands). All within baseline. If `tsc` reports `isScoreBacked` called somewhere with an argument lacking `score`, run `grep -rn "isScoreBacked(" src` and pass the framework's `score` there.

- [ ] **Step 8: Commit**

```bash
git add src/lib/assessment/assessment-to-scorecard.ts tests/unit/assessment/scorecard-backing.test.ts
git commit -F - <<'MSG'
fix(scorecard): write the projection's score, stamped with its policy

The writer recomputed implemented/total itself, so a projection that could
not decide anything (score null) was written as 0%, and the policy stamp
the engines produce was dropped. It now writes the projection's score,
refuses a null one, and stamps every per-framework row and every 'all'
entry with policy_version and policy_owner. The 'all' row keeps its
frameworks[] and loses overall_score, a blend of different standards.

stampedFrameworkEntries is the reader for that container: only scored,
stamped entries with a denominator come out of it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 6: The legacy calculation goes, and readers ask for `'all'` by name

**Files:**
- Modify: `src/lib/data/compliance-data.ts` (delete `calculateFrameworkScoresLocally`, ~lines 124-319; delete the fallback in `getFrameworkScores`, ~lines 399-416; imports)
- Modify: `src/app/api/cron/agentic-triggers/route.ts:5,7,9` (imports), `:226-432` (sweep 3's build and write)
- Modify: `src/app/api/compliance/scorecard/route.ts` (header, import, read, fallback)
- Modify: `src/app/api/compliance/report/route.ts:149, 266`
- Modify: `src/lib/agents/tools/index.ts:~35`
- Modify: `src/lib/mcp/posture-tools.ts:~170`
- Create: `docs/sql/2026-09-10b_APPLY_ME_retire_legacy_scorecards.sql`
- Create: `tests/unit/data/framework-scores.test.ts`
- Modify: `tests/agents/tools.test.ts` (one assertion)

**Interfaces:**
- Consumes: `stampedFrameworkEntries(snapshotData: unknown): StampedFrameworkEntry[]` (Task 5). `resolveFrameworkScore(computed: { code: string; score: number | null } | undefined): number | null` (exists, `agentic-triggers/score.ts`).
- Produces: `getFrameworkScores()` returns `[]` for an empty scorecard table. `calculateFrameworkScoresLocally` no longer exists.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/data/framework-scores.test.ts`:

```ts
// tests/unit/data/framework-scores.test.ts
// The guard against the legacy number returning. Deleting the scorecard rows
// used to make getFrameworkScores recompute them from scf_framework_mappings —
// the table 25,589 fabricated rows were quarantined from — on the very next
// read, and cache the result for five minutes (spec 2026-09-10 §3.3).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseServer } from '../../setup';

describe('getFrameworkScores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseServer.from.mockReturnThis();
    mockSupabaseServer.select.mockReturnThis();
    mockSupabaseServer.eq.mockReturnThis();
    mockSupabaseServer.order.mockReturnThis();
  });

  it('returns [] for an empty scorecard table, and computes nothing in its place', async () => {
    mockSupabaseServer.order.mockResolvedValueOnce({ data: [], error: null });

    const { getFrameworkScores } = await import('@/lib/data/compliance-data');

    expect(await getFrameworkScores()).toEqual([]);
    expect(mockSupabaseServer.from.mock.calls.map((c: unknown[]) => c[0])).toEqual(['intelligence_snapshots']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- tests/unit/data/framework-scores.test.ts --testTimeout=60000"`
Expected: FAIL. The recorded tables include `scf_framework_mappings`, which the fallback read.

- [ ] **Step 3: Delete the calculation and the fallback in `compliance-data.ts`**

First look at the boundaries: `sed -n '118,132p;314,330p' src/lib/data/compliance-data.ts`.

Delete the comment block directly above `export async function calculateFrameworkScoresLocally(` together with the whole function, up to and including its closing `}`. At plan time that is lines 124-319, ending just before the `// ---…` banner of `// 1. getFrameworkScores()`.

In the `// 1. getFrameworkScores()` banner, replace the line `// Fallback: local calculations from standard mappings.` with:

```ts
// Empty table: []. There is no fallback calculation.
```

In `getFrameworkScores`, replace the block from `    // Fallback: calculate framework scores fully locally` through the closing `}` of its `catch (localErr) { … }` with:

```ts
    // An empty scorecard table is reported as empty. This fell back to
    // calculateFrameworkScoresLocally — the legacy-table calculation deleted
    // on 2026-09-10 — so clearing the table only brought the old number back
    // on the next read.
```

Keep the two lines that follow (`console.warn("[compliance-data] getFrameworkScores: no data available");` and `return [];`).

Then run: `grep -n "resolveFrameworkName\|resolveFrameworkIcon\|standardApi\.\|FRAMEWORK_ICONS\|DOMAIN_FULL_NAMES" src/lib/data/compliance-data.ts`
Remove from the imports every name whose only remaining hit is its import line. At plan time that is `resolveFrameworkName` and `resolveFrameworkIcon`, which makes line 9 go entirely. Keep anything still used.

- [ ] **Step 4: Run the test to verify it passes**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- tests/unit/data/framework-scores.test.ts --testTimeout=60000"`
Expected: PASS.

- [ ] **Step 5: Sweep 3 reads the `'all'` row and writes nothing**

In `src/app/api/cron/agentic-triggers/route.ts`, delete these three imports:

```ts
import * as standardApi from '@/lib/standard-api/client';
import { calculateFrameworkScoresLocally } from '@/lib/data/compliance-data';
import { DEFAULT_FRAMEWORKS } from '@/lib/assessment/framework-registry';
```

and add:

```ts
import { stampedFrameworkEntries } from '@/lib/assessment/assessment-to-scorecard';
```

Replace everything from the line `    // Cache scores globally per framework code using local calculations` down to (not including) `    // Batch-fetch ALL org state rows for framework scores in one query`. That span covers the local calculation, the per-framework snapshot writes with their "authoritative sources" guard and "preserving higher score" ratchet, and the `'all'` aggregate write. Replace it with:

```ts
    // Scores come from the one scorecard writer (assessment-to-scorecard.ts),
    // read from its 'all' container with this cron's admin client —
    // getFrameworkScores would create a session client, and a cron has none.
    //
    // Until 2026-09-10 this sweep computed its own scores from the legacy
    // scf_framework_mappings table and wrote them back as scorecard snapshots,
    // behind a ratchet that refused to record a lower score. It writes no
    // scorecards now. Only stamped entries count: an unstamped legacy row
    // must not seed a notification baseline.
    const cachedScores = new Map<string, number>();
    const { data: allSnap } = await supabase
      .from('intelligence_snapshots')
      .select('snapshot_data')
      .eq('snapshot_type', 'scorecard')
      .eq('framework_code', 'all')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const scoreByFramework = new Map(
      stampedFrameworkEntries(allSnap?.snapshot_data).map((e) => [e.code, { code: e.code, score: e.score }]),
    );
    for (const framework of allUniqueFrameworks) {
      // No real score means no entry: downstream reads cachedScores to decide
      // whether to alert the user and what baseline to persist.
      const resolved = resolveFrameworkScore(scoreByFramework.get(framework));
      if (resolved !== null) cachedScores.set(framework, resolved);
    }

```

Then run: `grep -n "standardApi\|DEFAULT_FRAMEWORKS\|localScore\|mainFrameworks\|frameworksToProcess" src/app/api/cron/agentic-triggers/route.ts`
Expected: no output.

- [ ] **Step 6: The scorecard route loses its local branch**

In `src/app/api/compliance/scorecard/route.ts`, replace lines 1-3:

```ts
// src/app/api/compliance/scorecard/route.ts
// Returns compliance scores for all frameworks
// Source: intelligence_snapshots (scorecard type) + fallback to hardcoded data
```

with:

```ts
// src/app/api/compliance/scorecard/route.ts
// Returns compliance scores for all frameworks.
// Source: the 'all' scorecard row written by assessment-to-scorecard.ts, else
// the per-framework rows via getFrameworkScores(). There is no computed or
// hardcoded fallback: with nothing written, `frameworks` is empty.
```

Replace `import { getFrameworkScores, calculateFrameworkScoresLocally } from "@/lib/data/compliance-data";` with:

```ts
import { getFrameworkScores } from "@/lib/data/compliance-data";
```

Add the framework filter to the snapshot read, so it reads:

```ts
      .eq("snapshot_type", "scorecard")
      .eq("framework_code", "all")
      .order("created_at", { ascending: false })
```

Delete the whole block from `    // Fallback: calculate scorecard locally using centralized calculator` through the closing `}` of its `catch (calcError) { … }`. Keep the `// Final fallback: get framework scores using the async getter` block after it.

Then run: `grep -n "logger" src/app/api/compliance/scorecard/route.ts`. The import stays; the outer `catch` still uses it.

- [ ] **Step 7: The other readers ask for `'all'` by name**

In `src/app/api/compliance/report/route.ts`, change both scorecard reads (~lines 149 and 266). After each line `.eq("snapshot_type", "scorecard")`, add a line at the same indentation:

```ts
        .eq("framework_code", "all")
```

(Line 149 is indented 8 spaces, line 266 is indented 6. Match each.)

In `src/lib/agents/tools/index.ts` (~line 35) and `src/lib/mcp/posture-tools.ts` (~line 170), after `.eq('snapshot_type', 'scorecard')`, add a line at the same indentation:

```ts
        .eq('framework_code', 'all')
```

Each file had one read of "the latest scorecard, any framework". Each got the `'all'` row only because it is inserted last.

Verify: `grep -rn -A1 "eq(.snapshot_type., .scorecard.)" src --include=*.ts`. Expected: in the four files above, each match is followed by a `framework_code` line. Writers (`assessment-to-scorecard.ts`'s deletes) show `framework_code` too. `getFrameworkScores` reads every row on purpose and has none. The stats route is the one remaining unfiltered single-row read; Task 7 changes it.

In `tests/agents/tools.test.ts`, in the test `'returns score from intelligence_snapshots cache when available'`, add after its existing assertions:

```ts
    // The 'all' container by name, not "whichever scorecard was written last".
    expect(mockSupabaseAdmin.eq).toHaveBeenCalledWith('framework_code', 'all');
```

- [ ] **Step 8: The one-time purge script**

Create `docs/sql/2026-09-10b_APPLY_ME_retire_legacy_scorecards.sql`:

```sql
-- 2026-09-10b_APPLY_ME_retire_legacy_scorecards.sql
--
-- O QUE ESTAVA ERRADO
-- Todas as linhas de scorecard em intelligence_snapshots em 2026-09-10 — três:
-- iso27001, iso27701 e all — foram escritas pelo sweep 3 do cron
-- agentic-triggers (input_payload.source = 'cron_scheduler'). Ele calculava a
-- nota a partir de scf_framework_mappings, a tabela de onde 25.589 linhas
-- fabricadas foram postas em quarentena em 2026-08-25, dividia por controles
-- SCF (582 para a ISO 27001) em vez de requisitos (148), e não carimbava a
-- política de curadoria. Uma catraca impedia a nota de cair.
--
-- O código que as escrevia foi removido (spec
-- docs/superpowers/specs/2026-09-10-defensible-numbers-design.md §4). Estas
-- linhas continuam no banco até este script rodar. Os leitores já descartam
-- entradas sem carimbo, mas uma linha que não pode ser defendida não tem
-- motivo para ficar.
--
-- PRÉ-REQUISITO: 2026-09-10_APPLY_ME_manual_application_ledger.sql aplicado
-- (cria public.schema_manual_applications, onde este script se registra).
--
-- SEGURO DE REPETIR: o DELETE não encontra nada na segunda passada, e o
-- registro usa ON CONFLICT.

DELETE FROM public.intelligence_snapshots
WHERE snapshot_type = 'scorecard'
  AND input_payload->>'source' = 'cron_scheduler';

INSERT INTO public.schema_manual_applications
  (script_name, status, applied_at, recorded_by, evidence, notes)
VALUES (
  '2026-09-10b_APPLY_ME_retire_legacy_scorecards.sql',
  'applied',
  now(),
  current_user,
  (SELECT format('%s linhas de scorecard com source = cron_scheduler restantes', count(*))
     FROM public.intelligence_snapshots
    WHERE snapshot_type = 'scorecard'
      AND input_payload->>'source' = 'cron_scheduler'),
  'Retira os scorecards sem carimbo de política escritos pelo sweep 3 do agentic-triggers.'
)
ON CONFLICT (script_name) DO UPDATE
  SET applied_at = EXCLUDED.applied_at,
      evidence   = EXCLUDED.evidence;

-- VERIFICAÇÃO: não deve restar nenhuma linha com source = cron_scheduler.
SELECT input_payload->>'source' AS source, framework_code, count(*)
  FROM public.intelligence_snapshots
 WHERE snapshot_type = 'scorecard'
 GROUP BY 1, 2
 ORDER BY 1, 2;
```

**Do not run it.** It is for the operator (see "After merge" below).

- [ ] **Step 9: Verify the function is gone everywhere**

Run: `grep -rn "calculateFrameworkScoresLocally" src tests`
Expected: no output.

- [ ] **Step 10: Full suite, tsc, eslint** (Global Constraints commands). All within baseline. `tests/unit/agents/cron.test.ts` must pass unchanged: its admin mock returns no `'all'` row, so the score sweep stays silent.

- [ ] **Step 11: Commit**

```bash
git add src/lib/data/compliance-data.ts src/app/api/cron/agentic-triggers/route.ts src/app/api/compliance/scorecard/route.ts src/app/api/compliance/report/route.ts src/lib/agents/tools/index.ts src/lib/mcp/posture-tools.ts docs/sql/2026-09-10b_APPLY_ME_retire_legacy_scorecards.sql tests/unit/data/framework-scores.test.ts tests/agents/tools.test.ts
git commit -F - <<'MSG'
fix(scorecard): delete the legacy calculation and all three of its outlets

calculateFrameworkScoresLocally computed scores from the quarantined
scf_framework_mappings table, in SCF controls rather than requirements,
and reached the screen three ways: the agentic-triggers cron wrote it as
scorecard snapshots behind a ratchet that refused lower scores,
getFrameworkScores recomputed it whenever the table was empty, and the
scorecard route fell back to it. All three are closed; the cron now reads
the stamped 'all' row and writes nothing.

Readers that took "the latest scorecard, any framework" ask for 'all' by
name. The APPLY_ME script retires the three unstamped rows already in the
table.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 7: One card per framework on the Overview

**Files:**
- Modify: `src/app/api/dashboard/stats/route.ts` (`getDashboardStats`, ~lines 1-90)
- Modify: `src/hooks/queries/use-dashboard.ts` (`StatsSchema`)
- Modify: `src/app/(dashboard)/page.tsx` (imports, `stats` fallback, `STATS`, the grid, the new strip)
- Test: `tests/api/dashboard-stats.test.ts`

**Interfaces:**
- Consumes: `stampedFrameworkEntries` and `StampedFrameworkEntry` (Task 5).
- Produces: `stats.frameworkScores: Array<{ code: string; name: string; score: number; satisfied: number; total: number; policyVersion: string; policyOwner: string | null; evaluatedAt: string | null }>`. `stats.score` is removed. The hook exports `type FrameworkScoreEntry`.

- [ ] **Step 1: Write the failing tests**

In `tests/api/dashboard-stats.test.ts`, replace the whole test `it('shows a dash, not a confidence average, when no scorecard exists', …)` with:

```ts
  it('shows no framework score, and no confidence average, when no scorecard exists', async () => {
    // With no scorecard the card once fell back to
    // evaluationSummary.avgConfidence — a confidence average rendered under a
    // compliance label. Two quantities, one name. The honest answer when
    // nothing has been scored is no entry, which the Overview renders as "—".
    const complianceData = await import('@/lib/data/compliance-data');
    vi.spyOn(complianceData, 'getEvaluationSummary').mockResolvedValue({
      total: 0,
      compliant: 0,
      nonCompliant: 0,
      avgConfidence: 73,
    });

    const originalFromImpl = mockSupabaseServer.from.getMockImplementation();
    mockSupabaseServer.from.mockImplementation((table: string) => {
      const builder = originalFromImpl(table);
      if (table === 'intelligence_snapshots') {
        builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      }
      return builder;
    });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const body = await (await GET(new Request('http://localhost') as never)).json();

    expect(body.data.stats.frameworkScores).toEqual([]);
    expect(body.data.stats).not.toHaveProperty('score');
    expect(JSON.stringify(body.data.stats)).not.toContain('73');
  });

  it("returns one entry per stamped framework in the 'all' row, with its denominator and policy", async () => {
    const originalFromImpl = mockSupabaseServer.from.getMockImplementation();
    mockSupabaseServer.from.mockImplementation((table: string) => {
      const builder = originalFromImpl(table);
      if (table === 'intelligence_snapshots') {
        builder.maybeSingle = vi.fn().mockResolvedValue({
          data: {
            snapshot_data: {
              evaluated_at: '2026-09-11T02:10:00Z',
              frameworks: [
                {
                  code: 'iso27001',
                  name: 'ISO 27001',
                  score: 23,
                  implemented: 34,
                  total_required: 148,
                  policy_version: '2026-08-27.1',
                  policy_owner: 'GRC lead',
                },
                // Legacy, unstamped: must not reach the Overview.
                { code: 'iso27701', name: 'ISO 27701', score: 61, implemented: 355, total_required: 582 },
              ],
            },
          },
          error: null,
        });
      }
      return builder;
    });

    const { GET } = await import('@/app/api/dashboard/stats/route');
    const body = await (await GET(new Request('http://localhost') as never)).json();

    expect(body.data.stats.frameworkScores).toEqual([
      {
        code: 'iso27001',
        name: 'ISO 27001',
        score: 23,
        satisfied: 34,
        total: 148,
        policyVersion: '2026-08-27.1',
        policyOwner: 'GRC lead',
        evaluatedAt: '2026-09-11T02:10:00Z',
      },
    ]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- tests/api/dashboard-stats.test.ts --testTimeout=60000"`
Expected: FAIL. `frameworkScores` is `undefined`, and `score` is present.

- [ ] **Step 3: The stats route reads the `'all'` container**

In `src/app/api/dashboard/stats/route.ts`, add after the `compliance-data` import:

```ts
import { stampedFrameworkEntries } from "@/lib/assessment/assessment-to-scorecard";
```

In `getDashboardStats`, rename the destructured `frameworkScores` (from `getFrameworkScores()`) to `perFrameworkRows`, and update its two uses in the `frameworkCount` expression (`perFrameworkRows.length > 0` and `perFrameworkRows.length.toString()`).

Replace the scorecard read in the `Promise.all`:

```ts
    // Latest score from intelligence_snapshots
    supabase
      .from("intelligence_snapshots")
      .select("snapshot_data")
      .eq("snapshot_type", "scorecard")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
```

with:

```ts
    // The 'all' container, by name. This read used to take "the latest
    // scorecard, any framework", and got 'all' only because it is written last.
    supabase
      .from("intelligence_snapshots")
      .select("snapshot_data")
      .eq("snapshot_type", "scorecard")
      .eq("framework_code", "all")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
```

Replace the block from `  // Extract score` through the end of the comment `// avgScore stays "—".` with:

```ts
  // One entry per framework, never a blend of different standards (spec
  // 2026-09-10 §5), and only entries stamped with the curation policy that
  // produced them. With none, the Overview says no assessment has run under
  // the current policy. There is still no fallback to avgConfidence: a
  // confidence average is not a compliance score.
  const allData = scoreResult.data?.snapshot_data as Record<string, unknown> | undefined;
  const evaluatedAt = typeof allData?.evaluated_at === "string" ? allData.evaluated_at : null;
  const frameworkScores = stampedFrameworkEntries(allData).map((entry) => ({ ...entry, evaluatedAt }));
```

In the returned object, replace `    score: avgScore,` with:

```ts
    frameworkScores,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- tests/api/dashboard-stats.test.ts --testTimeout=60000"`
Expected: PASS.

- [ ] **Step 5: The hook's schema**

In `src/hooks/queries/use-dashboard.ts`, replace the `StatsSchema` definition with:

```ts
const FrameworkScoreEntrySchema = z.object({
  code: z.string(),
  name: z.string(),
  score: z.number(),
  satisfied: z.number(),
  total: z.number(),
  policyVersion: z.string(),
  policyOwner: z.string().nullable(),
  evaluatedAt: z.string().nullable(),
});

export type FrameworkScoreEntry = z.infer<typeof FrameworkScoreEntrySchema>;

const StatsSchema = z.object({
  frameworks: z.union([z.string(), z.number()]).transform(v => String(v)),
  documents: z.union([z.string(), z.number()]).transform(v => String(v)),
  assessments: z.union([z.string(), z.number()]).transform(v => String(v)),
  frameworkScores: z.array(FrameworkScoreEntrySchema).default([]),
}).passthrough();
```

- [ ] **Step 6: The Overview**

In `src/app/(dashboard)/page.tsx`:

Replace `import { useDashboardStats } from "@/hooks/queries/use-dashboard";` with:

```ts
import { useDashboardStats, type FrameworkScoreEntry } from "@/hooks/queries/use-dashboard";
```

Directly above `export default function DashboardPage() {` (after the skeleton component), add:

```tsx
/** Built from the entry itself: its denominator, its policy, when it was scored. */
function frameworkTooltip(fw: FrameworkScoreEntry): string {
  const when = fw.evaluatedAt ? new Date(fw.evaluatedAt).toLocaleString() : "an unrecorded time";
  return (
    `${fw.satisfied} of the ${fw.total} ${fw.name} requirements in the official crosswalk are satisfied (${fw.score}%). ` +
    `Scored under curation policy ${fw.policyVersion}${fw.policyOwner ? `, owned by ${fw.policyOwner}` : ""}, ` +
    `by the assessment of ${when}.`
  );
}
```

Replace:

```ts
  const stats = data.stats || { frameworks: "0", documents: "0", assessments: "0", score: "—" };
```

with:

```ts
  const stats = data.stats || {
    frameworks: "0",
    documents: "0",
    assessments: "0",
    frameworkScores: [] as FrameworkScoreEntry[],
  };
```

(The cast keeps the fallback's array from typing as `never[]`, which breaks `.map` on the union.)

In `STATS`, change the Total Frameworks `tooltipContent` to:

```ts
      tooltipContent: "Number of active regulations with initiated audits.",
```

(The example it carried cited SOC 2, which has never been assessed.)

Delete the whole `Compliance Score` entry from `STATS` (the object with `label: "Compliance Score"`).

On the stats grid, change `xl:grid-cols-4` to `xl:grid-cols-3` (three cards remain):

```tsx
      <div id="stats-grid-dashboard" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
```

Directly after the closing `</div>` of that grid, add:

```tsx
      {/* Compliance per framework: one card each, never blended across standards. */}
      <div id="framework-scores-dashboard" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.frameworkScores.length > 0 ? (
          stats.frameworkScores.map((fw) => (
            <StatsCard
              key={fw.code}
              label={`${fw.name} requirements · policy ${fw.policyVersion}`}
              value={`${fw.satisfied} of ${fw.total}`}
              icon={TrendingUp}
              color="text-accent"
              bgColor="bg-accent/10"
              tooltipContent={frameworkTooltip(fw)}
            />
          ))
        ) : (
          <StatsCard
            label="Compliance by framework"
            value="—"
            icon={TrendingUp}
            color="text-accent"
            bgColor="bg-accent/10"
            tooltipContent="No assessment has been run under the current curation policy, so there is no score to show yet."
          />
        )}
      </div>
```

- [ ] **Step 7: Full suite, tsc, eslint** (Global Constraints commands). All within baseline. `grep -rn "stats\.score" src` must return nothing.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/dashboard/stats/route.ts src/hooks/queries/use-dashboard.ts "src/app/(dashboard)/page.tsx" tests/api/dashboard-stats.test.ts
git commit -F - <<'MSG'
feat(overview): one card per framework, each naming its denominator

The Overview's single Compliance Score averaged different standards in a
unit no other screen used. It is replaced by one card per framework,
"ISO 27001 requirements · policy X — 34 of 148", read from the stamped
'all' container, with a tooltip built from that entry's own data. With no
stamped entry the strip shows "—" and says no assessment has run under
the current policy. The Total Frameworks tooltip loses its SOC 2 example,
which was never assessed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

## After merge (operator, not the implementer)

From spec §7. None of these is a code task.

1. Get a new key from the vendor, and confirm with them that `sha256:7eb14124dcdd` is revoked.
2. Go to **Settings → Integrations → Standard GRC API Key** and save it. The expected response is *"Saved and now in use."*
3. Apply `docs/sql/2026-09-10_APPLY_ME_manual_application_ledger.sql`, then `docs/sql/2026-09-10b_APPLY_ME_retire_legacy_scorecards.sql`.
4. When Vercel access returns, delete `STANDARD_GRC_API_KEY` there. Also delete it from the local `.env`.
5. The next 02:00 run of `/api/cron/run-assessment` is the first stamped assessment. Until it completes, the Overview shows "—".
