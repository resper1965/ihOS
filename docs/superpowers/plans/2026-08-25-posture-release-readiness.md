# Posture Release-Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-priority items from the 2026-08-25 repo audit — a broken local test runner, four days of uncommitted posture/SCRMS work, a named-but-missing auth-gate regression test on `/api/posture`, and the roadmap's own release gate — so the repo is in a known-good, committed, releasable state.

**Architecture:** No new subsystem. This is a sequence of independent repair/verification tasks against existing code: fix the dev environment, verify and land in-flight work, add one missing regression test, run the operator release-gate checklist, and regenerate stale generated types. Each task is committable on its own.

**Tech Stack:** Next.js 16 App Router, TypeScript 5 (strict), Vitest 4 (existing global mock setup in `tests/setup.ts`), Supabase CLI, npm.

**Spec:** This plan operationalizes findings from two existing documents rather than a fresh design:
- `docs/superpowers/plans/2026-08-21-operational-evidence.md` (the in-flight plan whose tasks produced the current uncommitted diff, and whose "What this plan deliberately does not do" section names the missing `/api/posture` auth-gate test as a hard precondition)
- `specs/003-truth-platform/roadmap.md` (the "Portão de release" / release-gate checklist)

## Global Constraints

- **Run every `npm`/`npx`/`vitest`/`tsc` command through native WSL, not directly from the Windows shell.** This repo's working tree (`W:\home\resper\ihOS`) is a Windows network-mapped view of a WSL2 Ubuntu filesystem (`\\wsl.localhost\Ubuntu\home\resper\ihOS`). `npm install` run through the Windows-side path hits systematic `EBADF`/`EPERM`/`ENOTEMPTY` file I/O races; dependencies are installed with Linux-native binaries/shims that the Windows shell can't execute (`'vitest' is not recognized...`) even once they're present. The working invocation pattern, confirmed during Task 0 setup:
  ```bash
  (cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && <command>")
  ```
  The `cd /c/` before invoking `wsl.exe` matters — invoking it from a cwd already inside the `W:` mount causes `wsl.exe` to intermittently fail outright (exit 1, no output) trying to translate that path for interop. If `npm install`/`ci` needs to delete `node_modules` first, expect `rm -rf` to occasionally report "Directory not empty" on stale entries — retry it (a short loop of up to ~8 attempts) rather than treating one failure as fatal; it converges.
- Node.js >= 20.9.0 (`package.json` engines)
- TypeScript strict mode; do not introduce new `as any` unless matching an existing documented exception (see Task 4)
- New/changed tests use the existing global mock setup in `tests/setup.ts` (`mockSupabaseServer`, `mockSupabaseAdmin`) — do not hand-roll a competing mock strategy
- Route-level tests live under `tests/api/`, following the pattern in `tests/api/scrms.test.ts` (import `mockSupabaseServer` from `../setup`, reset in `beforeEach`)
- Commit messages follow the repo's existing `type(scope): summary` convention (e.g. `fix(posture): ...`, `chore(env): ...`)
- Never commit `.env*` files (already gitignored) or `node_modules`
- `.gitattributes`/git line-ending normalization already converts LF→CRLF on checkout for shell scripts and some `.tsx` files in this repo; don't fight it manually, and don't include line-ending-only diffs in a commit

## Out of scope (needs its own brainstorm/spec before it can be planned)

These were surfaced by the same audit but are decisions or new subsystems, not implementation-ready work — do not start them as part of this plan:

- **F2 Context Bar** (`specs/003-truth-platform/roadmap.md` Onda 1b, tasks T201–T204) — new cross-cutting UI subsystem, architectural.
- **Migration ledger repair** ("33 of 52 files unregistered", `docs/superpowers/plans/2026-08-21-operational-evidence.md:693`) — the term isn't defined anywhere else in the repo; needs a spike to establish what "registered" means (Supabase CLI migration history table vs. something else) before it can be scoped.
- **`MIN_EVIDENCE_SCORE` semantics, `verdictConfidence` removal, `document_control_provenance` retirement, `TAG_CONFIDENCE` scoring** — each flagged by the team as its own pending design decision, not a coded task.
- **Cron activation** (DefectDojo sync and friends) — product decision on whether/when the four newly-invocable crons should actually run.
- **TODO/FIXME backlog** in `goals-widget.tsx`, `poam/route.ts`, `goals/page.tsx`, `standard-api/client.ts`, `notification-router.ts` — uninvestigated; needs its own pass.

---

### Task 0: Fix the broken local Vitest install

**Context:** Running the test suite currently fails before any test executes:

```
Error: Cannot find module './rolldown-binding.win32-x64-msvc.node'
```

