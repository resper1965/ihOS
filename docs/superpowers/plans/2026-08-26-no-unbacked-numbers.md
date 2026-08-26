# No Unbacked Numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce one invariant across every place the platform emits a compliance number — *no writer of a score and no agent tool may emit a number not derived from at least one evaluated control* — so that "we don't know" stops being rendered as a confident figure.

**Architecture:** Scoped by **sink**, not by call site. The previous plan (`2026-08-25-epistemic-integrity.md`) fixed instances one at a time and grew from five tasks to seven because each review found the same disease somewhere new; its own final review named the cause: *"The plan scoped its tasks by call site — this picker, this cron, this catch block — which is why it kept growing, and why C2, I2 and I4 survived a seven-task sweep aimed squarely at them. A sink-scoped task would have converged in one pass."* This plan takes that advice. Three sinks, enumerated exhaustively by grep before writing: the two score writers, the agent-tool return shapes, and the three surviving invented constants in the Standard API fallback family.

**Tech Stack:** Next.js 16 App Router, TypeScript 5 (strict), Vitest 4.

**Spec:** No separate design doc. This implements the follow-up recommendation from the final whole-branch review recorded in `.superpowers/sdd/2026-08-25-posture-release-readiness/progress.md` and `.superpowers/sdd/2026-08-25-epistemic-integrity/progress.md`, closing findings **I2** (a 0% written from zero controls), **I4** (an honest throw re-absorbed as a fabricated zero one layer up) and **M6** (`roi_score` invented from list position, `|| 1` inventing one affected control out of zero). The governing rule is `.specify/memory/constitution.md` Principle VIII.

## Global Constraints

- **Run every `npm`/`npx`/`vitest`/`tsc` command through native WSL.** This working tree is a Windows network-mapped view of a WSL2 filesystem; the Windows shell cannot execute the Linux-native binaries. Pattern:
  ```bash
  (cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && <command>")
  ```
  The `cd /c/` matters — invoking `wsl.exe` from inside the `W:` mount makes it intermittently fail (exit 1, no output). Git commands work fine from the default shell.
- Baseline to preserve: **478 tests passing across 52 files**, and `npx tsc --noEmit` reporting **202 errors** (known pre-existing postgrest-generics backlog). A task may reduce the tsc count; never increase it.
- TypeScript strict. No new `as any`. Library tests in `tests/unit/<area>/`. Commits follow `type(scope): summary`.
- **Do not** run a live assessment, invoke a cron endpoint, POST to the Standard API, or apply a migration. Ten Standard API routes are currently `403 INSUFFICIENT SCOPE` awaiting a vendor deployment, so live verification is externally blocked regardless.

## The invariant, stated precisely

A number describing compliance may be emitted only when it derives from at least
one evaluated control. Where nothing was evaluated, the absence must be
representable and visible: `null`/omitted plus an explicit unavailable marker —
never `0`, never a plausible-looking constant.

`0` is not a safe default here. It is a *measurement* meaning "evaluated, and
nothing was compliant", which is a real and important finding. Conflating it
with "not evaluated" destroys the distinction in the pessimistic direction, and
for an LLM consumer it is worse still: a tool returning `overallScore: 0`
produces "you are 0% compliant" in an answer, where an omitted field produces
"that is unavailable".

## The three sinks, enumerated

Established by grep over `src/` before writing this plan, not assumed:

| Sink | Sites | Finding |
|---|---|---|
| Writers of a scorecard score | `src/lib/assessment/assessment-to-scorecard.ts` (`syncScorecard`), `src/app/api/cron/agentic-triggers/route.ts` | I2 |
| Agent tool return shapes | `src/lib/agents/tools/index.ts` lines ~55, ~91, ~109-110, ~123, ~199, ~229 | I4 |
| Standard API fallback constants | `src/lib/standard-api/client.ts` lines ~723 (`roi_score: 95 - idx * 4`), ~771 (`\|\| 1`) | M6 |

`client.ts:576`'s `confidence_score: 0` is deliberately **out of scope**: it ships
alongside `is_compliant: false` and an explicit `"Fallback evaluation failed"`
note, so the zero is already qualified in the same object. Listed here so its
omission is a decision on the record rather than an oversight.

---

### Task 1: A score writer must refuse to write a score it cannot back

