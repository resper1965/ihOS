# Control Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SCF control *code* the control's identity throughout the assessment engine, so framework filtering, applicability exclusion, and the evaluation cache stop comparing UUIDs against codes and silently matching nothing.

**Architecture:** One-line-per-site change with a large blast radius. The Standard API returns each control with both `control_id` (a UUID) and `control_code` (`AAT-01`). Everything ihOS persists and joins on — `scf_framework_mappings.scf_control_code`, `control_evaluation_cache.control_code`, `evidence_evaluations.control_code` — uses the code. The engine reads `control.control_id || control.id`, so every comparison against those tables is a UUID-versus-code test that is never true. The fix is to derive identity from `control_code` first, at each of the five places it is derived, and to add one test per behaviour that was silently inert.

**Tech Stack:** Next.js 16 App Router, TypeScript 5 (strict), Vitest 4.

**Spec:** No separate design doc. This implements finding **A9** in `docs/standard-api/CONTRACT_AUDIT.md`, which carries the raw evidence (the live shapes on both sides, and the observed `total_controls = 0` on three consecutive cron runs). The governing rule is `.specify/memory/constitution.md` Principle VIII: a result computed over zero controls must not be reported as a score.

## Global Constraints

- **Run every `npm`/`npx`/`vitest`/`tsc` command through native WSL.** This repo's working tree is a Windows network-mapped view of a WSL2 filesystem; commands run from the Windows shell fail with `'vitest' is not recognized`. Pattern:
  ```bash
  (cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && <command>")
  ```
  The `cd /c/` matters — invoking `wsl.exe` from inside the `W:` mount makes it intermittently fail (exit 1, no output). Git commands work fine from the default shell.
- Node.js >= 20.9.0. TypeScript strict. No new `as any` beyond existing documented exceptions.
- Baseline to preserve: **470 tests passing across 51 files**, and `npx tsc --noEmit` reporting **201 errors** (known pre-existing postgrest-generics backlog). A task may reduce the tsc count; it must never increase it.
- Library tests in `tests/unit/<area>/`. Commit messages follow `type(scope): summary`.
- **Do not** run a live assessment, invoke a cron endpoint, apply a migration, or POST to the Standard API. End-to-end verification is blocked externally (see below) and is an operator step.

## Blocked externally — do not treat as this plan's failure

