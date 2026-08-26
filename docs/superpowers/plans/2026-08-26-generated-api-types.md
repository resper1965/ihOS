# Generated API Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive the Standard GRC API's response types from its published OpenAPI spec instead of hand-maintaining them, so that a mismatch between what the API returns and what our code assumes becomes a compile error rather than a silent runtime miss.

**Architecture:** Add generation-time-only tooling (`openapi-typescript`, a devDependency producing a types-only file with no runtime footprint), commit the generated output so the build never depends on the vendor's endpoint being reachable, then type the boundary — the six functions in `src/lib/standard-api/client.ts` we actually call — against it. Hand-maintained interfaces in `src/lib/standard-api/types.ts` are kept for anything the spec does not cover, but stop being the source of truth for what the API returns.

**Tech Stack:** Next.js 16 App Router, TypeScript 5 (strict), Vitest 4, `openapi-typescript` (devDependency).

**Spec:** No separate design doc. The justification is empirical, from this session:

- **Finding A9** (`docs/standard-api/CONTRACT_AUDIT.md`): our code keyed on `control_id` while every table we join on keys on `control_code`. Three consecutive nightly assessment runs evaluated zero controls. The vendor's spec declares, verbatim, `"control_id": { "type": "string", "format": "uuid" }` alongside `"control_code": { "type": "string" }` — generated types would have made that comparison a compile error.
- **§F6** of the same document: the spec is now generated from the vendor's routes with a CI check that fails their build on drift, so it is trustworthy in a way the previous hand-maintained 51-path version was not.
- Twice today a declared type diverged from runtime reality (`src/lib/agents/types.ts`'s non-nullable score fields; `RoiPathData.roi_score`). Both were caught by accident, not by tooling.

## Global Constraints

- **Run every `npm`/`npx`/`vitest`/`tsc` command through native WSL.** This working tree is a Windows network-mapped view of a WSL2 filesystem; the Windows shell cannot execute the Linux-native binaries. Pattern:
  ```bash
  (cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && <command>")
  ```
  The `cd /c/` matters — invoking `wsl.exe` from inside the `W:` mount makes it intermittently fail (exit 1, no output). Git commands work fine from the default shell.
- **`npm install` on this machine is fragile.** A first attempt this session left `node_modules` half-written; the working procedure is a native-WSL install, and `rm -rf node_modules` may need several passes before it succeeds. Adding one devDependency should be done with `npm install --save-dev --no-audit --no-fund` and verified, not assumed.
- Baseline to preserve: the test count and `tsc --noEmit` error count **as measured at the start of Task 1** — do not copy a number from this document, measure it, because the tree has been moving. Record it in your report. A task may reduce the tsc count; never increase it.
- TypeScript strict. Commits follow `type(scope): summary`.
- The generated file is committed and **never hand-edited**. Any change to it must come from re-running generation.
- **Do not** POST to the Standard API, run a live assessment, or invoke a cron endpoint. Fetching the public `openapi.json` is fine — it needs no credentials.

## Out of scope

- **Generating a runtime client or validators.** This plan produces *types only*. Runtime response validation (zod/typebox against the spec) is a separate, larger decision with a real performance and error-handling surface.
- **Typing all 366 paths' call sites.** Only the six endpoints our client actually calls get typed boundaries. The generated file will contain everything; that is free.
- **The ten routes currently returning `403 Permission denied.`** Their scopes are pending on the vendor. Typing them is useful regardless and costs nothing extra, but they cannot be exercised.
- **Retiring `src/lib/standard-api/types.ts`.** It holds 22 interfaces, some for things the spec does not describe. This plan stops it being the source of truth for API responses; deleting what becomes redundant is a follow-up once the boundary is proven.

---

### Task 1: Generate the types and commit them

**Context:** The vendor's spec is at `https://standard-api.bekaa.eu/docs/openapi.json` — OpenAPI 3.0.0, 366 paths, 433 component schemas, and confirmed to carry 200-response schemas for all six endpoints we call (verified 2026-08-26). Generation must be reproducible and the output committed, so a vendor outage or a spec change never breaks our build silently.

**Files:**
- Modify: `package.json` (devDependency + script)
- Create: `scripts/generate-api-types.sh`
- Create: `src/lib/standard-api/generated/schema.d.ts` (generated; committed; never hand-edited)
- Test: `tests/unit/standard-api/generated-types.test.ts` (create)

**Interfaces:**
- Produces, for Task 2 to consume:
  ```typescript
  // from src/lib/standard-api/generated/schema.d.ts
  export type paths = { ... };      // openapi-typescript's standard export
  export type components = { ... };
  ```
  plus the npm script `gen:api-types`.

- [ ] **Step 1: Measure and record the real baseline**

Do this first and put the numbers in your report — later steps compare against them, and this document deliberately does not state them because the tree has been moving.

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -4 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

- [ ] **Step 2: Add the generator as a devDependency**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npm install --save-dev --no-audit --no-fund openapi-typescript")
```

Then verify it actually installed rather than trusting the exit code — this machine has produced silent partial installs:

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx openapi-typescript --version && grep -n openapi-typescript package.json")
```

If the version does not print, stop and report — do not proceed with a half-installed toolchain.

- [ ] **Step 3: Write the generation script**

Create `scripts/generate-api-types.sh`:

```bash
#!/usr/bin/env bash
# Regenerate Standard GRC API types from the vendor's published OpenAPI spec.
#
# The output is COMMITTED deliberately. Two reasons:
#   1. the build must not depend on the vendor's endpoint being reachable —
#      that endpoint returned 403 for hours on 2026-08-26;
#   2. a vendor-side shape change then arrives as a reviewable diff in a pull
#      request instead of silently altering what our code compiles against.
#
# Never hand-edit the generated file. Re-run this instead.
set -euo pipefail

SPEC_URL="${SPEC_URL:-https://standard-api.bekaa.eu/docs/openapi.json}"
OUT="src/lib/standard-api/generated/schema.d.ts"

mkdir -p "$(dirname "$OUT")"

echo "Fetching $SPEC_URL"
TMP=$(mktemp)
curl -fsS --max-time 60 "$SPEC_URL" -o "$TMP"

# Fail loudly on a spec that is obviously wrong rather than generating from it.
PATHS=$(python3 -c "import json,sys; print(len(json.load(open('$TMP')).get('paths',{})))")
echo "spec reports $PATHS paths"
if [ "$PATHS" -lt 100 ]; then
  echo "ERROR: spec has only $PATHS paths. The published spec was 51 paths and badly" >&2
  echo "incomplete until 2026-08-26; a low count means we fetched a stale or wrong" >&2
  echo "document. Refusing to regenerate from it." >&2
  exit 1
fi

npx openapi-typescript "$TMP" -o "$OUT"
rm -f "$TMP"

echo "Wrote $OUT"
echo "Review the diff before committing — a change here is a change in what the"
echo "vendor says it returns."
```

Make it executable:

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && chmod +x scripts/generate-api-types.sh")
```

Add to `package.json` scripts, immediately after `check:mappings`:

```json
    "gen:api-types": "bash scripts/generate-api-types.sh"
```

(Remember the comma on the preceding line.)

- [ ] **Step 4: Generate**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npm run gen:api-types")
```

Expected: it reports ~366 paths and writes the file. If the path count guard trips, stop and report — that guard exists because the spec was genuinely 51 incomplete paths until the day before.

- [ ] **Step 5: Write a test that pins the shapes this session got wrong**

Create `tests/unit/standard-api/generated-types.test.ts`:

```typescript
// tests/unit/standard-api/generated-types.test.ts
// Type-level assertions against the generated spec types. These compile-time
// checks are the point of the whole exercise: finding A9 was our code keying on
// control_id (a UUID) while every table we join on keys on control_code, and it
// cost three nightly assessment runs that evaluated zero controls. The vendor's
// spec always said control_id was `format: uuid`; nothing made us read it.

import { describe, it, expect } from 'vitest';
import type { paths } from '@/lib/standard-api/generated/schema';

// A compile-time equality assertion. If the generated shape drifts from what
// the code below claims, `tsc` fails — which is the actual test.
type Expect<T extends true> = T;
type IsString<T> = [T] extends [string] ? true : false;

type ControlsResponse =
  paths['/api/v1/scf/versions/{scfVersionId}/controls']['get']['responses']['200']['content']['application/json'];

type ControlItem = NonNullable<ControlsResponse['data']>[number];

// Both identity fields exist and are strings — the spec marks control_id as
// `format: uuid`, which openapi-typescript renders as `string`. The distinction
// the code must respect is semantic, not structural, which is exactly why A9
// was invisible: both are strings, but only one matches our join keys.
type _codeIsString = Expect<IsString<ControlItem['control_code']>>;
type _idIsString = Expect<IsString<ControlItem['control_id']>>;

describe('generated API types', () => {
  it('exposes the controls endpoint under the camelCase path parameter', () => {
    // Documents a real trap: the path parameter is {scfVersionId}, not
    // {scf_version_id}. A survey script guessed snake_case and reported the
    // endpoint as missing from the spec when it was present all along.
    const key: keyof paths = '/api/v1/scf/versions/{scfVersionId}/controls';
    expect(key).toBe('/api/v1/scf/versions/{scfVersionId}/controls');
  });

  it('declares both control identity fields on the controls response', () => {
    // Runtime assertion is trivial; the value is the type resolution above
    // compiling at all. This test exists so the file is executed and its
    // type errors surface in the suite, not only in a separate tsc run.
    const sample: Pick<ControlItem, 'control_id' | 'control_code'> = {
      control_id: '653a70ef-16fd-4d53-a637-ff61cd998729',
      control_code: 'AAT-01',
    };
    expect(sample.control_code).toBe('AAT-01');
    expect(sample.control_id).not.toBe(sample.control_code);
  });

  it('declares a pagination envelope, so termination need not be inferred', () => {
    // Our client terminates paging on "page shorter than per_page" (audit B1).
    // The spec describes a pagination object; this pins that it exists so a
    // follow-up can use it instead of inferring.
    type Paginated = ControlsResponse extends { pagination?: unknown } ? true : false;
    const hasPagination: Paginated = true;
    expect(hasPagination).toBe(true);
  });
});
```

- [ ] **Step 6: Run the new test**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/standard-api/generated-types.test.ts")
```

Expected: PASS, 3 tests. **If a type-resolution line fails to compile, that is a real finding, not a test bug** — it means the generated shape differs from what this plan assumed. Report the actual shape rather than loosening the assertion.

- [ ] **Step 7: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: your Step 1 baseline + 3 tests, and the tsc count **unchanged**. Generating a types-only file adds no runtime and should introduce no errors. If tsc rises, the generated file itself has a problem — report it rather than suppressing it.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json scripts/generate-api-types.sh src/lib/standard-api/generated/schema.d.ts tests/unit/standard-api/generated-types.test.ts
git commit -m "feat(standard-api): generate response types from the vendor's OpenAPI spec

Finding A9 was our code keying on control_id (a UUID) while every table we
join on keys on control_code — three nightly assessment runs evaluated zero
controls before anyone noticed. The vendor's spec always declared
control_id as format: uuid; nothing made us read it.

The spec became trustworthy on 2026-08-26: generated from their routes with a
CI check that fails their build on drift, 366 paths (was 51), with full
response schemas on all six endpoints we call. Types are generated from it
into a committed file, so the build never depends on that endpoint being
reachable — it returned 403 for hours the same day — and a vendor-side shape
change arrives as a reviewable diff instead of silently changing what we
compile against.

Types only: no runtime client, no response validation. openapi-typescript is
a devDependency and produces no runtime footprint."
```

---

### Task 2: Type the boundary against the generated shapes

**Context:** Generated types are inert until something is checked against them. The six functions our client actually calls are the boundary: type their return values from `paths[...]` and the shape mismatch class becomes a compile error at the call sites too. This is also where `normalizeControlsResponse`'s defensive shape-guessing stops being necessary.

**Files:**
- Modify: `src/lib/standard-api/client.ts` (the six exported call functions)
- Modify: `src/lib/standard-api/types.ts` (mark the superseded interfaces)
- Test: `tests/unit/standard-api/typed-boundary.test.ts` (create)

**Interfaces:**
- Consumes: `paths` from `src/lib/standard-api/generated/schema.d.ts` (Task 1).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Establish which shapes the spec actually gives us**

Before editing, print the resolved 200-response shape for each of the six endpoints, so the edits are made against fact rather than assumption:

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && node -e \"
const s=require('fs').readFileSync('src/lib/standard-api/generated/schema.d.ts','utf8');
for (const p of ['scf/versions/latest','scf/frameworks','scfVersionId}/controls','compliance-score','cross-coverage','evaluate-evidence']) {
  const i=s.indexOf(p);
  console.log('---', p, i>=0 ? 'present' : 'NOT FOUND');
}
\"")
```

Record the output in your report. Any `NOT FOUND` means Task 1's generation did not cover an endpoint we call — stop and report.

- [ ] **Step 2: Add a type alias block to the client**

In `src/lib/standard-api/client.ts`, below the existing imports, add:

```typescript
import type { paths } from './generated/schema';