This is npm's known optional-dependency bug (npm/cli#4828) — an optional native binding (`@rolldown/binding-win32-x64-msvc`, pulled in transitively by Vitest 4's `rolldown` dependency) never got installed. Every other task in this plan depends on being able to run tests, so this comes first.

**Files:**
- Modify: `node_modules/` (deleted and reinstalled — not tracked by git)
- Modify: `package-lock.json` (may be regenerated by `npm install`; review before committing)

**Interfaces:** None — infrastructure only.

- [ ] **Step 1: Confirm the failure on your machine**

Run: `npx vitest run tests/unit/posture/route-contract.test.ts`
Expected: fails to start with `Cannot find module './rolldown-binding.win32-x64-msvc.node'` (or a similarly-named native binding for your platform).

If instead the command runs and reports pass/fail results normally, this task is already fixed — skip to Task 1.

- [ ] **Step 2: Remove node_modules and the lockfile**

```bash
rm -rf node_modules package-lock.json
```

- [ ] **Step 3: Reinstall**

```bash
npm install
```

- [ ] **Step 4: Verify Vitest starts**

Run: `npx vitest run tests/unit/posture/route-contract.test.ts`
Expected: `6 passed` (the six `parsePostureQuery` cases), no startup error.

- [ ] **Step 5: Review the lockfile diff before committing**

```bash
git diff --stat package-lock.json
```

If the diff is empty, there is nothing to commit for this file. If it only touches `resolved`/`integrity` fields for packages already present (i.e. no dependency version actually changed), that's the expected shape of this fix. If it changes actual dependency **versions**, stop and flag it — do not silently accept an unplanned upgrade as part of an environment-repair commit.

- [ ] **Step 6: Commit (only if package-lock.json changed)**

```bash
git add package-lock.json
git commit -m "chore(deps): repair broken optional-dependency install (npm/cli#4828)"
```

---

### Task 1: Verify and land the in-flight posture/SCRMS work

**Context:** `git status` currently shows 14 modified files with no commits since 2026-08-21, corresponding to `docs/superpowers/plans/2026-08-21-operational-evidence.md`'s three tasks (posture-tools, evidence merge, SCRMS UI). This must be verified and committed — or explicitly reverted — before any new work starts on top of it.

