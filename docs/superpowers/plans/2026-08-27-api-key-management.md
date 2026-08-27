# API Key Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator see whether the Standard GRC API key actually works — including which scopes it carries — and set a new one from the app, without the "Connected" badge asserting a connection nobody checked.

**Architecture:** Three layers, ordered so value lands before risk. First harden the existing vault write RPC, which is protected only by its grant while its read sibling has a second internal check. Then replace the hardcoded integration badge with a real probe, which is read-only and answers the operator's actual question today. Only then add the write path, which is the part that handles a secret and therefore gets the strictest gate and the last slot.

**Tech Stack:** Next.js 16 App Router, TypeScript 5 (strict), Vitest 4, Supabase Vault.

**Spec:** No separate design doc. This addresses a question asked directly on 2026-08-27 — "is there anywhere in the app to fill in the Standard API key?" — whose answer is no, plus two defects found while establishing that answer:

1. `src/app/(dashboard)/settings/page.tsx:270` renders `<IntegrationRow name="Standard GRC API" status="Connected" />`. `IntegrationRow` takes only `name`, `status` and `icon`; the string is hardcoded in JSX. **It reads "Connected" whether the key is valid, absent, expired, or missing every scope.** That is the same class of defect this codebase spent 2026-08-25/26 removing: an indicator asserting something it never verified. The key currently lacks three scopes and the badge still says Connected.
2. `src/lib/supabase/vault.ts:9-13` — `getSecret` checks `process.env[name]` **first** and returns immediately if set. So a key written to the Vault is shadowed in every environment where the env var exists, which is all of them today. A Settings field that writes to the Vault would silently appear to do nothing. This is addressed head-on in Task 3, not discovered later.

## Global Constraints

- **Run every `npm`/`npx`/`vitest`/`tsc` command through native WSL:**
  ```bash
  (cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && <command>")
  ```
  The `cd /c/` matters — invoking `wsl.exe` from inside the `W:` mount makes it intermittently fail (exit 1, no output). Git commands work fine from the default shell.
- **Measure the baseline; do not copy a number from this document.** Earlier plans in this series stated baselines that had gone stale, and one caused a reconciliation detour. Task 1 Step 1 measures test count and `tsc --noEmit` errors and records them.
- Route-level tests live in `tests/api/`, following the `mockSupabaseServer` + `beforeEach` reset convention in `tests/api/scrms.test.ts`. Library tests in `tests/unit/<area>/`.
- TypeScript strict. No new `as any` beyond existing documented exceptions. Commits follow `type(scope): summary`.
- **Never log, echo, return or render a secret value.** Not in an error message, not in a debug line, not in a test fixture that could be mistaken for real. Where a value must be identified, use the same convention the vendor uses: the first 12 characters after the `standard_live_` prefix.
- **Do not** apply a migration to the live database, POST to the Standard API with a modified key, or run a live assessment. Migration files are written; applying them is an operator step.

## Ordering rationale, stated because it is deliberate

Task 2 (the honest badge) delivers most of the value and carries almost no risk — it only reads. Task 3 (the write path) is what was literally asked for, but it is a route that accepts a credential, so it lands last and behind the strictest gate. If only one task ships, Task 2 is the one worth having: knowing the key lacks `intelligence:run` is more useful than a field for typing a key whose effect you cannot see.

---

### Task 1: Harden the vault write RPC to match its read sibling

**Context:** `supabase/migrations/20260622000002_enable_supabase_vault.sql` defines both helpers as `SECURITY DEFINER` and correctly does `REVOKE EXECUTE ... FROM public` plus `GRANT EXECUTE ... TO service_role, postgres` on each. But the two are not equally defended:

- `get_vault_secret` **also** performs an internal role check, raising unless the caller is `service_role`, `postgres` or `supabase_admin`.
- `set_vault_secret` has **no** internal check. Its only protection is the grant.

Today both are equally unreachable from `authenticated`. The asymmetry matters for what happens next: if anyone ever adds a convenience `GRANT EXECUTE ... TO authenticated`, the read stays protected by its internal check and the **write silently opens**. Task 3 is about to build a route on top of this function, so closing the asymmetry first is the cheap ordering.