`POST /api/v1/intelligence/compliance-score` and the other nine
`/intelligence/*` + `/privacy/*` routes currently return
`403 INSUFFICIENT SCOPE` ("This route is protected but has no API key scopes
configured") — finding **A10**. So even with A9 fixed, a full assessment cannot
produce a framework score until the vendor configures those scopes. A9's fix is
still worth landing now: it is what makes control *evaluation* work, and it is
verifiable by unit test without the API.

---

### Task 1: Derive control identity from `control_code`

**Context:** Five derivations of the same wrong identity. Verified live on 2026-08-26: `scf_framework_mappings.scf_control_code` holds `AST-22`, `AST-01.4`, `END-14`; the Standard API returns `control_id: "653a70ef-16fd-4d53-a637-ff61cd998729"` and `control_code: "AAT-01"`.

What each site does today, and what it should do:

| Line | Today | Consequence |
|---|---|---|
| `engine.ts:189` | `relevantControlIds.has(c.control_id \|\| c.id)` against a set of `scf_control_code` | **Framework filter never matches → `allControls = []` → zero controls evaluated.** The primary symptom. |
| `engine.ts:225,227` | same comparison for the not-applicable exclusion | Channel applicability exclusion is silently inert — nothing is ever excluded. |
| `engine.ts:307` | `controlId = control.control_id \|\| control.id` | Becomes the identity for everything downstream. |
| `engine.ts:313` | `cacheMap.get(controlId)` where the map is keyed on `control_code` (`:278`) | **The persisted evaluation cache never hits**, so specs/001's whole caching feature is dead and every run re-evaluates from scratch. |
| `engine.ts:486,548` | `implementedControlIds.push(result.controlId)` → sent as `scf_controls_implemented` | UUIDs sent to the API where codes are expected. |
| `engine.ts:502` | `control_code: r.controlId` written into the cache | UUIDs stored in a column named for codes. |

**Files:**
- Modify: `src/lib/assessment/engine.ts` — lines 189, 225, 227, 307
- Test: `tests/unit/assessment/control-identity.test.ts` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  ```typescript
  export function controlIdentity(control: Record<string, unknown>, fallbackIndex?: number): string
  ```
  exported from `src/lib/assessment/engine.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/assessment/control-identity.test.ts`:

```typescript
// tests/unit/assessment/control-identity.test.ts
// The Standard API returns each control with BOTH a UUID (control_id) and a
// human code (control_code). Everything ihOS joins on — scf_framework_mappings,
// control_evaluation_cache, evidence_evaluations — keys on the code. Reading
// control_id therefore produced a UUID-versus-code comparison that was never
// true: framework filtering matched nothing (assessments evaluated 0 controls
// for three consecutive nightly runs), applicability exclusion was inert, and
// the evaluation cache never hit. See CONTRACT_AUDIT.md finding A9.

import { describe, it, expect } from 'vitest';
import { controlIdentity } from '@/lib/assessment/engine';

// Exactly the shape the live API returns (sampled 2026-08-26).
const apiControl = {
  control_id: '653a70ef-16fd-4d53-a637-ff61cd998729',
  control_code: 'AAT-01',
  control_title: 'Artificial Intelligence (AI) & Autonomous Technologies Governance',
  scf_version_id: '8260df81-979f-4eab-a525-26550ad95d79',
};

describe('controlIdentity', () => {
  it('prefers control_code over the control_id UUID', () => {
    expect(controlIdentity(apiControl)).toBe('AAT-01');
  });

  it('matches what scf_framework_mappings keys on', () => {
    // Real codes read from the live mapping table.
    const mapped = new Set(['AST-22', 'AST-01.4', 'END-14', 'AAT-01']);
    expect(mapped.has(controlIdentity(apiControl))).toBe(true);
  });

  it('never returns a UUID when a code is present', () => {
    const id = controlIdentity(apiControl);
    expect(id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('falls back to the local-fallback shape, which uses code-like control_id', () => {
    // tryLocalFallback fabricates controls as { control_id: "A.5.1" } — code
    // shaped, not a UUID — so control_id remains the right second choice.
    expect(controlIdentity({ control_id: 'A.5.1' })).toBe('A.5.1');
  });

  it('accepts the alternate `code` and `id` spellings', () => {
    expect(controlIdentity({ code: 'GOV-01' })).toBe('GOV-01');
    expect(controlIdentity({ id: 'GOV-02' })).toBe('GOV-02');
  });

  it('uses the indexed placeholder only when nothing identifies the control', () => {
    expect(controlIdentity({}, 7)).toBe('CTRL-7');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/assessment/control-identity.test.ts")
```

Expected: FAIL — `controlIdentity` is not exported from `engine.ts`.

- [ ] **Step 3: Add the helper**

In `src/lib/assessment/engine.ts`, add above `export async function runAssessment(`:

```typescript
/**
 * The control's identity for every join ihOS performs.
 *
 * The Standard API returns both `control_id` (a UUID) and `control_code`
 * (`AAT-01`). Everything we persist or join on keys on the CODE:
 * scf_framework_mappings.scf_control_code, control_evaluation_cache.control_code,
 * evidence_evaluations.control_code. Reading control_id first meant every one of
 * those comparisons was a UUID against a code — never true — so framework
 * filtering silently matched nothing, applicability exclusion was inert, and the
 * evaluation cache never hit (see CONTRACT_AUDIT.md A9).
 *
 * control_id stays as the second choice because the local fallback fabricates
 * controls as `{ control_id: "A.5.1" }`, which IS code-shaped.
 */
export function controlIdentity(
  control: Record<string, unknown>,
  fallbackIndex?: number,
): string {
  const candidates = [control.control_code, control.code, control.control_id, control.id];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return `CTRL-${fallbackIndex ?? 0}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/assessment/control-identity.test.ts")
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Use it at all four derivation sites**

In `src/lib/assessment/engine.ts`:

At line 189, replace:
```typescript
        allControls = allControls.filter(c => relevantControlIds.has(c.control_id || c.id));
```
with:
```typescript
        allControls = allControls.filter(c => relevantControlIds.has(controlIdentity(c)));
```

At line 225, replace:
```typescript
          .map((c) => c.control_id || c.id)
```
with:
```typescript
          .map((c) => controlIdentity(c))
```

At line 227, replace:
```typescript
        allControls = allControls.filter((c) => !excluded.has(c.control_id || c.id));
```
with:
```typescript
        allControls = allControls.filter((c) => !excluded.has(controlIdentity(c)));
```

At line 307, replace:
```typescript
      const controlId = control.control_id || control.id || `CTRL-${globalIndex}`;
```
with:
```typescript
      const controlId = controlIdentity(control, globalIndex);
```

Read each site's surrounding lines before editing — line numbers shift as you go, and site 225 sits inside a `.map()` whose callback shape must not change.

- [ ] **Step 6: Add a regression test for the filter itself**

Append to `tests/unit/assessment/control-identity.test.ts`:

```typescript
describe('framework filtering with real shapes', () => {
  // Reproduces the A9 defect at the level that actually broke: a set built
  // from mapping-table codes, tested against API-shaped control objects.
  const mappingCodes = new Set(['AAT-01', 'AST-22', 'END-14']);
  const apiControls = [
    { control_id: '653a70ef-16fd-4d53-a637-ff61cd998729', control_code: 'AAT-01' },
    { control_id: '15573f52-e1b6-4703-99b9-ca48e7130d1f', control_code: 'AST-22' },
    { control_id: '9f2b1a44-0000-4000-8000-000000000000', control_code: 'ZZZ-99' },
  ];

  it('keeps exactly the controls the framework maps to', () => {
    const kept = apiControls.filter((c) => mappingCodes.has(controlIdentity(c)));
    expect(kept.map((c) => c.control_code)).toEqual(['AAT-01', 'AST-22']);
  });

  it('would have kept nothing under the old control_id comparison', () => {
    // The regression this pins: comparing the UUID against code-keyed mappings.
    const kept = apiControls.filter((c) => mappingCodes.has(c.control_id));
    expect(kept).toHaveLength(0);
  });
});
```

- [ ] **Step 7: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: 478 tests passing (470 baseline + 8 new), `201` tsc errors. If an existing test in `tests/unit/assessment/engine.test.ts` fails, read what it asserts before touching it — it may have been pinning the UUID behaviour, in which case report it rather than editing it.

- [ ] **Step 8: Commit**

```bash
git add src/lib/assessment/engine.ts tests/unit/assessment/control-identity.test.ts
git commit -m "fix(assessment): identify controls by code, not by the API's UUID

The Standard API returns both control_id (a UUID) and control_code (AAT-01).
Everything ihOS joins on keys on the code — scf_framework_mappings,
control_evaluation_cache, evidence_evaluations — but the engine read
control_id, so every comparison was a UUID against a code and never true:

  - framework filtering matched nothing, so allControls became empty and
    assessments evaluated ZERO controls (observed on the 2026-08-24, -25 and
    -26 cron runs, all total_controls = 0)
  - channel applicability exclusion was silently inert
  - the persisted evaluation cache never hit, so specs/001's caching was dead
    and every run re-evaluated from scratch
  - UUIDs were written into columns named for codes, and sent to the API as
    scf_controls_implemented

Centralizes the derivation in controlIdentity() and uses it at all four sites.
See CONTRACT_AUDIT.md A9 for the live evidence on both shapes."
```

---

### Task 2: Operator verification (blocked on A10)

**Context:** A9's fix cannot be proven end to end until the vendor configures API-key scopes for `/intelligence/compliance-score` (finding A10). Recorded here so the plan does not end with the impression that it was verified live.

**Files:** none — verification only.

- [ ] **Step 1: Confirm the vendor unblocked the scorers**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "bash /home/resper/ihOS/.superpowers/sdd/2026-08-25-epistemic-integrity/probe-all-routes.sh")
```

Expected once fixed: the ten `403 INSUFFICIENT SCOPE` rows become 200/400 (a 400 for a malformed probe body is fine — it proves the scope gate passed).

- [ ] **Step 2: Obtain the correct organization id**

The configured `STANDARD_GRC_TENANT_ID` is not this key's organization ("This API key can only access its own organization"), and is currently commented out in BOTH `.env.local` and `.env`. `/gap/evaluate-evidence` (deep mode) and `/intelligence/council` need the real `org_`-prefixed value. Restore it in both files once known.

- [ ] **Step 3: Run one quick assessment and check the control count**

Quick mode needs the catalog plus `compliance-score`; it does not call `evaluate-evidence`, so it works before the tenant id is recovered.

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && exec npm run dev")
# then, in a second call:
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "bash /home/resper/ihOS/.superpowers/sdd/2026-08-25-epistemic-integrity/wait-and-run.sh")
```

**Assert `totalControls` is in the hundreds, not 0.** For `iso27001` the mapping table holds 5,441 rows covering 582 distinct SCF controls, so a correct run evaluates on that order. A `totalControls: 0` means A9 is not actually fixed — do not accept a scorecard written from it.

- [ ] **Step 4: Only then let it write a scorecard**

If Step 3 returns 0, delete any scorecard rows it created (`docs/sql/2026-08-26b_remove_zero_control_scorecards.sql` is scoped to exactly that case and is idempotent) before investigating. A 0% written from zero controls is a fabricated claim, which is what this whole line of work exists to remove.