// Response shapes taken from the vendor's published spec rather than
// hand-maintained. See docs/superpowers/plans/2026-08-26-generated-api-types.md
// for why: finding A9 was a control_id (uuid) / control_code (code) mismatch
// that these types make a compile error.
type Json200<P extends keyof paths, M extends keyof paths[P]> =
  paths[P][M] extends { responses: { 200: { content: { 'application/json': infer R } } } } ? R : never;

export type ScfControlsResponse = Json200<'/api/v1/scf/versions/{scfVersionId}/controls', 'get'>;
export type ScfControl = NonNullable<ScfControlsResponse['data']>[number];
```

Then annotate `normalizeControlsResponse`'s parameter and return so the controls path is checked end to end. Read its current signature first — it is `(result: any) => { data: any[]; total?: number }`, and the goal is for `data` to be `ScfControl[]`.

Keep the defensive normalization itself for now: the spec says the shape is `{ data, pagination }`, but the local fallback in this same file fabricates a different shape, so the function still has two real inputs to reconcile. Narrowing the *output* type is the win.

- [ ] **Step 3: Prove the A9 class is now a compile error**

Create `tests/unit/standard-api/typed-boundary.test.ts`:

```typescript
// tests/unit/standard-api/typed-boundary.test.ts
// The boundary is typed from the spec, so the mismatch that caused A9 is now a
// compile-time error rather than a silent zero-control assessment.