**Files:**
- Create: `supabase/migrations/20260827000001_harden_set_vault_secret.sql`
- Test: `tests/unit/posture/migration-invariants.test.ts` (extend — this file already asserts properties of migration SQL)

**Interfaces:** none consumed or produced in code; the migration changes a database function.

- [ ] **Step 1: Measure and record the baseline**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -4 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Put both numbers in your report. Later steps compare against them.

- [ ] **Step 2: Read the existing migration-invariants test to match its style**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && sed -n '1,40p' tests/unit/posture/migration-invariants.test.ts")
```

That file already asserts things about migration SQL as text. Follow whatever pattern it uses for locating and reading a migration file rather than inventing a second approach.

- [ ] **Step 3: Write the failing test**

Append to `tests/unit/posture/migration-invariants.test.ts`, matching the file's existing import and file-reading style:

```typescript
describe('set_vault_secret is defended in depth', () => {
  // get_vault_secret has always had an internal role check ON TOP of its
  // grant; set_vault_secret had only the grant. Both are unreachable from
  // `authenticated` today, but the asymmetry means a future convenience grant
  // would leave the read protected and silently open the write. A route that
  // stores a credential is about to be built on this function.
  it('rejects callers that are not service_role/postgres/supabase_admin', () => {
    const sql = readMigration('20260827000001_harden_set_vault_secret.sql');
    expect(sql).toMatch(/set_vault_secret/);
    expect(sql).toMatch(/service_role/);
    expect(sql).toMatch(/RAISE EXCEPTION/i);
  });

  it('keeps the grant revoked from public', () => {
    const sql = readMigration('20260827000001_harden_set_vault_secret.sql');
    expect(sql).toMatch(/REVOKE EXECUTE[\s\S]*FROM public/i);
  });

  it('does not log or return the secret value', () => {
    const sql = readMigration('20260827000001_harden_set_vault_secret.sql');
    // A SECURITY DEFINER function that RAISEs with the value, or returns it,
    // would put a credential into Postgres logs.
    expect(sql).not.toMatch(/RAISE\s+(NOTICE|LOG|INFO|WARNING)[\s\S]{0,120}secret_value/i);
    expect(sql).not.toMatch(/RETURNS\s+text/i); // it returns the secret's uuid, never the value
  });
});
```

If `readMigration` is not the helper that file uses, adapt these three tests to its actual helper — do not add a second file-reading mechanism.

- [ ] **Step 4: Run the test to verify it fails**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/posture/migration-invariants.test.ts")
```

Expected: the three new tests FAIL — the migration file does not exist yet.

- [ ] **Step 5: Write the migration**

Create `supabase/migrations/20260827000001_harden_set_vault_secret.sql`:

```sql
-- ============================================================================
-- Migration 20260827000001: defend set_vault_secret in depth
--
-- 20260622000002 created both vault helpers as SECURITY DEFINER, revoked
-- EXECUTE from public, and granted it to service_role and postgres. But only
-- get_vault_secret also performs an INTERNAL role check; set_vault_secret
-- relies on the grant alone.
--
-- Both are equally unreachable from `authenticated` today. The asymmetry is
-- the problem: a future convenience `GRANT EXECUTE ... TO authenticated` would
-- leave the read protected by its own check and silently open the write. An API
-- route that stores a credential is being built on this function, so it gets
-- the same second line of defence its sibling already has.
--
-- Deliberately does NOT log or return the secret value — a SECURITY DEFINER
-- function that RAISEs with the value would put a credential into the Postgres
-- log. The return stays the secret's uuid.
--
-- Idempotent: CREATE OR REPLACE, and re-running the grants is a no-op.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.set_vault_secret(
  secret_name text,
  secret_value text,
  secret_description text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  secret_id uuid;
  session_role text;
BEGIN
  -- Same check get_vault_secret has performed since 20260622000002.
  SELECT current_setting('role', true) INTO session_role;
  IF session_role = 'none' OR session_role IS NULL OR session_role = '' THEN
    session_role := current_user;
  END IF;

  IF session_role <> 'service_role'
     AND session_role <> 'postgres'
     AND session_role <> 'supabase_admin' THEN
    -- Names the role, never the secret.
    RAISE EXCEPTION 'Access Denied: Insufficient privileges to write vault secrets (Role: %)', session_role;
  END IF;

  SELECT id INTO secret_id FROM vault.secrets WHERE name = secret_name;

  IF secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(secret_id, secret_value, secret_name, secret_description);
  ELSE
    SELECT vault.create_secret(secret_value, secret_name, secret_description) INTO secret_id;
  END IF;

  RETURN secret_id;
END;
$$;

-- Re-assert the grants; CREATE OR REPLACE preserves them, but stating them
-- keeps this migration self-contained if it is ever applied to a fresh database.
REVOKE EXECUTE ON FUNCTION public.set_vault_secret(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_vault_secret(text, text, text) TO service_role, postgres;

COMMIT;
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/posture/migration-invariants.test.ts")
```