**Files (verify, don't rewrite unless a test fails):**
- `src/app/(dashboard)/compliance/scrms/page.tsx`
- `src/app/api/compliance/scrms/route.ts`
- `src/app/api/compliance/vendors/route.ts`
- `src/app/api/cron/recalibrate-scrms/route.ts`
- `src/app/api/mcp/route.ts`
- `src/hooks/queries/use-scrms.ts`
- `src/hooks/queries/use-vendors.ts`
- `src/lib/assessment/engine.ts`
- `src/lib/assessment/persistence.ts`
- `src/lib/chat/rag-search.ts`
- `src/lib/data/compliance-data.ts`
- `src/lib/mcp/posture-tools.ts`
- `tests/unit/lib/mcp-posture.test.ts`
- `src/app/icon.png` (binary — see Step 2)

**Interfaces:** None new — this task verifies existing in-flight changes, it doesn't add code.

- [ ] **Step 1: Drop the line-ending-only noise**

These files show in `git diff --stat` with `0` insertions/deletions (CRLF/LF churn only, no real content change):

```bash
git diff --stat .specify/extensions/agent-context/scripts/bash/update-agent-context.sh \
  .specify/scripts/bash/check-prerequisites.sh .specify/scripts/bash/common.sh \
  .specify/scripts/bash/create-new-feature.sh .specify/scripts/bash/setup-plan.sh \
  .specify/scripts/bash/setup-tasks.sh scripts/run_cron.sh scripts/sync-env-to-vercel.sh \
  src/components/dashboard/help-sidebar.tsx src/components/dashboard/help-tooltip.tsx \
  src/lib/context/help-context.tsx
```

Confirm each shows `0` changed lines, then drop them from the working tree so the commit only carries real changes:

```bash
git checkout -- .specify/extensions/agent-context/scripts/bash/update-agent-context.sh \
  .specify/scripts/bash/check-prerequisites.sh .specify/scripts/bash/common.sh \
  .specify/scripts/bash/create-new-feature.sh .specify/scripts/bash/setup-plan.sh \
  .specify/scripts/bash/setup-tasks.sh scripts/run_cron.sh scripts/sync-env-to-vercel.sh \
  src/components/dashboard/help-sidebar.tsx src/components/dashboard/help-tooltip.tsx \
  src/lib/context/help-context.tsx
```

- [ ] **Step 2: Decide on `src/app/icon.png`**

This binary file shows as modified with the same byte count (413838 → 413838). Compare it against `HEAD`:

```bash
git diff --stat src/app/icon.png
git show HEAD:src/app/icon.png | sha256sum
sha256sum src/app/icon.png
```

If the hashes match, it's a no-op touch (e.g. a build tool rewrote it byte-identically or with only metadata differences) — run `git checkout -- src/app/icon.png` to drop it from the diff. If the hashes differ, leave it and note in the commit message that the app icon changed and why (check whether this was an intentional edit — nothing in the 2026-08-21 plan mentions the icon).

- [ ] **Step 3: Run the full suite**

```bash
npx vitest run
```

Expected: all tests pass, including the expanded `tests/unit/lib/mcp-posture.test.ts` (vendor/evidence tool tests).

If any test fails, stop here and report which one — do not guess a fix blind. The failure could mean the in-flight change is incomplete, in which case it needs to go back to whoever wrote it, not be patched over as part of this plan.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Cross-check against the source plan's acceptance criteria**

Open `docs/superpowers/plans/2026-08-21-operational-evidence.md`, section "Self-review → Spec coverage", and confirm each of its 6 numbered criteria is satisfied by the current diff (the plan already maps each one to a specific task/test — this is a read-through, not new work).

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/compliance/scrms/page.tsx \
  src/app/api/compliance/scrms/route.ts src/app/api/compliance/vendors/route.ts \
  src/app/api/cron/recalibrate-scrms/route.ts src/app/api/mcp/route.ts \
  src/hooks/queries/use-scrms.ts src/hooks/queries/use-vendors.ts \
  src/lib/assessment/engine.ts src/lib/assessment/persistence.ts \
  src/lib/chat/rag-search.ts src/lib/data/compliance-data.ts \
  src/lib/mcp/posture-tools.ts tests/unit/lib/mcp-posture.test.ts
git commit -m "feat(posture): operational evidence — SCRMS UI, vendor MCP tools, RAG merge"
```

(If Step 2 kept `icon.png` as a real change, add it to this commit or its own, per what Step 2 found.)

---

### Task 2: Add the missing `/api/posture` auth-gate regression test

**Context:** `docs/superpowers/plans/2026-08-21-operational-evidence.md` explicitly names this as a hard precondition it deliberately didn't do: `/api/posture` reads through a service-role client that bypasses RLS, and "only code review has ever checked its gate." Confirmed by inspection: `tests/unit/posture/route-contract.test.ts` only tests `parsePostureQuery` (pure query parsing), never the route handler itself. No `tests/api/posture.test.ts` exists. The route's actual behavior (`src/app/api/posture/route.ts`) is already correct — this task adds coverage that proves it, so a future change can't silently regress it.

**Files:**
- Create: `tests/api/posture.test.ts`

**Interfaces:**
- Consumes: `GET` from `@/app/api/posture/route` (signature: `(request: NextRequest) => Promise<NextResponse>`); `mockSupabaseServer` from `tests/setup.ts`
- Produces: nothing consumed by later tasks — this is a leaf regression test

- [ ] **Step 1: Write the test file**

```typescript
// tests/api/posture.test.ts
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

function mockRequest(query: string) {
  return { url: `http://localhost/api/posture${query}` } as any;
}

describe('GET /api/posture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/posture/route');
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Session not found'),
    });

    const res = await GET(mockRequest('?controls=AC-1'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 when the caller role is neither admin nor ionic_user', async () => {
    const { GET } = await import('@/app/api/posture/route');
    mockSupabaseServer.single.mockResolvedValue({ data: { role: 'client_user' }, error: null });

    const res = await GET(mockRequest('?controls=AC-1'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 400 when an authorized caller omits controls', async () => {
    const { GET } = await import('@/app/api/posture/route');

    const res = await GET(mockRequest(''));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('controls is required');
  });

  it('returns 400 when an authorized caller requests more than 500 controls', async () => {
    const { GET } = await import('@/app/api/posture/route');
    const controls = Array.from({ length: 501 }, (_, i) => `AC-${i}`).join(',');

    const res = await GET(mockRequest(`?controls=${controls}`));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('at most 500 controls per request');
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/api/posture.test.ts`
Expected: `4 passed` — the route's existing behavior already satisfies all four cases, so this is confirming coverage, not fixing a bug.

- [ ] **Step 3: Confirm it actually gates (mutation check)**

Temporarily comment out the role check in `src/app/api/posture/route.ts` (the `if (profile?.role !== 'admin' && ...)` block, lines 33–35), rerun `npx vitest run tests/api/posture.test.ts`, confirm the 403 test now fails, then revert the comment-out (`git checkout -- src/app/api/posture/route.ts`). This proves the test would actually catch a regression, not just pass vacuously.

- [ ] **Step 4: Commit**

```bash
git add tests/api/posture.test.ts
git commit -m "test(posture): add missing auth-gate coverage for /api/posture"
```

---

### Task 3: Operator release-gate checklist

**Context:** `specs/003-truth-platform/roadmap.md` lists four release-gate actions, none of which are code changes — they're operator/ops actions against live infrastructure. Track them here so they don't stay silently un-actioned.

**Files:** None (infrastructure/config actions, not repo changes — except the runbook artifact in Step 4).

- [ ] **Step 1: Rotate the exposed Supabase secret**

In the Supabase dashboard for the ihOS project, rotate `SUPABASE_SECRET_KEY` (service role key). Update it in:
- Local `.env.local` (not committed)
- Vercel project environment variables (all environments where it's set)

Verify: `git log --all -- .env.local .env` returns nothing (confirms it was never committed — if it was, that's a separate incident requiring key rotation to have already happened plus a history scrub).

- [ ] **Step 2: Confirm production environment variables**

In the Vercel project's Production environment variables, confirm:
- `STANDARD_GRC_API_URL` ends in `/api/v1`
- `STANDARD_GRC_TENANT_ID` is set (non-empty)
- `GRC_LOCAL_FALLBACK_ENABLED` is **unset** (not `"false"` — actually absent; per `.env.example`'s comment, this is opt-in-only and must stay unset in prod)

- [ ] **Step 3: Run the validation runbook against staging**

Follow `docs/RUNBOOK_analysis_flow_validation.md` end to end against the staging environment (apply migrations, run assessment twice and confirm cache hit-rate, generate + regenerate a threat model and confirm `cached: true`, seed a baseline, verify inheritance).

- [ ] **Step 4: Record the run**

Append a dated entry to `docs/RUNBOOK_analysis_flow_validation.md` (or a linked results file, matching however prior runs of this runbook were recorded) noting the date, environment, and pass/fail per step. Commit that entry.

```bash
git add docs/RUNBOOK_analysis_flow_validation.md
git commit -m "docs(runbook): record 2026-08 staging validation pass"
```

---

### Task 4: Regenerate Supabase types and audit `as any` casts

**Context:** `specs/001-analysis-flow-caching/tasks.md` (T050) and `specs/002-analysis-flow-hardening/tasks.md` (T041) both defer this, previously blocked on "a live DB connection this session did not have." There are currently 22 occurrences of `admin as any` in `src/`. This task requires real Supabase project credentials — run it once those are available.

**Files:**
- Modify: `src/lib/supabase/types.generated.ts`
- Modify: any of the 22 call sites where the newly-generated types make the cast unnecessary

**Interfaces:** None new — this narrows existing types, it doesn't change any function signature that other tasks depend on.

- [ ] **Step 1: Record the baseline**

```bash
grep -rn "admin as any" src | wc -l
```

Expected right now: `22`.

- [ ] **Step 2: Regenerate types from the live schema**

```bash
npx supabase gen types typescript --project-id <your-project-ref> --schema public > src/lib/supabase/types.generated.ts
```

(Get `<your-project-ref>` from the Supabase project settings — it's the same project referenced by `NEXT_PUBLIC_SUPABASE_URL`.)

- [ ] **Step 3: Type-check to find newly-typeable sites**

```bash
npx tsc --noEmit
```

This won't error on the `as any` casts themselves (that's what `as any` suppresses), so instead grep for each cast site and manually check whether the table it queries now appears in the regenerated `types.generated.ts`:

```bash
grep -rn "admin as any" src
```

For each hit, remove the `as any` and let `npx tsc --noEmit` tell you whether the now-typed client compiles against that call site unmodified. If it does, the cast is gone. If it doesn't (the code relies on a shape the generated types don't express, e.g. a joined/aliased column), put the cast back and leave a comment naming which column/table isn't representable, rather than fighting the type checker into an unsound shape.

- [ ] **Step 4: Record the delta**

```bash
grep -rn "admin as any" src | wc -l
```

Expected: fewer than 22. It does not need to reach 0 — some sites are documented exceptions (e.g. `src/app/api/mcp/route.ts`'s comment: "`mcp_audit_log` is newer than the generated Supabase types"). Note in the commit message how many were removed and how many remain, with why.

- [ ] **Step 5: Run the full suite**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: all green — this task only narrows types, it shouldn't change runtime behavior.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/types.generated.ts
git commit -m "chore(types): regenerate Supabase types, drop N/22 stale 'as any' casts"
```