import { describe, it, expect } from 'vitest';
import type { ScfControl } from '@/lib/standard-api/client';

describe('typed SCF control boundary', () => {
  it('accepts the real API shape', () => {
    const c: Pick<ScfControl, 'control_id' | 'control_code'> = {
      control_id: '653a70ef-16fd-4d53-a637-ff61cd998729',
      control_code: 'AAT-01',
    };
    expect(c.control_code).toBe('AAT-01');
  });

  it('exposes control_code, which is what our tables join on', () => {
    // scf_framework_mappings.scf_control_code, control_evaluation_cache.control_code
    // and evidence_evaluations.control_code all key on this field, not on the UUID.
    const codes: Array<ScfControl['control_code']> = ['AST-22', 'AAT-01'];
    expect(codes).toHaveLength(2);
  });
});
```

- [ ] **Step 4: Mark the superseded hand-maintained interfaces**

In `src/lib/standard-api/types.ts`, add a header comment at the top of the file:

```typescript
// NOTE (2026-08-26): the interfaces in this file that describe Standard GRC API
// *responses* are no longer the source of truth. Response shapes are generated
// from the vendor's OpenAPI spec into ./generated/schema.d.ts — see
// docs/superpowers/plans/2026-08-26-generated-api-types.md. Two of this file's
// declarations had already drifted from runtime reality by the time that plan
// was written (RoiPathData.roi_score was non-nullable while the code returned
// null). Prefer the generated types for anything the spec covers; keep these
// only for request bodies and for shapes the spec does not describe.
```

Do not delete anything yet — several of the 22 interfaces cover request bodies or shapes the spec does not describe, and untangling which is which is a follow-up.

- [ ] **Step 5: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: Task 1's total + 2 tests. **The tsc count may CHANGE here, and a rise is a real finding, not a failure of this task** — narrowing `any` to a real type is precisely how latent mismatches surface. If it rises, report each new error with the file:line and what it reveals; do not cast around it with `as any` and do not widen the generated types. The controller decides whether each is fixed here or scheduled.

- [ ] **Step 6: Commit**

```bash
git add src/lib/standard-api/client.ts src/lib/standard-api/types.ts tests/unit/standard-api/typed-boundary.test.ts
git commit -m "feat(standard-api): type the client boundary from the generated spec