Expected: PASS, including the three new tests.

- [ ] **Step 7: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: your Step 1 baseline + 3 tests, tsc unchanged. A migration file changes no TypeScript.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260827000001_harden_set_vault_secret.sql tests/unit/posture/migration-invariants.test.ts
git commit -m "fix(vault): give set_vault_secret the internal role check its sibling has

20260622000002 defended get_vault_secret twice — a grant plus an internal
role check — but set_vault_secret only by its grant. Both are unreachable
from \`authenticated\` today; the asymmetry is that a future convenience grant
would leave the read protected and silently open the write. A route that
stores a credential is being built on this function.

The check names the offending role and never the secret value: a SECURITY
DEFINER function that RAISEd with the value would write a credential into the
Postgres log.

Migration file only — applying it is an operator step."
```

---

### Task 2: Replace the hardcoded "Connected" badge with a real probe

**Context:** `settings/page.tsx:270` asserts `status="Connected"` for the Standard GRC API as a literal string. It says Connected right now, while the key is missing three scopes and every `/intelligence/*` call returns 403. This is the badge equivalent of the fabricated numbers this codebase spent two days removing.

The Standard API makes an honest badge easy: its 403 body now names both what the key holds and what the route needs, verbatim —

```
"This API key lacks the required scope(s): intelligence:run.
 Key has: assessment:read, assessment:write, document:read, document:write, scf:read."
```

So the probe can report actual scopes rather than a guess.

**Files:**
- Create: `src/app/api/settings/integrations/standard-api/route.ts`
- Modify: `src/app/(dashboard)/settings/page.tsx` (the `IntegrationRow` for Standard GRC API, and `IntegrationRow` itself)
- Test: `tests/api/integration-health.test.ts` (create)

**Interfaces:**
- Produces, consumed by the Settings page:
  ```typescript
  type StandardApiHealth = {
    reachable: boolean;
    keyConfigured: boolean;
    keyPrefix: string | null;      // first 12 chars after standard_live_, never the key
    scopesHeld: string[] | null;   // parsed from the API's own 403 body
    scopesMissing: string[] | null;
    catalogReadable: boolean;
    checkedAt: string;
    detail: string | null;
  };
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/api/integration-health.test.ts`:

```typescript
// tests/api/integration-health.test.ts
// The Settings page used to render status="Connected" as a hardcoded string —
// true whether the key was valid, absent, expired, or (as it actually was)
// missing three scopes. This endpoint reports what the API really says.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabaseServer } from '../setup';

function resetMocks() {
  mockSupabaseServer.auth.getUser.mockResolvedValue({
    data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    error: null,
  });
  mockSupabaseServer.from.mockReturnThis();
  mockSupabaseServer.select.mockReturnThis();
  mockSupabaseServer.eq.mockReturnThis();
  mockSupabaseServer.single.mockResolvedValue({ data: { role: 'admin' }, error: null });
}

describe('GET /api/settings/integrations/standard-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/settings/integrations/standard-api/route');
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Session not found'),
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-privileged role', async () => {
    const { GET } = await import('@/app/api/settings/integrations/standard-api/route');
    mockSupabaseServer.single.mockResolvedValue({ data: { role: 'client_user' }, error: null });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('parses the scopes the API reports out of a 403 body', async () => {
    const { GET } = await import('@/app/api/settings/integrations/standard-api/route');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        title: 'INSUFFICIENT SCOPE',
        detail:
          'This API key lacks the required scope(s): intelligence:run. Key has: ' +
          'assessment:read, assessment:write, document:read, document:write, scf:read.',
      }),
    })));

    const res = await GET();
    const body = await res.json();

    expect(body.scopesMissing).toContain('intelligence:run');
    expect(body.scopesHeld).toContain('scf:read');
    expect(body.scopesHeld).toContain('assessment:write');
  });

  it('never returns the key itself, only a prefix', async () => {
    const { GET } = await import('@/app/api/settings/integrations/standard-api/route');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));

    const res = await GET();
    const raw = JSON.stringify(await res.json());

    // The full key must never appear in the response, under any field.
    expect(raw).not.toMatch(/standard_live_[a-f0-9]{20,}/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/api/integration-health.test.ts")
```