**Context:** On 2026-08-26 an assessment ran that evaluated zero controls (finding A9, since fixed). `syncScorecard` deleted the existing rows and wrote `score: 0.0` for both frameworks plus a null-scored `all` aggregate. The dashboard then showed 0% for frameworks that had not been measured. The operator had to remove those rows by hand (`docs/sql/2026-08-26b_remove_zero_control_scorecards.sql`). The write should never have happened.

**Files:**
- Modify: `src/lib/assessment/assessment-to-scorecard.ts`
- Test: `tests/unit/assessment/scorecard-backing.test.ts` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  ```typescript
  export function isScoreBacked(fw: { totalRequired: number; implementedCount: number }): boolean
  ```
  exported from `src/lib/assessment/assessment-to-scorecard.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/assessment/scorecard-backing.test.ts`:

```typescript
// tests/unit/assessment/scorecard-backing.test.ts
// A score with nothing behind it must not be written. On 2026-08-26 an
// assessment that evaluated zero controls (finding A9) caused syncScorecard to
// delete the existing rows and write 0.0 for two frameworks, so the dashboard
// showed 0% for frameworks it had never measured. 0% is a real finding —
// "evaluated, nothing compliant" — and must stay distinguishable from
// "not evaluated".

import { describe, it, expect } from 'vitest';
import { isScoreBacked } from '@/lib/assessment/assessment-to-scorecard';

describe('isScoreBacked', () => {
  it('accepts a framework where controls were actually required and evaluated', () => {
    expect(isScoreBacked({ totalRequired: 582, implementedCount: 341 })).toBe(true);
  });

  it('accepts a genuine zero — required controls, none implemented', () => {
    // This is a measurement, not an absence. It must still be written.
    expect(isScoreBacked({ totalRequired: 582, implementedCount: 0 })).toBe(true);
  });

  it('rejects a framework where nothing was required, so nothing was measured', () => {
    expect(isScoreBacked({ totalRequired: 0, implementedCount: 0 })).toBe(false);
  });

  it('rejects the incoherent case rather than guessing which field to trust', () => {
    // totalRequired 0 with a positive implementedCount cannot both be true;
    // refusing is safer than picking one.
    expect(isScoreBacked({ totalRequired: 0, implementedCount: 5 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/assessment/scorecard-backing.test.ts")
```

Expected: FAIL — `isScoreBacked` is not exported.

- [ ] **Step 3: Add the predicate**

In `src/lib/assessment/assessment-to-scorecard.ts`, add above `export async function syncScorecard(`:

```typescript
/**
 * Whether a framework's score rests on anything.
 *
 * `totalRequired === 0` means the run evaluated no controls for this framework
 * — the engine's framework filter matched nothing, or the API scoring call
 * failed. Writing a score in that state produced the 2026-08-26 incident: an
 * assessment that evaluated zero controls deleted the existing scorecard rows
 * and wrote 0.0, so the dashboard reported 0% for frameworks it had never
 * measured, and an operator had to remove the rows by hand.
 *
 * A genuine zero — controls required, none implemented — IS backed and must
 * still be written. That is a finding, not an absence.
 */
export function isScoreBacked(fw: { totalRequired: number; implementedCount: number }): boolean {
  return fw.totalRequired > 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/assessment/scorecard-backing.test.ts")
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Skip unbacked frameworks in the per-framework loop**

In `syncScorecard`, the per-framework loop currently opens:

```typescript
  for (const fw of result.frameworkScores) {
    const code = fw.frameworkId;
```

Insert the guard immediately after `const code = fw.frameworkId;`:

```typescript
    // Nothing was evaluated for this framework, so there is no score to state.
    // Crucially this also skips the DELETE below: overwriting a real previous
    // score with an unbacked one is how the 2026-08-26 incident destroyed the
    // only figures on the dashboard.
    if (!isScoreBacked(fw)) {
      console.warn(
        `[syncScorecard] Skipping ${code}: 0 controls required, so no score is backed. Existing scorecard left untouched.`,
      );
      continue;
    }
```

Read the surrounding loop before editing to confirm the `continue` skips only this framework and that the delete-then-insert pair both sit below the guard.

- [ ] **Step 6: Skip the aggregate when no framework was backed**

Further down, the `'all'` aggregate is deleted and re-inserted unconditionally. Wrap that whole block so it only runs when at least one framework was backed. Immediately before the aggregate's `// Delete old "all" scorecard` comment, insert:

```typescript
  // The aggregate is only meaningful if at least one framework contributed a
  // backed score. Writing it from an all-unbacked run produced the null-scored
  // 'all' row the 2026-08-26 cleanup had to remove.
  const backedFrameworks = result.frameworkScores.filter(isScoreBacked);
  if (backedFrameworks.length === 0) {
    console.warn('[syncScorecard] No framework had a backed score; leaving the aggregate untouched.');
    return;
  }
```

Placing it as an early `return` also skips the Redis invalidation below, which is correct — nothing changed, so nothing should be invalidated.

- [ ] **Step 7: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: 482 tests passing (478 + 4), `202` tsc errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/assessment/assessment-to-scorecard.ts tests/unit/assessment/scorecard-backing.test.ts
git commit -m "fix(scorecard): refuse to write a score with no evaluated controls

On 2026-08-26 an assessment that evaluated zero controls (finding A9) caused
syncScorecard to delete the existing rows and write 0.0 for both frameworks,
so the dashboard reported 0% for frameworks it had never measured; an operator
had to remove the rows by hand.

A framework with totalRequired === 0 is now skipped entirely — including the
DELETE, so a real previous score is no longer destroyed by an unbacked run —
and the 'all' aggregate is skipped when no framework was backed. A genuine
zero (controls required, none implemented) is still written: that is a
finding, not an absence."
```

---

### Task 2: An agent tool must report absence as absence, not as zero

**Context:** `src/lib/agents/tools/index.ts` returns `overallScore: 0` / `coveragePercentage: 0` from its catch blocks and its no-data paths, alongside `source: 'unavailable'`. The `source` field is not what an LLM reads as the answer — the number is. So the honest throw that Task 1 of the previous plan added to `localCrossCoverage` is re-absorbed one layer up and reaches the user as "0% overlap". The same file also invents `controlsTotal: fw.total_controls || 120` and `?? 1` defaults.

**Files:**
- Modify: `src/lib/agents/tools/index.ts` (lines ~55, ~91, ~109-110, ~123, ~199, ~229)
- Test: `tests/unit/agents/unavailable-shape.test.ts` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/agents/unavailable-shape.test.ts`:

```typescript
// tests/unit/agents/unavailable-shape.test.ts
// When a tool has no data, the NUMBER is what the model reads and repeats — not
// the `source: 'unavailable'` field beside it. Returning 0 turns "we could not
// find out" into "you are 0% compliant" in the answer. The numeric fields must
// be null so the absence survives into the response.

import { describe, it, expect } from 'vitest';

// The unavailable shapes the tools return, asserted structurally. These mirror
// the objects in src/lib/agents/tools/index.ts; the point of the test is that
// no numeric field carries a fabricated value in the unavailable case.
function assertNoFabricatedNumbers(shape: Record<string, unknown>) {
  const numericFields = [
    'overallScore', 'controlsTotal', 'controlsMet', 'controlsPartial',
    'controlsNotMet', 'coveragePercentage', 'overlapPercentage',
  ];
  for (const f of numericFields) {
    if (f in shape) {
      expect(shape[f], `${f} must be null when unavailable, not a number`).toBeNull();
    }
  }
}

describe('unavailable tool results', () => {
  it('carries null, not 0, for every numeric field', () => {
    assertNoFabricatedNumbers({
      framework: 'iso27001',
      overallScore: null,
      controlsTotal: null,
      controlsMet: null,
      source: 'unavailable',
      error: 'API/DB unavailable',
    });
  });

  it('fails an object that reports zero instead of absence', () => {
    expect(() =>
      assertNoFabricatedNumbers({ overallScore: 0, source: 'unavailable' }),
    ).toThrow();
  });

  it('still permits a real measured zero when the source is not unavailable', () => {
    // A backed 0% is a finding and must remain expressible.
    const backed = { framework: 'iso27001', overallScore: 0, controlsTotal: 582, source: 'database' };
    expect(backed.overallScore).toBe(0);
    expect(backed.controlsTotal).toBe(582);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes trivially, then make it meaningful**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/agents/unavailable-shape.test.ts")
```

Expected: PASS, 3 tests — this test pins the *contract* rather than importing the tools (whose `tool()` wrappers need the AI SDK mocked). It is the specification the next step implements against. Note honestly in your report that it does not by itself prove the tools comply; Step 4's grep is what checks that.

- [ ] **Step 3: Change every unavailable return to null numerics**

In `src/lib/agents/tools/index.ts`:

At line ~55, replace `controlsTotal: fw.total_controls || 120,` with:
```typescript
            controlsTotal: fw.total_controls ?? null,
```
(`|| 120` invented a plausible control count out of a missing one; `??` also stops a real `0` being replaced.)

At the no-implemented-controls return (~line 89-96) and the outer catch return (~line 121-130), replace each `overallScore: 0,` / `controlsTotal: 0,` / `controlsMet: 0,` / `controlsPartial: 0,` / `controlsNotMet: 0,` with the same field set to `null`. Keep `source`, `lastAssessedAt` and `error` as they are.

At lines ~109-110, replace:
```typescript
          controlsTotal: result.total_required_controls ?? 1,
          controlsMet: result.scf_controls_implemented_count ?? 1,
```
with:
```typescript
          controlsTotal: result.total_required_controls ?? null,
          controlsMet: result.scf_controls_implemented_count ?? null,
```

At lines ~199 and ~229, replace `coveragePercentage: 0,` with `coveragePercentage: null,`.

Read each site before editing — several are inside object literals whose other fields must not change, and the line numbers shift as you go.

- [ ] **Step 4: Prove no fabricated numeric default survives in that file**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && grep -n 'Score: 0,\|Percentage: 0,\|controlsTotal: 0,\|controlsMet: 0,\|?? 1,\||| 120' src/lib/agents/tools/index.ts")
```

Expected: no output. Any hit is a missed site — report it rather than leaving it.

- [ ] **Step 5: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: 485 tests passing (482 after Task 1 + 3), `202` tsc errors. If a consumer of these tools fails on `null` where it expected a number, report which — the fix belongs there, not in reinstating the zero.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/tools/index.ts tests/unit/agents/unavailable-shape.test.ts
git commit -m "fix(agents): report absence as null, not as a zero the model will quote

The tools returned overallScore: 0 / coveragePercentage: 0 from their catch and
no-data paths alongside source: 'unavailable'. An LLM reads the number, not the
source field, so the honest throw added to localCrossCoverage was re-absorbed
one layer up and reached users as '0% overlap'. Also removes two invented
defaults: controlsTotal || 120 and two ?? 1 fallbacks.

A measured zero stays expressible — only the unavailable paths become null."
```

---

### Task 3: Remove the last two invented constants in the fallback family

**Context:** Two survivors of the earlier sweep, both flagged as M6 by the final whole-branch review. `localRoiPath` assigns `roi_score: 95 - idx * 4` — a prioritisation score derived from a list index, structurally the twin of the `60 + (name.length * 3) % 40` already removed from the cron. `localBlastRadius` reports `total_affected_controls: mappings?.length || 1`, inventing one affected control out of zero, and contradicting the `|| 0` used in the very next line's summary string.

**Files:**
- Modify: `src/lib/standard-api/client.ts` (lines ~723, ~771)
- Test: `tests/unit/standard-api/fallback-constants.test.ts` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/standard-api/fallback-constants.test.ts`:

```typescript
// tests/unit/standard-api/fallback-constants.test.ts
// Two invented numbers survived the 2026-08-25 sweep. A prioritisation score
// derived from a list index carries no information about the control, and
// `|| 1` reports one affected control where the data says zero — contradicting
// the `|| 0` in the summary string built from the same array.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'src/lib/standard-api/client.ts'), 'utf-8');

describe('standard-api local fallbacks carry no invented constants', () => {
  it('does not derive an ROI score from a list index', () => {
    expect(src).not.toMatch(/roi_score:\s*95\s*-\s*idx/);
  });

  it('does not invent one affected control out of zero', () => {
    expect(src).not.toMatch(/total_affected_controls:\s*mappings\?\.length\s*\|\|\s*1/);
  });

  it('still contains the grounded computations it should keep', () => {
    // Guard against the fix being a deletion of the whole fallback.
    expect(src).toContain('localRoiPath');
    expect(src).toContain('localBlastRadius');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/standard-api/fallback-constants.test.ts")
```

Expected: the first two tests FAIL — both patterns are currently present.

- [ ] **Step 3: Drop the index-derived ROI score**

In `localRoiPath`, replace:

```typescript
    const pathItems = missing.slice(0, topN).map((code: string, idx: number) => ({
      control_id: code,
      roi_score: 95 - idx * 4,
      key_mitigations: [`Implement requirement for ${code}`]
    }));
```

with:

```typescript
    // No ROI score: the local fallback has no cost, coverage or impact data to
    // derive one from, and `95 - idx * 4` derived it from the control's position
    // in an arbitrarily-ordered list — the same defect as the cron's
    // `60 + (name.length * 3) % 40`. The ordering below is still useful (these
    // are the unimplemented controls) but it is not a ranking, and must not be
    // presented as one.
    const pathItems = missing.slice(0, topN).map((code: string) => ({
      control_id: code,
      roi_score: null,
      key_mitigations: [`Implement requirement for ${code}`]
    }));
```

- [ ] **Step 4: Report zero affected controls as zero**

In `localBlastRadius`, replace:

```typescript
      total_affected_controls: mappings?.length || 1,
```

with:

```typescript
      // `|| 1` reported one affected control when the mapping read found none,
      // contradicting the `|| 0` in the summary string built from the same array.
      total_affected_controls: mappings?.length ?? 0,
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/standard-api/fallback-constants.test.ts")
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Check the `roi_score: null` change against its consumers**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && grep -rn 'roi_score\|roiScore' src/ --include=*.ts --include=*.tsx")
```

Read each hit. If a UI or route sorts or formats on `roi_score`, a `null` must not crash it — report what you find and whether a guard is needed at that consumer. Do not reinstate the invented number to protect a consumer; fix the consumer or report it.

- [ ] **Step 7: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: 488 tests passing (485 after Task 2 + 3), `202` tsc errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/standard-api/client.ts tests/unit/standard-api/fallback-constants.test.ts
git commit -m "fix(standard-api): drop the last two invented fallback constants

localRoiPath derived roi_score from the control's index in an arbitrarily
ordered list (95 - idx * 4) — structurally the same defect as the cron's
60 + (name.length * 3) % 40, removed earlier. It is now null: the local
fallback has no cost or impact data to rank with.

localBlastRadius reported total_affected_controls as `mappings?.length || 1`,
inventing one affected control out of zero and contradicting the `|| 0` in the
summary string built from the same array. Now `?? 0`."
```

---

## Self-review

**Sink coverage.** Three sinks were enumerated by grep before writing, and each has a task: score writers → Task 1; agent tool shapes → Task 2; fallback constants → Task 3. The one site deliberately excluded (`client.ts:576`'s `confidence_score: 0`, which ships with `is_compliant: false` and an explicit failure note in the same object) is named in the sink table so its exclusion is on the record.

**A gap I could not close in this plan, stated rather than hidden.** Task 1 covers `syncScorecard`, but `src/app/api/cron/agentic-triggers/route.ts` also writes scorecard snapshots. Its write is already guarded by `if (computed && computed.score !== null)` — added on 2026-08-25 — so it cannot write an unbacked score today. I did not add a second guard there because the existing one is sufficient and duplicating it would be the call-site thinking this plan exists to avoid. If that guard is ever removed, Task 1's predicate is the thing to reuse.

**Type consistency.** `isScoreBacked` is defined once (Task 1 Step 3) and used twice in the same file (Steps 5 and 6), taking `{ totalRequired, implementedCount }` — a structural subset of `FrameworkScore` from `engine.ts`, so passing a full `FrameworkScore` satisfies it. Tasks 2 and 3 add no shared symbols.

**Test-count arithmetic.** 478 baseline → 482 (T1 +4) → 485 (T2 +3) → 488 (T3 +3).

**What a reviewer should push back on.** Task 2's test pins a *contract* by asserting over hand-written object literals rather than by importing the tools, because the tools are wrapped in the AI SDK's `tool()` and importing them drags in mocks whose value this session has repeatedly found to be low. That means the test does not by itself prove the tools comply — Step 4's grep does. A reviewer may reasonably want a real import-and-invoke test instead, and should say so; the honest framing is in Step 2.

**Second thing worth pushing back on.** Task 3's test reads the source file as text and asserts on regexes. That is unusual and brittle to formatting. The justification is that both defects are *constants*, not behaviour reachable through a testable seam — `localRoiPath` and `localBlastRadius` are module-private and only reachable through a fallback path gated on an env flag and a network failure. A reviewer who prefers exporting them for direct testing has a fair point.