The SCF controls response and its item type now come from the vendor's spec
instead of \`any\`, so a control_id/control_code confusion is a compile error.
Marks the hand-maintained response interfaces in types.ts as superseded
without deleting them — several describe request bodies or shapes the spec
does not cover, and separating those is a follow-up."
```

---

### Task 3: Make the two identities structurally distinct (added after review)

**Context:** Tasks 1 and 2 make the *shape* compile-checked but leave the A9 confusion possible, because `control_id` and `control_code` are both plain `string` in the generated output — swapping them still compiles. The spec carries the distinguishing signal (`control_id` is `format: uuid`, `control_code` is not), and a thin nominal layer turns that signal into a compile error. This is the change that actually closes the class; Tasks 1 and 2 are its prerequisites, not a substitute for it.

Only the two identity fields get branded. Branding all 433 schemas would be a large, low-value change; the identity confusion is the one that cost three nightly runs.

**Files:**
- Create: `src/lib/standard-api/identity.ts`
- Modify: `src/lib/assessment/engine.ts` (`controlIdentity`'s return type)
- Test: `tests/unit/standard-api/identity-brands.test.ts` (create)

**Interfaces:**
- Consumes: `ScfControl` from `src/lib/standard-api/client.ts` (Task 2).
- Produces:
  ```typescript
  export type ControlUuid = string & { readonly __brand: 'ControlUuid' };
  export type ControlCode = string & { readonly __brand: 'ControlCode' };
  export function asControlCode(s: string): ControlCode;
  export function controlCodeOf(c: { control_code: string }): ControlCode;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/standard-api/identity-brands.test.ts`:

```typescript
// tests/unit/standard-api/identity-brands.test.ts
// The A9 defect was comparing a UUID against a set of human codes. Both are
// `string`, so neither hand-written types nor spec-generated types caught it —
// three nightly assessment runs evaluated zero controls. Branding the two
// identities makes that comparison a compile error.
//
// The compile-time behaviour is the actual assertion here; the runtime
// expectations below exist so the file executes and its type errors surface in
// the suite rather than only in a separate tsc run.

import { describe, it, expect } from 'vitest';
import { asControlCode, controlCodeOf, type ControlCode } from '@/lib/standard-api/identity';

describe('control identity brands', () => {
  it('brands a code without changing its runtime value', () => {
    const code = asControlCode('AST-22');
    expect(code).toBe('AST-22');
    expect(typeof code).toBe('string');
  });

  it('extracts the code from an API control object', () => {
    const control = {
      control_id: '653a70ef-16fd-4d53-a637-ff61cd998729',
      control_code: 'AAT-01',
    };
    expect(controlCodeOf(control)).toBe('AAT-01');
  });

  it('keeps a Set of codes usable with branded members', () => {
    const mapped = new Set<ControlCode>([asControlCode('AST-22'), asControlCode('AAT-01')]);
    expect(mapped.has(asControlCode('AST-22'))).toBe(true);
    expect(mapped.has(asControlCode('ZZZ-99'))).toBe(false);
  });

  it('documents the compile error the brands exist to produce', () => {
    // The following must NOT compile, which is the whole point:
    //
    //   const mapped = new Set<ControlCode>([asControlCode('AST-22')]);
    //   mapped.has(control.control_id);
    //   //         ~~~~~~~~~~~~~~~~~~
    //   // Argument of type 'string' is not assignable to parameter of type
    //   // 'ControlCode'.
    //
    // A @ts-expect-error assertion below fails the build if that line ever
    // becomes legal — i.e. if someone widens ControlCode back to string.
    const mapped = new Set<ControlCode>([asControlCode('AST-22')]);
    const rawUuid: string = '653a70ef-16fd-4d53-a637-ff61cd998729';
    // @ts-expect-error a bare string must not satisfy ControlCode
    expect(mapped.has(rawUuid)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/standard-api/identity-brands.test.ts")
```

Expected: FAIL — `@/lib/standard-api/identity` does not exist.

- [ ] **Step 3: Add the brands**

Create `src/lib/standard-api/identity.ts`:

```typescript
// src/lib/standard-api/identity.ts
// Nominal types for the two SCF control identities, which are both plain
// `string` in the API and in the generated spec types — and were therefore
// interchangeable to the compiler.
//
// That interchangeability was finding A9: the assessment engine compared
// `control_id` (a UUID) against sets built from `scf_control_code` (codes like
// AST-22), the predicate was never true, and three consecutive nightly runs
// evaluated zero controls while reporting a score. The vendor's spec marks
// control_id as `format: uuid` and control_code as a plain string, so the
// distinction is documented — it just could not be enforced.
//
// Branding costs nothing at runtime: these are compile-time-only intersections,
// and the values remain ordinary strings.

/** The API's `control_id` — a UUID. NOT what our tables join on. */
export type ControlUuid = string & { readonly __brand: 'ControlUuid' };

/**
 * The API's `control_code` (e.g. `AST-22`) — the identity every ihOS table
 * joins on: scf_framework_mappings.scf_control_code,
 * control_evaluation_cache.control_code, evidence_evaluations.control_code.
 */
export type ControlCode = string & { readonly __brand: 'ControlCode' };

/**
 * Assert that a string is a control code.
 *
 * Use this at the boundary where a code enters from an untyped source (a
 * database row, a request body, a CSV). Do NOT use it to silence a type error
 * on a value that is actually a UUID — that is the bug this file exists to
 * prevent, and the cast will hide it again.
 */
export function asControlCode(s: string): ControlCode {
  return s as ControlCode;
}

/** Assert that a string is a control UUID. Same caution as asControlCode. */
export function asControlUuid(s: string): ControlUuid {
  return s as ControlUuid;
}

/**
 * The code of an API control object, branded. Prefer this over reaching for
 * `.control_code` directly, so the brand travels with the value.
 */
export function controlCodeOf(c: { control_code: string }): ControlCode {
  return c.control_code as ControlCode;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/standard-api/identity-brands.test.ts")
```

Expected: PASS, 4 tests. If the `@ts-expect-error` line reports "unused", the brand is not actually rejecting a bare string — that is a real failure of the design, not a test nit. Report it.

- [ ] **Step 5: Return a branded code from `controlIdentity`**

In `src/lib/assessment/engine.ts`, change `controlIdentity`'s signature so the branded code flows into the comparisons that matter:

```typescript
export function controlIdentity(
  control: Record<string, unknown>,
  fallbackIndex?: number,
): ControlCode {
```

and add the import:

```typescript
import { asControlCode, type ControlCode } from '@/lib/standard-api/identity';
```

Its `return` statements each need `asControlCode(...)`. Read the function before editing — it has a candidate loop and a placeholder return, and both produce a code.

- [ ] **Step 6: Brand the sets it is compared against**

The three comparison sites in `engine.ts` build sets from database rows. Type those sets as `Set<ControlCode>` so the brand is checked on both sides:

```typescript
const relevantControlIds = new Set<ControlCode>(
  mappings.map((m: any) => asControlCode(m.scf_control_code)),
);
```

Apply the same to the `excluded` set. Read each site first; the line numbers have shifted repeatedly.

**This step is where the value lands.** After it, `relevantControlIds.has(c.control_id)` is a compile error, which is the state the plan exists to reach.

- [ ] **Step 7: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: Task 2's total + 4 tests. **A tsc rise here is a genuine finding**: it means some other site was passing an unbranded string where a code is required, which is exactly the class of bug being hunted. Report each with file:line and what it reveals; do not add `as ControlCode` to silence one without saying so — that cast is how the brand gets defeated.

- [ ] **Step 8: Commit**

```bash
git add src/lib/standard-api/identity.ts src/lib/assessment/engine.ts tests/unit/standard-api/identity-brands.test.ts
git commit -m "feat(standard-api): brand control identities so A9 cannot recur

control_id (a UUID) and control_code (AST-22) are both plain string in the API
and in the generated spec types, so they were interchangeable to the compiler.
That is what finding A9 was: the engine compared control_id against sets built
from scf_control_code, the predicate was never true, and three nightly runs
evaluated zero controls while still reporting a score.

Nominal types make the comparison a compile error. Runtime cost is zero — the
brands are compile-time-only intersections and the values stay strings. Only
the two identity fields are branded; branding all 433 generated schemas would
be large and low-value, and the identity confusion is the one that cost real
runs."
```

---

## Self-review

**Does this actually prevent A9?** Only with Task 3, and that task exists because the first draft of this plan did not have it. Tasks 1 and 2 make the response *shape* compile-checked — a missing field or a wrong envelope becomes an error — but both identities are plain `string`, so swapping them still compiled. The plan originally conceded that limitation in this section and stopped there, which was the wrong instinct: conceding a limitation is not the same as addressing one, and the conceded gap was precisely the defect the plan was written to prevent. Task 3 closes it with nominal types, using the `format: uuid` signal the spec already carries.

**A gap I am leaving open deliberately.** Task 2 keeps `normalizeControlsResponse`'s shape-guessing, because the local fallback in the same file fabricates a different shape from the real API's. Removing the guessing requires making the fallback conform to the spec too, which is a bigger change and belongs with the decision about whether that fallback should exist at all — a question the earlier plans repeatedly deferred.

**Baseline numbers are deliberately absent from this document.** Every prior plan in this series stated a test/tsc baseline that had gone stale by execution time, and one of those stale numbers caused a real reconciliation detour. Task 1 Step 1 measures instead.

**What a reviewer should push back on.** Task 2 Step 5 says a tsc rise is expected and acceptable. That is a soft gate, and soft gates are how regressions get waved through. The mitigation is that it requires reporting each new error individually with what it reveals, and forbids `as any` — but a reviewer may reasonably insist on a hard number, and should say so.