Expected: FAIL — the route does not exist.

- [ ] **Step 3: Write the health route**

Create `src/app/api/settings/integrations/standard-api/route.ts`. Model its auth gate on `src/app/api/compliance/mappings/sync/route.ts:18-29` (read that first and match it). The route must:

1. Reject unauthenticated with 401, and any role other than `admin`/`ionic_user` with 403.
2. Read the key via the existing `getSecret('STANDARD_GRC_API_KEY')` — do not re-implement resolution.
3. Probe two endpoints: `GET /scf/versions/latest` (proves the credential authenticates) and `POST /intelligence/compliance-score` with a minimal body (proves whether the scorer scope is present). Use short timeouts; this is a settings page, not a batch job.
4. Parse `scopesHeld` and `scopesMissing` out of a 403 `detail` string of the documented shape, and return `null` for both when the body does not match that shape rather than guessing.
5. Return **only** `keyPrefix` — the 12 characters after `standard_live_` — never the key. Never put the key in a log line either.

Write the scope parsing as a small exported pure function in the same file so it can be unit-tested directly, and make it tolerant: an unrecognised `detail` yields `null`, not a partial parse.

- [ ] **Step 4: Run the test to verify it passes**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/api/integration-health.test.ts")
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Make the badge tell the truth**

In `src/app/(dashboard)/settings/page.tsx`:

Extend `IntegrationRow` to accept an optional `variant` and `detail`, so a row can render amber/red with a reason instead of a fixed green `success` badge. Keep its current call shape working for the Supabase and OpenAI rows, which this task does not touch.

Then make the Standard GRC API row fetch `/api/settings/integrations/standard-api` and render:

- **green "Connected"** only when the credential authenticates AND no scope is missing;
- **amber** with the missing scopes listed when it authenticates but lacks scopes — e.g. `Missing scopes: intelligence:run`;
- **red** when it cannot authenticate or the key is absent;
- **grey "Checking…"** while the request is in flight.

Show `keyPrefix` beside it so an operator can tell which key is in use. Never render more of the key than that.

- [ ] **Step 6: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: Task 1's total + 4 tests, tsc unchanged from your Task 1 Step 1 measurement.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/settings/integrations/standard-api/route.ts "src/app/(dashboard)/settings/page.tsx" tests/api/integration-health.test.ts
git commit -m "feat(settings): report the real Standard API status instead of a hardcoded badge

settings/page.tsx rendered status=\"Connected\" as a literal string, true
whether the key was valid, absent, expired, or — as it actually was — missing
three scopes while every /intelligence/* call returned 403. Same class of
defect as the fabricated numbers removed on 2026-08-25/26: an indicator
asserting something nobody checked.

The API's 403 body now names both the scopes the key holds and the ones the
route needs, so the badge reports actual scopes rather than a guess. Amber with
the missing scopes listed is the honest state when a key authenticates but
cannot do the work.

Only the key's 12-character prefix is ever returned or rendered."
```

---

### Task 3: Let an operator set the key — and make the precedence visible

**Context:** This is what was asked for, and it lands last because it is the part that handles a credential.

There is a trap that must be addressed in the same change, not discovered afterwards. `src/lib/supabase/vault.ts:9-13`:

```typescript
export async function getSecret(name: string): Promise<string | null> {
  // Check process.env first (for local environment variable fallback/overrides)
  if (process.env[name]) {
    return process.env[name] || null;
  }
  ...
```

`process.env` **wins**. So a key saved through the UI into the Vault is ignored in every environment where `STANDARD_GRC_API_KEY` is set as an env var — which is all of them today, local and Vercel. A naive Settings field would save successfully, report success, and change nothing. The operator would then reasonably conclude the app is broken.

This plan does **not** invert the precedence. Env-var-wins is the right default for deployment: it keeps the deployed configuration authoritative and prevents a database row from silently overriding what an operator set in Vercel. Instead the UI must **show which source is active**, so the field's effect is never a mystery.

**Files:**
- Create: `src/app/api/settings/integrations/standard-api/key/route.ts` (POST)
- Modify: `src/lib/supabase/vault.ts` (add a source-reporting helper; do not change precedence)
- Modify: `src/app/(dashboard)/settings/page.tsx` (the key field)
- Test: `tests/api/standard-api-key.test.ts` (create)

**Interfaces:**
- Consumes: `StandardApiHealth` from Task 2, extended with `keySource`.
- Produces:
  ```typescript
  // src/lib/supabase/vault.ts
  export async function getSecretSource(name: string): Promise<'env' | 'vault' | 'none'>;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/api/standard-api-key.test.ts`:

```typescript
// tests/api/standard-api-key.test.ts
// Storing a credential, so the gate and the non-disclosure are the tests that
// matter. Also pins the precedence trap: getSecret checks process.env FIRST,
// so a key saved to the Vault is inert wherever the env var is set. The route
// must say so rather than reporting a success that changes nothing.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabaseServer } from '../setup';

function asRole(role: string) {
  mockSupabaseServer.auth.getUser.mockResolvedValue({
    data: { user: { id: 'u1', email: 't@example.com' } },
    error: null,
  });
  mockSupabaseServer.from.mockReturnThis();
  mockSupabaseServer.select.mockReturnThis();
  mockSupabaseServer.eq.mockReturnThis();
  mockSupabaseServer.single.mockResolvedValue({ data: { role }, error: null });
}

function req(body: unknown) {
  return { json: async () => body } as any;
}

describe('POST /api/settings/integrations/standard-api/key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asRole('admin');
  });

  it('returns 401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/settings/integrations/standard-api/key/route');
    mockSupabaseServer.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') });
    const res = await POST(req({ key: 'standard_live_aaaaaaaaaaaaaaaaaaaaaaaa' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-privileged role', async () => {
    const { POST } = await import('@/app/api/settings/integrations/standard-api/key/route');
    asRole('client_user');
    const res = await POST(req({ key: 'standard_live_aaaaaaaaaaaaaaaaaaaaaaaa' }));
    expect(res.status).toBe(403);
  });

  it('rejects a key that does not carry the expected prefix', async () => {
    const { POST } = await import('@/app/api/settings/integrations/standard-api/key/route');
    const res = await POST(req({ key: 'not-a-standard-key' }));
    expect(res.status).toBe(400);
  });

  it('never echoes the key back in the response', async () => {
    const { POST } = await import('@/app/api/settings/integrations/standard-api/key/route');
    const key = 'standard_live_0123456789abcdef0123456789abcdef';
    const res = await POST(req({ key }));
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain(key);
    expect(raw).not.toContain('0123456789abcdef0123456789abcdef');
  });

  it('warns that a stored key is shadowed when the env var is set', async () => {
    const { POST } = await import('@/app/api/settings/integrations/standard-api/key/route');
    const saved = process.env.STANDARD_GRC_API_KEY;
    process.env.STANDARD_GRC_API_KEY = 'standard_live_envvaluewinsxxxxxxxxxxxxxxxx';

    const res = await POST(req({ key: 'standard_live_0123456789abcdef0123456789abcdef' }));
    const body = await res.json();

    // The save may succeed, but the response must say it has no effect here.
    expect(body.shadowedByEnv).toBe(true);

    if (saved === undefined) delete process.env.STANDARD_GRC_API_KEY;
    else process.env.STANDARD_GRC_API_KEY = saved;
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/api/standard-api-key.test.ts")
```

Expected: FAIL — the route does not exist.

- [ ] **Step 3: Add the source-reporting helper**

In `src/lib/supabase/vault.ts`, add below `getSecret` — **without changing `getSecret`'s precedence**:

```typescript
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
```

- [ ] **Step 4: Write the POST route**

Create `src/app/api/settings/integrations/standard-api/key/route.ts`. It must:

1. Gate on `admin`/`ionic_user` exactly as Task 2's route does — copy that shape, do not invent a second one.
2. Validate the submitted key's **shape** before storing: it must start with `standard_live_` or `standard_test_` (the vendor documents both) and be long enough to be plausible. Reject with 400 otherwise. Do not include the submitted value in the error.
3. Store via the `set_vault_secret` RPC through the admin (service-role) client — that is the only role the RPC accepts, and Task 1 gave it an internal check to match.
4. Return `{ ok: true, keyPrefix, shadowedByEnv }` where `shadowedByEnv` is `getSecretSource(...) === 'env'`. **Never** return or log the key.
5. Invalidate the in-memory `secretsCache` in `vault.ts` for that name, or the process will keep serving the old value until restart. Read that cache's implementation before deciding how — a stale cache would make a successful save look ineffective, which is the same confusion this task exists to prevent.

- [ ] **Step 5: Run the test to verify it passes**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/api/standard-api-key.test.ts")
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Add the field, and show which source wins**

In `src/app/(dashboard)/settings/page.tsx`, add to the Integrations section, visible only to `admin`/`ionic_user`:

- a password-type input for the key, submitting to the POST route;
- the active source, in plain words — e.g. `In use: environment variable (a key saved here will not take effect)` versus `In use: saved key`;
- on a save whose response has `shadowedByEnv: true`, a visible amber note saying the value was stored but the environment variable takes precedence, and that the env var must be changed in Vercel for it to take effect.

The field must never display an existing key, not even masked with its length visible. Show only the prefix Task 2 already returns.

- [ ] **Step 7: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: Task 2's total + 5 tests, tsc unchanged from the Task 1 baseline.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/settings/integrations/standard-api/key/route.ts src/lib/supabase/vault.ts "src/app/(dashboard)/settings/page.tsx" tests/api/standard-api-key.test.ts
git commit -m "feat(settings): let an admin set the Standard API key, and show which source wins

Adds an admin/ionic_user-gated POST that stores the key through
set_vault_secret (service-role only, and hardened in 20260827000001), plus a
Settings field for it.

The important half is the precedence. getSecret checks process.env FIRST, so a
key saved to the Vault is inert wherever the env var is set — which is
everywhere today. Inverting that would be worse: deployed configuration should
stay authoritative and a database row must not silently override Vercel. So
the precedence is unchanged and the UI states which source is actually in use,
and warns when a saved value is shadowed. A field that reports success while
changing nothing is its own kind of dishonest indicator.

The key is never returned, logged, or rendered — only its 12-character prefix."
```

---

## Self-review

**Ordering is the main design decision.** Task 2 delivers most of the value at almost no risk; Task 3 is what was literally asked for but handles a credential. Stated in the plan body so an executor who ships only part of it ships the useful part.

**The precedence trap is addressed, not discovered later.** A Settings field over a Vault write is silently ineffective wherever `process.env` is set, which is every environment today. The plan neither ignores it nor inverts the precedence — inverting would let a database row override deployed configuration, which is worse. It surfaces the active source instead, and Task 3's test pins `shadowedByEnv`.

**Secret hygiene is a constraint, not an afterthought.** Three separate tests assert non-disclosure (the health route's response, the POST's response, and the migration's SQL not raising with the value). The migration's `RETURNS uuid` is deliberate for the same reason.

**A gap I am leaving open.** Task 2's probe calls `POST /intelligence/compliance-score` to detect scope presence, which is a real API call from a settings page render. That is a small cost today but it is an unbounded one if the page is opened often or polled. No caching is specified, deliberately — adding one means deciding a staleness window for a security-relevant indicator, and a stale "Connected" is the defect being fixed. A reviewer may reasonably want a short TTL; it should be an explicit decision, not a default.

**Something I wrote and then removed.** Task 2 Step 4 briefly contained a deliberately wrong path as bait for copy-paste-without-reading. I took it out: a plan meant to be executed literally should not contain a command known to fail. It would burn a turn and teach nothing, and "I was testing whether you read it" is not a defence a plan gets to make.

**What a reviewer should push back on.** Task 2's Step 5 describes the badge's four states in prose rather than giving the JSX, because `IntegrationRow` has to keep working unchanged for the Supabase and OpenAI rows and the right refactor depends on its current shape. That is a judgement call handed to the implementer, and a reviewer who wants the exact component code specified has a fair point — every other task in this series pinned the code.
