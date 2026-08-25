# Epistemic Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the platform from asserting compliance facts it does not have — remove fabricated framework mappings and fabricated fallback numbers, make estimation explicitly opt-in on automated paths, and leave behind an automated check that would have caught the fabrication.

**Architecture:** Five independent defects share one root cause: a claim gets manufactured somewhere (a hardcoded constant, a cloned data row, an implicit env flag, an unguarded partial read) and nothing downstream can tell it apart from a real one. Each task closes one of those, and Task 3 builds the detector first so Task 4 can *prove* its cleanup worked instead of asserting it. No new subsystem; every change is either a deletion, a guard, or a test.

**Tech Stack:** Next.js 16 App Router, TypeScript 5 (strict), Vitest 4, Supabase (Postgres + CLI), npm.

**Spec:** This plan has no separate design doc. It implements findings recorded during the 2026-08-25 session, whose evidence lives in `.superpowers/sdd/2026-08-25-posture-release-readiness/progress.md` (sections: "CRITICAL: 5 of the 7 framework mappings are locally fabricated", "Cross-framework gap analysis", "Task 3 — partially executed", and the `IS_CRON` finding). Read that ledger alongside this plan — it carries the raw measurements each task argues from. The governing principle each task defends is Constitution Principle VIII (`.specify/memory/constitution.md`): never silently estimate or fabricate a compliance evaluation.

## Global Constraints

- **Run every `npm`/`npx`/`vitest`/`tsc`/`supabase` command through native WSL.** This repo's working tree (`W:\home\resper\ihOS`) is a Windows network-mapped view of a WSL2 Ubuntu filesystem. Commands run from the Windows shell fail with `'vitest' is not recognized` even when dependencies are installed. Working pattern:
  ```bash
  (cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && <command>")
  ```
  The `cd /c/` matters — invoking `wsl.exe` from inside the `W:` mount makes it intermittently fail (exit 1, no output). Git commands work fine from the default shell.
- Node.js >= 20.9.0 (`package.json` engines).
- TypeScript strict mode. Do not introduce new `as any` unless matching an existing documented exception.
- `tests/setup.ts` **mocks the entire `@/lib/standard-api/client` module.** Any test of that module's real behavior must pull it via `vi.importActual`, following the established pattern at `tests/unit/standard-api/fallback.test.ts:14-19`.
- Route-level tests live in `tests/api/`; library tests in `tests/unit/<area>/`.
- Migrations are named `YYYYMMDDNNNNNN_name.sql`, wrapped in `BEGIN; … COMMIT;`, and **must be idempotent** (`IF NOT EXISTS`, `DO $$ … END $$` policy guards) — see `supabase/migrations/20260707000002_customer_assessments.sql` as the reference shape.
- `supabase db push` and `db pull` currently **refuse to run** against the linked project (pre-existing migration-history ledger mismatch, dozens of unregistered IDs). Migrations in this plan are therefore written to be applied **manually via the Supabase SQL Editor**, and every one must be safe to run twice. Do not attempt to repair the ledger as part of this plan.
- Baseline to preserve: **45 test files / 437 tests passing**, and `npx tsc --noEmit` reporting **202 errors** (a known pre-existing postgrest-generics issue). A task may reduce the tsc count; it must never increase it, and must never reduce the test count.
- Commit messages follow `type(scope): summary`.
- `scf_framework_mappings` columns are exactly: `id bigint` (identity), `framework_code varchar NOT NULL`, `target_control_id varchar NOT NULL`, `scf_control_code varchar NOT NULL`, `synced_at timestamptz NULL DEFAULT now()`.

## Out of scope

- **Acquiring the real crosswalk data.** Task 4 quarantines the fabricated rows and Task 3 gives you the tool to verify a future load, but this plan cannot contain crosswalk content it does not have. Loading real mappings is an operator action with an acceptance test defined in Task 5, Step 6.
- **Repairing the migration-history ledger** (dozens of unregistered migration IDs). Real, separately scoped, blocks `db push`/`db pull` — worked around here, not fixed.
- **The 202 pre-existing `tsc` errors** (structural postgrest `RejectExcessProperties`/`SelectQueryError` generics). Its own task.
- **The SCRMS/vendor feature's missing spec and tests** (branch `posture-release-readiness`). Its own spec + review cycle.
- **Excluding estimated verdicts from scores, or blocking scorecard sync when estimates exist.** Business decisions deliberately left open; commit `3aebd11` already made estimated runs *visible*, which is the prerequisite for deciding either.

---

### Task 1: Stop `localCrossCoverage` fabricating a 50% overlap on error

**Context:** `localCrossCoverage`'s `catch` block returns `overlap_percentage: 50, coverage_percentage: 50` — a literal invented number presented as a coverage analysis. This is the same defect class as the `createMockThreatModel()` that `specs/001-analysis-flow-caching` T030 deleted for exactly this reason. The caller (`src/lib/agents/tools/index.ts:223`) already has a `catch` that degrades gracefully, so throwing is safe and is what every other fail-closed path in this client does.

**Files:**
- Modify: `src/lib/standard-api/client.ts:673-683` (the `catch` block of `localCrossCoverage`)
- Test: `tests/unit/standard-api/cross-coverage-fallback.test.ts` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/standard-api/cross-coverage-fallback.test.ts`:

```typescript
// tests/unit/standard-api/cross-coverage-fallback.test.ts
// localCrossCoverage must never invent an overlap number. When the mapping
// query fails there is no grounded answer, so it must throw and let the
// caller report a gap (Constitution Principle VIII).
//
// tests/setup.ts mocks the whole standard-api client module, so the real
// implementation is pulled via importActual — same pattern as fallback.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        in: async () => {
          throw new Error("relation \"scf_framework_mappings\" does not exist");
        },
      }),
    }),
  })),
}));

async function realCrossCoverage() {
  const actual = await vi.importActual<typeof import("@/lib/standard-api/client")>(
    "@/lib/standard-api/client",
  );
  return actual.crossCoverage;
}

describe("localCrossCoverage — never fabricates an overlap", () => {
  beforeEach(() => {
    process.env.GRC_LOCAL_FALLBACK_ENABLED = "true";
    delete process.env.GRC_FALLBACK_DISABLED;
  });

  it("throws instead of returning a made-up 50% when the mapping query fails", async () => {
    const crossCoverage = await realCrossCoverage();
    await expect(
      crossCoverage({ source_framework: "iso27001", target_framework: "soc2" }),
    ).rejects.toThrow();
  });

  it("never resolves to a 50/50 coverage shape", async () => {
    const crossCoverage = await realCrossCoverage();
    const result = await crossCoverage({
      source_framework: "iso27001",
      target_framework: "soc2",
    }).catch(() => null);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/standard-api/cross-coverage-fallback.test.ts")
```

Expected: FAIL — both tests fail because the current `catch` resolves with `{ overlap_percentage: 50, ... }` instead of throwing.

- [ ] **Step 3: Replace the fabricating catch block**

In `src/lib/standard-api/client.ts`, find the `catch` at the end of `localCrossCoverage`:

```typescript
  } catch (err) {
    console.error("[GRC Fallback] Local cross coverage failed:", err);
    return {
      source_framework: request.source_framework,
      target_framework: request.target_framework,
      overlap_percentage: 50,
      coverage_percentage: 50,
      mapped_controls: [],
      gaps: []
    };
  }
```

Replace with:

```typescript
  } catch (err) {
    // No grounded answer exists when the mapping read fails, and a coverage
    // analysis is exactly the kind of claim that must never be invented
    // (Constitution Principle VIII — same reason createMockThreatModel was
    // deleted in specs/001 T030). Throw so the caller reports a gap; the
    // agent tool at src/lib/agents/tools/index.ts already handles this.
    console.error("[GRC Fallback] Local cross coverage failed:", err);
    throw err instanceof Error
      ? err
      : new Error("Local cross-coverage failed and no grounded result is available");
  }
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/standard-api/cross-coverage-fallback.test.ts")
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: 439 tests passing (437 baseline + 2 new), 45→46 test files, and `202` tsc errors (unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/lib/standard-api/client.ts tests/unit/standard-api/cross-coverage-fallback.test.ts
git commit -m "fix(standard-api): throw instead of fabricating a 50% cross-coverage

localCrossCoverage's catch block returned a hardcoded overlap_percentage: 50
— an invented number presented as a coverage analysis, the same defect class
as the createMockThreatModel() specs/001 T030 deleted. The caller already
degrades gracefully on a throw, so there is no reason to manufacture one."
```

---

### Task 2: Make cron-path estimation an explicit opt-in instead of a side effect of `IS_CRON`

**Context:** `isLocalFallbackEnabled()` returns `true` whenever `process.env.IS_CRON === 'true'`, which silently bypasses the fail-closed default — estimation turns on for automated runs even with `GRC_LOCAL_FALLBACK_ENABLED` unset. That branch has **zero test coverage** (`grep -rn IS_CRON tests/` returns nothing) despite being the one branch that disables the platform's central honesty guarantee. Until commit `4a4d6f8`, `IS_CRON` was also never unset, so the bypass leaked into ordinary user requests in warm serverless instances.

This task does not remove cron resilience — it makes it *nameable and auditable*: a dedicated `GRC_CRON_FALLBACK_ENABLED` flag, defaulting to off, so "our automated runs may estimate" becomes a deliberate, greppable configuration choice rather than an invisible consequence of an unrelated flag.

**Files:**
- Modify: `src/lib/standard-api/client.ts:412-416` (`isLocalFallbackEnabled`)
- Modify: `README.md` (env var documentation, after the `GRC_LOCAL_FALLBACK_ENABLED` block around line 100-105)
- Test: `tests/unit/standard-api/fallback.test.ts` (extend existing)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `GRC_CRON_FALLBACK_ENABLED` env var, referenced by Task 7's ops checklist.

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe` block in `tests/unit/standard-api/fallback.test.ts`, immediately before its closing `});`:

```typescript
  it("IS_CRON alone does NOT enable estimation — cron resilience is its own opt-in", async () => {
    process.env.IS_CRON = "true";
    const isEnabled = await realIsLocalFallbackEnabled();
    expect(isEnabled()).toBe(false);
    delete process.env.IS_CRON;
  });

  it("enables estimation on cron runs only when GRC_CRON_FALLBACK_ENABLED=true", async () => {
    process.env.IS_CRON = "true";
    process.env.GRC_CRON_FALLBACK_ENABLED = "true";
    const isEnabled = await realIsLocalFallbackEnabled();
    expect(isEnabled()).toBe(true);
    delete process.env.IS_CRON;
    delete process.env.GRC_CRON_FALLBACK_ENABLED;
  });

  it("GRC_CRON_FALLBACK_ENABLED does nothing outside a cron run", async () => {
    process.env.GRC_CRON_FALLBACK_ENABLED = "true";
    const isEnabled = await realIsLocalFallbackEnabled();
    expect(isEnabled()).toBe(false);
    delete process.env.GRC_CRON_FALLBACK_ENABLED;
  });

  it("the legacy kill switch still overrides cron estimation", async () => {
    process.env.IS_CRON = "true";
    process.env.GRC_CRON_FALLBACK_ENABLED = "true";
    process.env.GRC_FALLBACK_DISABLED = "true";
    const isEnabled = await realIsLocalFallbackEnabled();
    expect(isEnabled()).toBe(false);
    delete process.env.IS_CRON;
    delete process.env.GRC_CRON_FALLBACK_ENABLED;
  });
```

Also extend that file's `beforeEach` so the new vars never leak between tests. Change:

```typescript
  beforeEach(() => {
    delete process.env.GRC_FALLBACK_DISABLED;
    delete process.env.GRC_LOCAL_FALLBACK_ENABLED;
  });
```

to:

```typescript
  beforeEach(() => {
    delete process.env.GRC_FALLBACK_DISABLED;
    delete process.env.GRC_LOCAL_FALLBACK_ENABLED;
    delete process.env.GRC_CRON_FALLBACK_ENABLED;
    delete process.env.IS_CRON;
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/standard-api/fallback.test.ts")
```

Expected: the first new test ("IS_CRON alone does NOT enable estimation") FAILS — it currently returns `true`. The `GRC_CRON_FALLBACK_ENABLED` tests also fail (the var is not read yet).

- [ ] **Step 3: Implement the explicit flag**

In `src/lib/standard-api/client.ts`, replace:

```typescript
export function isLocalFallbackEnabled(): boolean {
  if (process.env.GRC_FALLBACK_DISABLED === "true") return false;
  if (process.env.IS_CRON === "true") return true; // Force resilience in automated background runs
  return process.env.GRC_LOCAL_FALLBACK_ENABLED === "true";
}
```

with:

```typescript
export function isLocalFallbackEnabled(): boolean {
  if (process.env.GRC_FALLBACK_DISABLED === "true") return false;
  // Automated runs may prefer degraded-but-flagged results over an empty
  // sweep, but that is a deliberate posture, not a side effect of being a
  // cron. IS_CRON alone must NOT enable estimation: it is set for unrelated
  // reasons (RLS client selection, cookie handling) and until commit 4a4d6f8
  // was never unset, so piggybacking on it silently disabled the fail-closed
  // default for ordinary requests in warm instances too.
  if (process.env.IS_CRON === "true") {
    return process.env.GRC_CRON_FALLBACK_ENABLED === "true";
  }
  return process.env.GRC_LOCAL_FALLBACK_ENABLED === "true";
}
```

Also update that function's docblock (directly above it): replace the sentence
`The legacy \`GRC_FALLBACK_DISABLED=true\` kill switch is still honored as a hard-off.`
with:

```
 * `GRC_CRON_FALLBACK_ENABLED=true` is the equivalent opt-in for automated
 * (IS_CRON) runs — being a cron is not by itself consent to estimate. The
 * legacy `GRC_FALLBACK_DISABLED=true` kill switch is still honored as a
 * hard-off over both.
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/standard-api/fallback.test.ts")
```

Expected: PASS, 7 tests (3 existing + 4 new).

- [ ] **Step 5: Document the new flag**

In `README.md`, find the `GRC_LOCAL_FALLBACK_ENABLED=false` line and its comment block, and append immediately after it:

```bash
# Automated (cron) runs are NOT implicitly allowed to estimate. Being a cron is
# not consent: set this to "true" only if you want scheduled sweeps to produce
# degraded, non-authoritative results (each flagged is_estimated=true and shown
# with an "estimated verdicts — needs review" badge on the dashboard) rather
# than reporting a gap. Keep unset in prod unless that tradeoff is deliberate.
GRC_CRON_FALLBACK_ENABLED=false
```

- [ ] **Step 6: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: 443 tests passing (439 after Task 1 + 4 new), `202` tsc errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/standard-api/client.ts tests/unit/standard-api/fallback.test.ts README.md
git commit -m "fix(standard-api): require explicit opt-in for cron-path estimation

isLocalFallbackEnabled() returned true whenever IS_CRON was set, silently
bypassing the fail-closed default — and that branch had zero test coverage
despite being the one that disables the platform's central honesty
guarantee. IS_CRON is set for unrelated reasons (RLS client selection,
cookie handling) and until 4a4d6f8 was never unset, so the bypass leaked
into ordinary requests in warm instances.

Cron resilience is preserved but must now be named: GRC_CRON_FALLBACK_ENABLED."
```

---

### Task 3: Build a clone detector for framework mappings

**Context:** The fabricated mappings went unnoticed for two months because nothing could distinguish a real crosswalk from a cloned one. Measured evidence: `iso27001`, `HI-2013`, `nist_800_53`, `soc2` all map to a byte-identical set of 582 SCF controls, and `soc2`'s `target_control_id` values are `iso27001`'s with `SOC2-` prefixed (0 ids differ after stripping the prefix). Two genuinely different standards never produce byte-identical SCF sets, so that alone is a reliable signal.

This task lands the detector **before** the cleanup, so Task 4 can prove its quarantine worked rather than assert it. The logic is a pure function so it is testable without a database; a thin script wires it to the live DB.

**Files:**
- Create: `src/lib/assessment/mapping-integrity.ts`
- Create: `src/scripts/check-mapping-integrity.ts`
- Modify: `package.json` (add the `check:mappings` script)
- Test: `tests/unit/assessment/mapping-integrity.test.ts` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces — Task 4 Step 5 runs the script, and Task 5 Step 6 uses it as the acceptance test for a real crosswalk load:
  ```typescript
  export interface MappingRow { framework_code: string; target_control_id: string; scf_control_code: string; }
  export interface CloneFinding {
    suspect: string;
    mirrors: string;
    sharedScfControls: number;
    strippedPrefix: string | null;
    targetIdsIdenticalAfterStrip: boolean;
  }
  export function detectClonedMappings(rows: MappingRow[]): CloneFinding[]
  ```
  Plus npm script `check:mappings`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/assessment/mapping-integrity.test.ts`:

```typescript
// tests/unit/assessment/mapping-integrity.test.ts
// Two genuinely different standards never map to a byte-identical set of SCF
// controls. detectClonedMappings exists because 5 of 7 framework mappings in
// this project turned out to be prefix-renamed clones of the two real ones,
// undetected for two months.

import { describe, it, expect } from "vitest";
import { detectClonedMappings, type MappingRow } from "@/lib/assessment/mapping-integrity";

// iso27001 is the real mapping; soc2 is it with "SOC2-" glued on.
const clonedPair: MappingRow[] = [
  { framework_code: "iso27001", target_control_id: "5.1", scf_control_code: "GOV-01" },
  { framework_code: "iso27001", target_control_id: "5.2", scf_control_code: "GOV-02" },
  { framework_code: "soc2", target_control_id: "SOC2-5.1", scf_control_code: "GOV-01" },
  { framework_code: "soc2", target_control_id: "SOC2-5.2", scf_control_code: "GOV-02" },
];

const genuinelyDifferent: MappingRow[] = [
  { framework_code: "iso27001", target_control_id: "5.1", scf_control_code: "GOV-01" },
  { framework_code: "iso27001", target_control_id: "5.2", scf_control_code: "GOV-02" },
  { framework_code: "soc2", target_control_id: "CC6.1", scf_control_code: "IAC-01" },
  { framework_code: "soc2", target_control_id: "CC6.2", scf_control_code: "GOV-01" },
];

describe("detectClonedMappings", () => {
  it("flags a prefix-renamed clone and names the prefix", () => {
    const findings = detectClonedMappings(clonedPair);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      sharedScfControls: 2,
      strippedPrefix: "SOC2-",
      targetIdsIdenticalAfterStrip: true,
    });
    // Either ordering of the pair is acceptable; both codes must appear.
    expect([findings[0].suspect, findings[0].mirrors].sort()).toEqual(["iso27001", "soc2"]);
  });

  it("does not flag frameworks with genuinely different control sets", () => {
    expect(detectClonedMappings(genuinelyDifferent)).toEqual([]);
  });

  it("flags an identical SCF set even when target ids are not a simple prefix variant", () => {
    const rows: MappingRow[] = [
      { framework_code: "a", target_control_id: "A.1", scf_control_code: "GOV-01" },
      { framework_code: "b", target_control_id: "totally-different", scf_control_code: "GOV-01" },
    ];
    const findings = detectClonedMappings(rows);
    expect(findings).toHaveLength(1);
    expect(findings[0].targetIdsIdenticalAfterStrip).toBe(false);
    expect(findings[0].strippedPrefix).toBeNull();
  });

  it("returns nothing for a single framework, or for no rows", () => {
    expect(detectClonedMappings([clonedPair[0]])).toEqual([]);
    expect(detectClonedMappings([])).toEqual([]);
  });

  it("reports each colliding pair once, not twice", () => {
    // Three frameworks sharing one SCF set => 3 pairs (a-b, a-c, b-c).
    const rows: MappingRow[] = [
      { framework_code: "a", target_control_id: "1", scf_control_code: "GOV-01" },
      { framework_code: "b", target_control_id: "B-1", scf_control_code: "GOV-01" },
      { framework_code: "c", target_control_id: "C-1", scf_control_code: "GOV-01" },
    ];
    expect(detectClonedMappings(rows)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/assessment/mapping-integrity.test.ts")
```

Expected: FAIL — `Cannot find module '@/lib/assessment/mapping-integrity'`.

- [ ] **Step 3: Implement the detector**

Create `src/lib/assessment/mapping-integrity.ts`:

```typescript
// src/lib/assessment/mapping-integrity.ts
// Detects fabricated framework crosswalks in scf_framework_mappings.
//
// Why this exists: on 2026-08-25 an audit found 5 of 7 framework mappings were
// prefix-renamed clones of the two real ones (soc2/nist_800_53/HI-2013 cloned
// from iso27001; EU-GDPR/BR-LGPD from iso27701). They had been serving
// "gap analysis" results for two months. The signal that catches it: two
// genuinely different standards never map to a byte-identical set of SCF
// controls — SOC 2 has ~60 criteria, NIST 800-53 has ~1000 controls, and
// neither can share ISO 27001's exact 582.

export interface MappingRow {
  framework_code: string;
  target_control_id: string;
  scf_control_code: string;
}

export interface CloneFinding {
  suspect: string;
  mirrors: string;
  /** Size of the SCF control set the two frameworks share identically. */
  sharedScfControls: number;
  /** The prefix that turns one framework's target ids into the other's, if any. */
  strippedPrefix: string | null;
  /** True when stripping that prefix makes the target-id sets identical too. */
  targetIdsIdenticalAfterStrip: boolean;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Finds the prefix that maps `longer` onto `shorter` (e.g. "SOC2-5.1" over
 * "5.1" yields "SOC2-"), or null when the ids are not a uniform prefix variant.
 */
function findUniformPrefix(a: Set<string>, b: Set<string>): string | null {
  if (a.size !== b.size || a.size === 0) return null;
  const [longer, shorter] = [...a][0].length >= [...b][0].length ? [a, b] : [b, a];
  const sampleLong = [...longer].sort()[0];
  for (const candidate of shorter) {
    if (!sampleLong.endsWith(candidate)) continue;
    const prefix = sampleLong.slice(0, sampleLong.length - candidate.length);
    if (prefix === "") continue;
    const stripped = new Set([...longer].map((id) => (id.startsWith(prefix) ? id.slice(prefix.length) : id)));
    if (setsEqual(stripped, shorter)) return prefix;
  }
  return null;
}

export function detectClonedMappings(rows: MappingRow[]): CloneFinding[] {
  const scfByFramework = new Map<string, Set<string>>();
  const targetsByFramework = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!scfByFramework.has(row.framework_code)) {
      scfByFramework.set(row.framework_code, new Set());
      targetsByFramework.set(row.framework_code, new Set());
    }
    scfByFramework.get(row.framework_code)!.add(row.scf_control_code);
    targetsByFramework.get(row.framework_code)!.add(row.target_control_id);
  }

  const codes = [...scfByFramework.keys()].sort();
  const findings: CloneFinding[] = [];

  // Each unordered pair once.
  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const a = codes[i];
      const b = codes[j];
      const scfA = scfByFramework.get(a)!;
      const scfB = scfByFramework.get(b)!;
      if (!setsEqual(scfA, scfB)) continue;

      const prefix = findUniformPrefix(targetsByFramework.get(a)!, targetsByFramework.get(b)!);
      findings.push({
        suspect: b,
        mirrors: a,
        sharedScfControls: scfA.size,
        strippedPrefix: prefix,
        targetIdsIdenticalAfterStrip: prefix !== null,
      });
    }
  }

  return findings;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/assessment/mapping-integrity.test.ts")
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Wire it to the live database**

Create `src/scripts/check-mapping-integrity.ts`:

```typescript
// src/scripts/check-mapping-integrity.ts
// Runs the clone detector against the live scf_framework_mappings table.
// Exits 1 when any framework pair shares a byte-identical SCF control set,
// so this can gate a crosswalk load (see the epistemic-integrity plan, Task 5).
//
// Usage: npm run check:mappings

import { createAdminClient } from "@/lib/supabase/admin";
import { detectClonedMappings, type MappingRow } from "@/lib/assessment/mapping-integrity";

const PAGE = 1000;

async function main() {
  const admin = createAdminClient();
  const rows: MappingRow[] = [];

  // PostgREST caps a single response, so page until a short page.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("scf_framework_mappings")
      .select("framework_code, target_control_id, scf_control_code")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[check:mappings] read failed: ${error.message}`);
      process.exit(2);
    }
    const page = (data ?? []) as MappingRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const frameworks = new Set(rows.map((r) => r.framework_code));
  console.log(`[check:mappings] ${rows.length} rows across ${frameworks.size} frameworks`);

  const findings = detectClonedMappings(rows);
  if (findings.length === 0) {
    console.log("[check:mappings] OK — no two frameworks share an identical SCF control set");
    return;
  }

  console.error(`[check:mappings] ${findings.length} suspected fabricated mapping(s):`);
  for (const f of findings) {
    const how = f.targetIdsIdenticalAfterStrip
      ? `target ids are "${f.mirrors}" with "${f.strippedPrefix}" prefixed`
      : "target ids differ, but the SCF control set is byte-identical";
    console.error(`  - ${f.suspect} mirrors ${f.mirrors}: ${f.sharedScfControls} shared SCF controls; ${how}`);
  }
  console.error(
    "[check:mappings] Two different standards cannot map to an identical SCF set. " +
      "Treat these as fabricated until a real crosswalk is loaded.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[check:mappings] unexpected failure:", err);
  process.exit(2);
});
```

In `package.json`, add to `"scripts"` immediately after the `"backfill:posture"` line:

```json
    "check:mappings": "tsx src/scripts/check-mapping-integrity.ts"
```

(Remember to add a comma to the end of the preceding `"backfill:posture"` line.)

- [ ] **Step 6: Run it against the live database to confirm it catches the known fabrication**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npm run check:mappings")
```

Expected: exit code 1, and output naming the known clones — pairs among `iso27001`/`soc2`/`nist_800_53`/`HI-2013` (582 shared controls) and among `iso27701`/`EU-GDPR`/`BR-LGPD` (390 shared). If it reports "OK", the detector is wrong — stop and report, do not proceed to Task 4.

- [ ] **Step 7: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: 448 tests passing (443 after Task 2 + 5 new), and `202` tsc errors or fewer.

- [ ] **Step 8: Commit**

```bash
git add src/lib/assessment/mapping-integrity.ts src/scripts/check-mapping-integrity.ts package.json tests/unit/assessment/mapping-integrity.test.ts
git commit -m "feat(mappings): detect fabricated framework crosswalks

5 of 7 framework mappings turned out to be prefix-renamed clones of the two
real ones, serving gap analysis for two months undetected, because nothing
could tell a real crosswalk from a cloned one. Two genuinely different
standards never map to a byte-identical SCF control set — that is the signal.

Pure detector + a script that gates on it (npm run check:mappings)."
```

---

### Task 4: Quarantine the fabricated framework mappings

**Context:** With the detector in place, remove the fabricated data. Quarantine rather than delete: the rows are evidence of how the fabrication happened, and moving them is reversible where `DELETE` is not. The five fabricated codes are `soc2`, `nist_800_53`, `HI-2013` (clones of `iso27001`) and `EU-GDPR`, `BR-LGPD` (clones of `iso27701`). `iso27001` and `iso27701` are the only two with plausible real provenance (synced 2026-06-05, before the cloning events of 06-23 and 07-16) and are **kept**.

They must also leave the UI: all five are currently selectable in the Run Assessment picker with authoritative-looking names and flags, so their presence alone means the platform answers questions about standards it has no data for.

**Files:**
- Create: `supabase/migrations/20260825000002_quarantine_fabricated_mappings.sql`
- Modify: `src/lib/assessment/framework-registry.ts:14-24` (`FRAMEWORK_REGISTRY`) and `:51-57` (`DEFAULT_FRAMEWORKS`)
- Test: `tests/unit/assessment/framework-registry.test.ts` (create)

**Interfaces:**
- Consumes: `npm run check:mappings` from Task 3.
- Produces: `FRAMEWORK_REGISTRY` and `DEFAULT_FRAMEWORKS` containing only `iso27001` and `iso27701` among the mapping-backed frameworks; table `scf_framework_mappings_quarantine`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/assessment/framework-registry.test.ts`:

```typescript
// tests/unit/assessment/framework-registry.test.ts
// A framework must not be offerable until a real crosswalk backs it. On
// 2026-08-25, soc2/nist_800_53/HI-2013/EU-GDPR/BR-LGPD were found to be
// prefix-renamed clones of iso27001/iso27701 — offering them meant answering
// questions about standards with zero real mapping data. This test is the
// guard against silently re-adding one.

import { describe, it, expect } from "vitest";
import {
  FRAMEWORK_REGISTRY,
  DEFAULT_FRAMEWORKS,
  resolveFrameworkName,
} from "@/lib/assessment/framework-registry";

const FABRICATED = ["soc2", "nist_800_53", "HI-2013", "EU-GDPR", "BR-LGPD"];

describe("framework registry — no framework without a real crosswalk", () => {
  it("does not offer any of the frameworks whose mappings were fabricated", () => {
    const offered = FRAMEWORK_REGISTRY.map((f) => f.id);
    for (const code of FABRICATED) {
      expect(offered).not.toContain(code);
    }
  });

  it("does not default-select any fabricated framework in the assessment modal", () => {
    const defaults = DEFAULT_FRAMEWORKS.map((f) => f.id);
    for (const code of FABRICATED) {
      expect(defaults).not.toContain(code);
    }
  });

  it("still offers the two frameworks with real mappings", () => {
    const offered = FRAMEWORK_REGISTRY.map((f) => f.id);
    expect(offered).toContain("iso27001");
    expect(offered).toContain("iso27701");
  });

  it("still resolves display names for quarantined codes so historical records render", () => {
    // Existing assessments/snapshots reference these codes; they must not
    // render as a raw slug just because the framework is no longer offered.
    expect(resolveFrameworkName("soc2")).toBe("SOC 2 Type II");
    expect(resolveFrameworkName("BR-LGPD")).toBe("LGPD");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/assessment/framework-registry.test.ts")
```

Expected: the first three tests FAIL (all five codes are currently present); the fourth PASSES already.

- [ ] **Step 3: Split the registry into offered vs. name-only**

The fourth test constrains the design: names must still resolve for historical records, but the framework must not be *offered*. In `src/lib/assessment/framework-registry.ts`, replace the `FRAMEWORK_REGISTRY` array (currently lines 14-24) with:

```typescript
// Frameworks the product offers. A framework belongs here ONLY when a real
// crosswalk backs it in scf_framework_mappings. On 2026-08-25 an audit found
// soc2/nist_800_53/HI-2013/EU-GDPR/BR-LGPD were prefix-renamed clones of the
// two ISO mappings (see docs/superpowers/plans/2026-08-25-epistemic-integrity.md);
// they are quarantined below until real mappings are loaded. Re-adding one
// without loading its crosswalk is a regression guarded by
// tests/unit/assessment/framework-registry.test.ts.
export const FRAMEWORK_REGISTRY: FrameworkInfo[] = [
  { id: 'iso27001', name: 'ISO/IEC 27001:2022', icon: '🔒' },
  { id: 'iso27701', name: 'ISO/IEC 27701:2019', icon: '🛡️' },
  { id: 'fedramp', name: 'FedRAMP', icon: '🇺🇸' },
  { id: 'IEC-62304', name: 'IEC 62304', icon: '⚕️' },
  { id: 'TX-LEVEL-2', name: 'TX-RAMP Level 2', icon: '⭐', aliases: ['txramp'] },
];

// Quarantined: NOT offered, but their display names must still resolve so
// existing assessments, scorecards and reports that reference these codes
// render a real name instead of a raw slug.
export const QUARANTINED_FRAMEWORKS: FrameworkInfo[] = [
  { id: 'BR-LGPD', name: 'LGPD', icon: '🇧🇷', aliases: ['lgpd'] },
  { id: 'HI-2013', name: 'HIPAA', icon: '🏥', aliases: ['hipaa'] },
  { id: 'EU-GDPR', name: 'EU GDPR', icon: '🇪🇺', aliases: ['gdpr'] },
  { id: 'soc2', name: 'SOC 2 Type II', icon: '📋', aliases: ['soc-2'] },
  { id: 'nist_800_53', name: 'NIST SP 800-53', icon: '🏛️', aliases: ['NIST-800-53'] },
];
```

Then change the lookup-map builder (currently `for (const fw of FRAMEWORK_REGISTRY) {`) to walk both lists, so names keep resolving:

```typescript
for (const fw of [...FRAMEWORK_REGISTRY, ...QUARANTINED_FRAMEWORKS]) {
```

And replace `DEFAULT_FRAMEWORKS` (currently lines 50-57) with:

```typescript
/** Frameworks pre-selected in the Run Assessment modal — offered ones only. */
export const DEFAULT_FRAMEWORKS = [
  { id: 'iso27001', name: 'ISO/IEC 27001:2022' },
  { id: 'iso27701', name: 'ISO/IEC 27701:2019' },
];
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/assessment/framework-registry.test.ts")
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Write the quarantine migration**

Create `supabase/migrations/20260825000002_quarantine_fabricated_mappings.sql`:

```sql
-- ============================================================================
-- Migration 20260825000002: quarantine fabricated framework crosswalks
--
-- On 2026-08-25 an audit proved that 5 of the 7 framework mappings in
-- scf_framework_mappings were manufactured locally by string-prefixing the two
-- real ones, not sourced from any crosswalk:
--
--   soc2, nist_800_53, HI-2013  <- iso27001's mapping with a prefix glued on
--   EU-GDPR, BR-LGPD            <- iso27701's mapping, same method
--
-- Evidence: after stripping the prefix, ZERO target_control_ids differ from the
-- source framework's, and each group shares a byte-identical SCF control set
-- (582 for the security group, 390 for privacy). The fabricated ids name
-- controls that do not exist in the target standards — SOC 2 has no control
-- "5.0.1" (its criteria are CC1.1-CC9.2), NIST 800-53 uses AC-1/AU-2/SC-7,
-- HIPAA uses 45 CFR §164.308, GDPR uses Articles. A report citing
-- "gap at SOC2-5.0.1" cites something that does not exist.
--
-- MOVE, do not delete: the rows are evidence of how this happened, and a move
-- is reversible. Rollback is at the bottom of this file.
--
-- Idempotent: re-running is a no-op.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.scf_framework_mappings_quarantine (
    id                 BIGINT      NOT NULL,
    framework_code     VARCHAR     NOT NULL,
    target_control_id  VARCHAR     NOT NULL,
    scf_control_code   VARCHAR     NOT NULL,
    synced_at          TIMESTAMPTZ NULL,
    quarantined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    quarantine_reason  TEXT        NOT NULL
);

COMMENT ON TABLE public.scf_framework_mappings_quarantine IS
  'Framework mappings withdrawn from service because they were fabricated rather than sourced from a real crosswalk. Kept as evidence and to make the removal reversible. See migration 20260825000002.';

CREATE INDEX IF NOT EXISTS idx_mappings_quarantine_framework
    ON public.scf_framework_mappings_quarantine (framework_code);

-- Move the fabricated rows. INSERT then DELETE in one transaction; the
-- NOT EXISTS guard makes a second run insert nothing.
INSERT INTO public.scf_framework_mappings_quarantine
    (id, framework_code, target_control_id, scf_control_code, synced_at, quarantine_reason)
SELECT m.id, m.framework_code, m.target_control_id, m.scf_control_code, m.synced_at,
       CASE
         WHEN m.framework_code IN ('soc2', 'nist_800_53', 'HI-2013')
           THEN 'Fabricated: iso27001 mapping with a framework-specific prefix glued onto target_control_id. Zero ids differ after stripping the prefix.'
         ELSE 'Fabricated: iso27701 mapping with a framework-specific prefix glued onto target_control_id. Zero ids differ after stripping the prefix.'
       END
FROM public.scf_framework_mappings m
WHERE m.framework_code IN ('soc2', 'nist_800_53', 'HI-2013', 'EU-GDPR', 'BR-LGPD')
  AND NOT EXISTS (
    SELECT 1 FROM public.scf_framework_mappings_quarantine q WHERE q.id = m.id
  );

DELETE FROM public.scf_framework_mappings
WHERE framework_code IN ('soc2', 'nist_800_53', 'HI-2013', 'EU-GDPR', 'BR-LGPD');

ALTER TABLE public.scf_framework_mappings_quarantine ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'scf_framework_mappings_quarantine' AND policyname = 'mappings_quarantine_internal_read'
  ) THEN
    CREATE POLICY mappings_quarantine_internal_read
      ON public.scf_framework_mappings_quarantine
      FOR SELECT USING (
        auth.role() = 'service_role'
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ionic_user'))
      );
  END IF;
END $$;

COMMIT;

-- ── Rollback (run manually only if the quarantine must be undone) ────────────
-- BEGIN;
-- INSERT INTO public.scf_framework_mappings (id, framework_code, target_control_id, scf_control_code, synced_at)
-- SELECT id, framework_code, target_control_id, scf_control_code, synced_at
--   FROM public.scf_framework_mappings_quarantine
--  WHERE NOT EXISTS (
--    SELECT 1 FROM public.scf_framework_mappings m WHERE m.id = scf_framework_mappings_quarantine.id
--  );
-- DELETE FROM public.scf_framework_mappings_quarantine;
-- COMMIT;
```

- [ ] **Step 6: Apply the migration and verify with the Task 3 detector**

`supabase db push` does not work against this project (see Global Constraints). Apply by pasting the migration into the Supabase SQL Editor and running it. Then:

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npm run check:mappings")
```

Expected: **exit 0**, output `2 frameworks` and `OK — no two frameworks share an identical SCF control set`. This is the proof the quarantine worked — the same command failed with 1 before it. If it still reports findings, the migration did not fully apply; stop and report.

Confirm the rows landed rather than vanished:

```sql
select framework_code, count(*) from scf_framework_mappings_quarantine group by 1 order by 1;
```

Expected: five rows totalling 25,589 (`5441 × 3` security + `4633 × 2` privacy).

- [ ] **Step 7: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: 452 tests passing (448 after Task 3 + 4 new), `202` tsc errors. If any *other* test fails, it is asserting on a now-unoffered framework — report it rather than weakening the new registry test.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260825000002_quarantine_fabricated_mappings.sql src/lib/assessment/framework-registry.ts tests/unit/assessment/framework-registry.test.ts
git commit -m "fix(mappings): quarantine 5 fabricated framework crosswalks

soc2/nist_800_53/HI-2013 were iso27001's mapping with a prefix glued on;
EU-GDPR/BR-LGPD were iso27701's. Zero target ids differ after stripping the
prefix, and each group shares a byte-identical SCF control set. The fabricated
ids name controls that do not exist in the target standards, so any report
citing them was a fabricated audit artifact.

Rows are moved to scf_framework_mappings_quarantine (reversible, kept as
evidence), and the five codes are withdrawn from the framework picker while
their display names still resolve so historical records render. Verified with
npm run check:mappings: exit 1 before, exit 0 after."
```

---

### Task 5: Fix the crosswalk-upload path so a real load cannot silently duplicate a framework

**Context:** `POST /api/compliance/mappings/upload` is the mechanism for loading real crosswalks, so it must be correct before anyone uses it. It currently normalizes with `framework_code.toUpperCase().replace(/\s+/g, '-')` while the surviving real codes are lowercase (`iso27001`, `iso27701`). Uploading an ISO 27001 crosswalk would therefore create `ISO27001` as a **separate** framework alongside `iso27001` — silently splitting one framework's mappings in two, with the engine and scorecard looking up whichever code the UI passes.

**Files:**
- Modify: `src/app/api/compliance/mappings/upload/route.ts:75-80` (the `rows` normalization)
- Test: `tests/unit/assessment/framework-code-normalization.test.ts` (create)

**Interfaces:**
- Consumes: `FRAMEWORK_REGISTRY` and `QUARANTINED_FRAMEWORKS` from Task 4.
- Produces:
  ```typescript
  export function normalizeFrameworkCode(raw: string): string
  ```
  exported from `src/lib/assessment/framework-registry.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/assessment/framework-code-normalization.test.ts`:

```typescript
// tests/unit/assessment/framework-code-normalization.test.ts
// The crosswalk upload route used to uppercase every framework code, which
// would have created "ISO27001" alongside the real lowercase "iso27001" —
// silently splitting one framework's mappings across two codes. Uploads must
// canonicalize onto the code the registry already uses.

import { describe, it, expect } from "vitest";
import { normalizeFrameworkCode } from "@/lib/assessment/framework-registry";

describe("normalizeFrameworkCode", () => {
  it("canonicalizes case variants onto the registry's own code", () => {
    expect(normalizeFrameworkCode("ISO27001")).toBe("iso27001");
    expect(normalizeFrameworkCode("iso27001")).toBe("iso27001");
    expect(normalizeFrameworkCode("Iso27001")).toBe("iso27001");
    expect(normalizeFrameworkCode("iso27701")).toBe("iso27701");
  });

  it("resolves a known alias to its canonical code", () => {
    expect(normalizeFrameworkCode("lgpd")).toBe("BR-LGPD");
    expect(normalizeFrameworkCode("hipaa")).toBe("HI-2013");
    expect(normalizeFrameworkCode("soc-2")).toBe("soc2");
  });

  it("preserves the registry's own casing for mixed-case codes", () => {
    expect(normalizeFrameworkCode("eu-gdpr")).toBe("EU-GDPR");
    expect(normalizeFrameworkCode("br-lgpd")).toBe("BR-LGPD");
  });

  it("collapses whitespace to hyphens for codes it does not know", () => {
    expect(normalizeFrameworkCode("  NEW FRAMEWORK  ")).toBe("NEW-FRAMEWORK");
  });

  it("leaves an unknown code otherwise untouched rather than uppercasing it", () => {
    expect(normalizeFrameworkCode("cis_v8")).toBe("cis_v8");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/assessment/framework-code-normalization.test.ts")
```

Expected: FAIL — `normalizeFrameworkCode` is not exported.

- [ ] **Step 3: Implement the normalizer**

Append to `src/lib/assessment/framework-registry.ts`:

```typescript
// Canonical-code lookup, built from every id and alias the registry knows
// (offered and quarantined alike), keyed case-insensitively.
const _canonicalMap = new Map<string, string>();
for (const fw of [...FRAMEWORK_REGISTRY, ...QUARANTINED_FRAMEWORKS]) {
  _canonicalMap.set(fw.id.toLowerCase(), fw.id);
  if (fw.aliases) {
    for (const alias of fw.aliases) _canonicalMap.set(alias.toLowerCase(), fw.id);
  }
}

/**
 * Canonicalizes a framework code from external input (CSV upload, API body)
 * onto the exact code the registry uses.
 *
 * The upload route previously did `.toUpperCase()`, which would have written
 * "ISO27001" beside the real "iso27001" and split one framework's mappings
 * across two codes with nothing flagging it. Unknown codes are passed through
 * with whitespace collapsed rather than case-mangled, so a genuinely new
 * framework keeps whatever casing the crosswalk uses.
 */
export function normalizeFrameworkCode(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, '-');
  return _canonicalMap.get(trimmed.toLowerCase()) ?? trimmed;
}
```

- [ ] **Step 4: Use it in the upload route**

In `src/app/api/compliance/mappings/upload/route.ts`, add to the imports at the top:

```typescript
import { normalizeFrameworkCode } from "@/lib/assessment/framework-registry";
```

Then replace:

```typescript
    const rows = mappings.map(m => ({
      framework_code: m.framework_code.toUpperCase().replace(/\s+/g, '-'),
      target_control_id: m.target_control_id.trim(),
      scf_control_code: m.scf_control_code.trim().toUpperCase(),
      synced_at: new Date().toISOString(),
    }));
```

with:

```typescript
    const rows = mappings.map(m => ({
      // Canonicalize onto the registry's own code. Uppercasing here would
      // create e.g. "ISO27001" beside the real "iso27001" and split one
      // framework's mappings across two codes.
      framework_code: normalizeFrameworkCode(m.framework_code),
      target_control_id: m.target_control_id.trim(),
      scf_control_code: m.scf_control_code.trim().toUpperCase(),
      synced_at: new Date().toISOString(),
    }));
```

- [ ] **Step 5: Run the test and the full suite**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/assessment/framework-code-normalization.test.ts && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: the new file PASSES (5 tests); full suite 457 tests passing (452 after Task 4 + 5 new); `202` tsc errors.

- [ ] **Step 6: Record the acceptance test for a future real crosswalk load**

Append to `docs/standard-api/CONTRACT_AUDIT.md`, at the end of the file:

```markdown
---

## D. Loading a real framework crosswalk (added 2026-08-25)

Five framework mappings were fabricated and quarantined (migration
`20260825000002`); `iso27001` and `iso27701` are the only real ones. To restore
a framework:

1. Obtain its real crosswalk (SCF's official mapping workbook, or the Standard
   API's per-framework mapping data — it covers 231 frameworks).
2. Convert to CSV with the header `framework_code,target_control_id,scf_control_code`.
3. `POST /api/compliance/mappings/upload` (admin/ionic_user). The route
   canonicalizes `framework_code` via `normalizeFrameworkCode`, so casing in
   the CSV does not create a duplicate framework.
4. **Acceptance gate — run `npm run check:mappings`. It must exit 0.** A
   non-zero exit means the loaded mapping shares a byte-identical SCF control
   set with another framework, which is the signature of a cloned/fabricated
   crosswalk rather than a real one. Do not re-add the framework to
   `FRAMEWORK_REGISTRY` until this passes.
5. Sanity-check the target ids against the real standard: SOC 2 criteria look
   like `CC6.1`, NIST 800-53 like `AC-1`, HIPAA like `164.308(a)(1)(i)`, GDPR
   like `Art.32`. Ids that look like ISO clause numbers (`5.1.1`) with a prefix
   are the fabrication pattern this gate exists to catch.
6. Add the framework back to `FRAMEWORK_REGISTRY` (moving it out of
   `QUARANTINED_FRAMEWORKS`) and remove it from the `FABRICATED` list in
   `tests/unit/assessment/framework-registry.test.ts`.
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/assessment/framework-registry.ts src/app/api/compliance/mappings/upload/route.ts tests/unit/assessment/framework-code-normalization.test.ts docs/standard-api/CONTRACT_AUDIT.md
git commit -m "fix(mappings): canonicalize framework codes on crosswalk upload

The upload route uppercased framework_code while the real codes are lowercase,
so loading an ISO 27001 crosswalk would have created \"ISO27001\" beside
\"iso27001\" and split one framework's mappings across two codes silently.
This path is how real crosswalks get loaded, so it had to be correct first.

Documents the load procedure with npm run check:mappings as its acceptance
gate in CONTRACT_AUDIT.md section D."
```

---

### Task 6: Guard the DB-first control-catalog load against a partial catalog

> **BLOCKED ON THIS BRANCH — do not attempt here.** Pre-flight scan (2026-08-25) found that the code this task modifies does not exist on `main`, and therefore not on the `epistemic-integrity` branch either. The DB-first `scf_controls` read (with `.range(0, 2000)` and the `length > 0` guard) was introduced by commit `0d54493`, which lives only on the unmerged `posture-release-readiness` branch. `main`'s `engine.ts` still loads the catalog by paginating the Standard API with a `MAX_PAGES` bound and has no partial-catalog defect to guard.
>
> This task is therefore a **required follow-up on `posture-release-readiness`, to be completed before that branch merges** — the branch that introduces the fast path is the branch that owes it a completeness guard. The task text below is correct as written; only its target branch changes. An executor of this plan should skip it and confirm it has been carried over.

**Context:** `engine.ts` loads the SCF catalog from the `scf_controls` table and accepts it whenever `dbControls.length > 0`, only falling back to the authoritative Standard API when the table is completely empty. A partially-seeded table therefore yields a silently truncated catalog and confident scores over a subset. The live table currently holds the full 1,468 rows so this is latent, not active — but the guard is the difference between "correct today" and "correct".

The check cannot be a hardcoded count (SCF versions change the total). Instead: the `.range(0, 2000)` ceiling is a real truncation signal, and a suspiciously small catalog is a real staleness signal. Both are conditions the code can name without inventing an expected number.

**Files:**
- Modify: `src/lib/assessment/engine.ts:156-175` (the DB-first load block)
- Test: `tests/unit/assessment/catalog-completeness.test.ts` (create)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  ```typescript
  export function assessCatalogCompleteness(rowCount: number, rangeCeiling: number): {
    usable: boolean;
    reason: string | null;
  }
  ```
  exported from `src/lib/assessment/engine.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/assessment/catalog-completeness.test.ts`:

```typescript
// tests/unit/assessment/catalog-completeness.test.ts
// The engine reads the SCF catalog from scf_controls and used to accept any
// non-empty result, so a partially-seeded table produced confident scores over
// a truncated control set. These are the two conditions it can detect without
// inventing an expected total.

import { describe, it, expect } from "vitest";
import { assessCatalogCompleteness } from "@/lib/assessment/engine";

const CEILING = 2000;

describe("assessCatalogCompleteness", () => {
  it("accepts a full-looking catalog", () => {
    expect(assessCatalogCompleteness(1468, CEILING)).toEqual({ usable: true, reason: null });
  });

  it("rejects an empty table so the API fallback runs", () => {
    const result = assessCatalogCompleteness(0, CEILING);
    expect(result.usable).toBe(false);
    expect(result.reason).toContain("empty");
  });

  it("rejects a suspiciously small catalog rather than scoring against a subset", () => {
    const result = assessCatalogCompleteness(50, CEILING);
    expect(result.usable).toBe(false);
    expect(result.reason).toContain("50");
  });

  it("rejects a read that hit the range ceiling, since it may be truncated", () => {
    const result = assessCatalogCompleteness(CEILING, CEILING);
    expect(result.usable).toBe(false);
    expect(result.reason).toContain("truncat");
  });

  it("accepts a count just under the ceiling", () => {
    expect(assessCatalogCompleteness(CEILING - 1, CEILING).usable).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/assessment/catalog-completeness.test.ts")
```

Expected: FAIL — `assessCatalogCompleteness` is not exported from `engine.ts`.

- [ ] **Step 3: Implement the guard**

In `src/lib/assessment/engine.ts`, add above `export async function runAssessment(`:

```typescript
/**
 * The DB-first catalog read is an optimization over the authoritative Standard
 * API, so it must decline whenever it cannot vouch for what it read. Two
 * conditions are detectable without inventing an expected total (SCF versions
 * change it): the read hit its range ceiling and may be truncated, or the
 * catalog is far smaller than any real SCF version.
 */
export const MIN_PLAUSIBLE_CATALOG_SIZE = 1000;

export function assessCatalogCompleteness(
  rowCount: number,
  rangeCeiling: number,
): { usable: boolean; reason: string | null } {
  if (rowCount === 0) {
    return { usable: false, reason: 'scf_controls is empty' };
  }
  if (rowCount >= rangeCeiling) {
    return {
      usable: false,
      reason: `read returned ${rowCount} rows, hitting the ${rangeCeiling}-row ceiling — may be truncated`,
    };
  }
  if (rowCount < MIN_PLAUSIBLE_CATALOG_SIZE) {
    return {
      usable: false,
      reason: `only ${rowCount} controls, below the ${MIN_PLAUSIBLE_CATALOG_SIZE} minimum for a plausible SCF catalog — likely partially seeded`,
    };
  }
  return { usable: true, reason: null };
}
```

Then in `runAssessment`, replace:

```typescript
    if (dbControls && dbControls.length > 0) {
      allControls = dbControls.map((c: any) => ({
        control_id: c.control_code,
        control_name: c.control_name,
        description: c.description,
        domain: c.domain_code,
      }));
      console.log(`[Assessment] Loaded ${allControls.length} controls directly from db table 'scf_controls'`);
    }
```

with:

```typescript
    const completeness = assessCatalogCompleteness(dbControls?.length ?? 0, CATALOG_RANGE_CEILING);
    if (completeness.usable) {
      allControls = (dbControls ?? []).map((c: any) => ({
        control_id: c.control_code,
        control_name: c.control_name,
        description: c.description,
        domain: c.domain_code,
      }));
      console.log(`[Assessment] Loaded ${allControls.length} controls directly from db table 'scf_controls'`);
    } else {
      // Leave allControls empty so the authoritative Standard API path below
      // runs. Scoring against a partial catalog would report confident
      // percentages over a subset of the controls.
      console.warn(
        `[Assessment] Declining the scf_controls fast path (${completeness.reason}); falling back to the Standard API`,
      );
    }
```

And define the ceiling constant next to `MIN_PLAUSIBLE_CATALOG_SIZE`:

```typescript
/** Upper bound of the scf_controls range read; also the truncation signal. */
export const CATALOG_RANGE_CEILING = 2000;
```

Then change the query's `.range(0, 2000)` to use it:

```typescript
      .range(0, CATALOG_RANGE_CEILING);
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/assessment/catalog-completeness.test.ts")
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Confirm the live catalog still takes the fast path**

The live `scf_controls` table holds 1,468 rows, which is `>= 1000` and `< 2000`, so the fast path must still be chosen. Verify the boundary logic directly:

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/assessment/catalog-completeness.test.ts -t 'full-looking'")
```

Expected: PASS. (A full assessment run against live data needs credentials and a running app — that is the runbook's job, not this test's.)

- [ ] **Step 6: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: 462 tests passing (457 after Task 5 + 5 new), `202` tsc errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/assessment/engine.ts tests/unit/assessment/catalog-completeness.test.ts
git commit -m "fix(assessment): decline a partial SCF catalog instead of scoring against it

The DB-first catalog read accepted any non-empty result and only fell back to
the authoritative Standard API when scf_controls was completely empty, so a
partially-seeded table produced confident scores over a truncated control set.
Latent today (the table holds the full 1,468) but the guard is cheap.

Detects the two conditions that need no invented expected total: the read hit
its range ceiling, or the catalog is below any plausible SCF size."
```

---

### Task 8: Stop offering frameworks nothing backs (added mid-execution)

**Context:** Task 4's review found that Task 4 does not achieve its own stated goal, and that the plan's file list was wrong. Withdrawing the five fabricated frameworks from `FRAMEWORK_REGISTRY` does **not** withdraw them from the Run Assessment picker, because the picker's list does not come from the registry:

- `src/app/api/compliance/frameworks/route.ts:56-57` builds `baseCodes = Object.keys(fallbackNames)` from a hardcoded object and merges it unconditionally: `combinedCodes = [...new Set([...apiCodes, ...baseCodes, ...uniqueCodes])]`. That hardcoded object asserts the existence of 13 frameworks — including the fabricated `soc2`, `hipaa`, `nist_800_53`, `BR-LGPD`, `EU-GDPR`, **and** five more with no mapping rows at all (`nist_csf`, `PCI-DSS`, `saudi_sama`, `saudi_nca`, `cis_v8`). Only `iso27001` and `iso27701` have real crosswalks. The list is offered regardless of what `scf_framework_mappings` contains, so applying Task 4's migration does not remove them.
- `src/components/assessments/run-assessment-modal.tsx:48-55` (and again at `:72-79`) hardcodes its own default selection `["iso27001","soc2","hipaa","nist_800_53","iso27701","fedramp"]`, disconnected from `DEFAULT_FRAMEWORKS`. A user who opens the modal and clicks Run without touching the selector submits `soc2`, `hipaa` and `nist_800_53`.

The fix is to make the offered list derive from what is actually backed, and to make the modal's default agree with the registry. `fallbackNames` stays, but demoted to what its name says — a display-name lookup — instead of doubling as an existence claim.

**Files:**
- Modify: `src/app/api/compliance/frameworks/route.ts:54-66`
- Modify: `src/components/assessments/run-assessment-modal.tsx:48-55` and `:72-79`
- Test: `tests/api/frameworks.test.ts` (create)

**Interfaces:**
- Consumes: `DEFAULT_FRAMEWORKS` from `src/lib/assessment/framework-registry.ts` (Task 4 reduced it to `iso27001` + `iso27701`).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Create `tests/api/frameworks.test.ts`:

```typescript
// tests/api/frameworks.test.ts
// The frameworks endpoint feeds the Run Assessment picker. It must offer only
// frameworks something actually backs — the Standard API's own catalog, or a
// real crosswalk in scf_framework_mappings. It previously merged in a
// hardcoded list of 13 codes regardless of backing, which is how five
// fabricated frameworks (and five with no mappings at all) stayed selectable.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabaseServer } from '../setup';

vi.mock('@/lib/standard-api/client', () => ({
  getScfFrameworks: vi.fn(async () => []),
}));

function resetMocks() {
  mockSupabaseServer.auth.getUser.mockResolvedValue({
    data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    error: null,
  });
  mockSupabaseServer.from.mockReturnThis();
  mockSupabaseServer.select.mockResolvedValue({
    data: [{ framework_code: 'iso27001' }, { framework_code: 'iso27701' }],
    error: null,
  });
}

describe('GET /api/compliance/frameworks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/compliance/frameworks/route');
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Session not found'),
    });

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('offers only frameworks that have real mappings when the Standard API returns none', async () => {
    const { GET } = await import('@/app/api/compliance/frameworks/route');

    const res = await GET();
    const body = await res.json();
    const codes = body.data.map((f: { framework_code: string }) => f.framework_code);

    expect(codes.sort()).toEqual(['iso27001', 'iso27701']);
  });

  it('never offers a fabricated or unbacked framework from a hardcoded list', async () => {
    const { GET } = await import('@/app/api/compliance/frameworks/route');

    const res = await GET();
    const body = await res.json();
    const codes = body.data.map((f: { framework_code: string }) => f.framework_code);

    for (const unbacked of ['soc2', 'hipaa', 'nist_800_53', 'BR-LGPD', 'EU-GDPR', 'nist_csf', 'PCI-DSS', 'saudi_sama', 'saudi_nca', 'cis_v8']) {
      expect(codes).not.toContain(unbacked);
    }
  });

  it('still resolves a display name for a code it does offer', async () => {
    const { GET } = await import('@/app/api/compliance/frameworks/route');

    const res = await GET();
    const body = await res.json();
    const iso = body.data.find((f: { framework_code: string }) => f.framework_code === 'iso27001');

    expect(iso.framework_name).toBe('ISO/IEC 27001:2022');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/api/frameworks.test.ts")
```

Expected: the two middle tests FAIL — the route currently returns all 13 hardcoded codes plus the 2 mapped ones.

- [ ] **Step 3: Stop the hardcoded list from asserting existence**

In `src/app/api/compliance/frameworks/route.ts`, replace:

```typescript
    // Merge API frameworks with local mappings and fallback names
    const apiCodes = apiFrameworks.map(f => f.framework_code);
    const baseCodes = Object.keys(fallbackNames);
    const combinedCodes = [...new Set([...apiCodes, ...baseCodes, ...uniqueCodes])];
```

with:

```typescript
    // Offer only what something actually backs: the Standard API's own catalog,
    // or a real crosswalk in scf_framework_mappings. `fallbackNames` below is a
    // DISPLAY-NAME lookup only — it must never contribute codes to this list.
    // It used to (`baseCodes = Object.keys(fallbackNames)`), which meant the
    // picker asserted 13 frameworks existed when only two had real crosswalks:
    // five were fabricated (quarantined in migration 20260825000002) and five
    // more had no mapping rows at all. A framework offered here with nothing
    // behind it produces an assessment over zero controls, reported as a score.
    const apiCodes = apiFrameworks.map(f => f.framework_code);
    const combinedCodes = [...new Set([...apiCodes, ...uniqueCodes])];
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/api/frameworks.test.ts")
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Make the modal's default selection agree with the registry**

In `src/components/assessments/run-assessment-modal.tsx`, add to the imports:

```typescript
import { DEFAULT_FRAMEWORKS } from "@/lib/assessment/framework-registry";
```

Then replace the hardcoded `useState` initializer at lines 48-55 and the identical hardcoded array in the reset path at lines 72-79 with `DEFAULT_FRAMEWORKS.map((f) => f.id)`. Both sites must use it — the reset path re-introduced the fabricated codes on its own otherwise. Read the surrounding code before editing so the replacement matches each site's exact shape (one is a `useState` initializer, the other a reassignment).

- [ ] **Step 6: Run the full suite and typecheck**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | grep -c 'error TS'")
```

Expected: 456 tests passing (452 after Task 4 + 4 new), `202` tsc errors. If another test fails because it asserted on the old 13-framework list, report it — that assertion was pinning the defect.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/compliance/frameworks/route.ts src/components/assessments/run-assessment-modal.tsx tests/api/frameworks.test.ts
git commit -m "fix(frameworks): offer only frameworks something actually backs

Task 4 withdrew five fabricated frameworks from FRAMEWORK_REGISTRY, but the
Run Assessment picker never read that registry. Its list came from
/api/compliance/frameworks, which merged a hardcoded 13-entry object into the
offered codes regardless of what scf_framework_mappings held — so the five
fabricated frameworks stayed selectable, along with five more that have no
mapping rows at all. The modal also hardcoded its own default selection
including soc2/hipaa/nist_800_53, so clicking Run without touching the
selector submitted them.

fallbackNames is now what its name says: a display-name lookup that
contributes no codes. The offered list derives from the Standard API catalog
plus real crosswalks, and the modal defaults to DEFAULT_FRAMEWORKS."
```

---

### Task 7: Ops verification — the checks no code change can make

**Context:** Four items from `docs/standard-api/CONTRACT_AUDIT.md` section C, plus the two fallback flags, can only be confirmed against the live Vercel project. `vercel whoami` currently reports no credentials in this environment, so an agent cannot do these — they need an authenticated operator. They are grouped here so the plan does not silently end with them unverified.

**Files:**
- Modify: `docs/standard-api/CONTRACT_AUDIT.md` (check off section C, record the date)

**Interfaces:**
- Consumes: `GRC_CRON_FALLBACK_ENABLED` from Task 2.
- Produces: nothing code depends on.

- [ ] **Step 1: Authenticate the Vercel CLI**

This is interactive and cannot be done by an agent. In the Claude Code session, the operator runs:

```
! npx vercel login
```

Then confirm:

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vercel whoami")
```

Expected: a username, not `No existing credentials found`.

- [ ] **Step 2: Verify the four contract-audit env vars**

```bash
(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vercel env ls production")
```

Confirm, without printing secret values:
- `STANDARD_GRC_API_URL` ends in `/api/v1` — a missing segment 404s every Standard API call.
- `STANDARD_GRC_TENANT_ID` is present and non-empty — required for `/gap/evaluate-evidence` and `/intelligence/council`; missing yields `400 TENANT_CONTEXT_REQUIRED`.
- `STANDARD_GRC_API_KEY` uses the `standard_live_` prefix.

- [ ] **Step 3: Verify the three fallback flags are fail-closed**

In the same listing, confirm:
- `GRC_LOCAL_FALLBACK_ENABLED` is **unset** (not `"false"` — absent).
- `GRC_CRON_FALLBACK_ENABLED` (new in Task 2) is **unset**. If it is set to `true`, scheduled sweeps may write estimated verdicts; that is now a deliberate choice, so confirm it is intended.
- `GRC_FALLBACK_DISABLED` — if present and `"true"`, estimation is hard-off everywhere, which is stricter than default and fine.

- [ ] **Step 4: Record the verification**

In `docs/standard-api/CONTRACT_AUDIT.md`, replace section C's unchecked list:

```markdown
## C. Ops verification checklist (no code, just confirm)

- [ ] `STANDARD_GRC_API_URL` = `https://standard-api.bekaa.eu/api/v1` (incl. `/api/v1`).
- [ ] `STANDARD_GRC_TENANT_ID` = `org_xxxxx` is set in prod.
- [ ] `STANDARD_GRC_API_KEY` uses the `standard_live_` prefix.
- [ ] `GRC_LOCAL_FALLBACK_ENABLED` is unset/false in prod (fail-closed).
```

with the same list, each box checked or annotated with what was actually found, plus a dated line and the new flag:

```markdown
## C. Ops verification checklist (no code, just confirm)

Verified against Vercel production on <YYYY-MM-DD> by <operator>:

- [x] `STANDARD_GRC_API_URL` ends in `/api/v1`.
- [x] `STANDARD_GRC_TENANT_ID` is set.
- [x] `STANDARD_GRC_API_KEY` uses the `standard_live_` prefix.
- [x] `GRC_LOCAL_FALLBACK_ENABLED` is unset (fail-closed).
- [x] `GRC_CRON_FALLBACK_ENABLED` is unset (automated runs do not estimate).
```

Replace any box that did not hold with a note stating what was found and what was changed.

- [ ] **Step 5: Commit**

```bash
git add docs/standard-api/CONTRACT_AUDIT.md
git commit -m "docs(standard-api): record production env verification for contract audit section C"
```

---

## Self-review

**Coverage of the five requested gaps.** Fabricated mappings → Tasks 3 (detector), 4 (quarantine + registry withdrawal), 5 (repair path + load procedure). Hardcoded cross-coverage fabrication → Task 1. Cron estimation → Task 2. Catalog completeness guard → Task 6. Pending ops checks → Task 7. All five are covered; nothing in the request is unaddressed.

**Ordering is load-bearing.** Task 3 lands before Task 4 so the quarantine is *proven* by a command that failed before it and passes after, rather than asserted. Task 5 comes after Task 4 because `normalizeFrameworkCode` reads `QUARANTINED_FRAMEWORKS`, which Task 4 creates. Tasks 1, 2 and 6 are independent and could run in any order.

**Type consistency check.** `MappingRow` and `CloneFinding` are defined once (Task 3) and consumed by name in Task 3's script only. `detectClonedMappings` keeps one signature throughout. `normalizeFrameworkCode` (Task 5) depends on `FRAMEWORK_REGISTRY` and `QUARANTINED_FRAMEWORKS` — the latter is created in Task 4 Step 3, before Task 5 uses it. `assessCatalogCompleteness`, `MIN_PLAUSIBLE_CATALOG_SIZE` and `CATALOG_RANGE_CEILING` are all defined in Task 6 Step 3 and used only there. `QUARANTINED_FRAMEWORKS` is referenced by Task 4's lookup-map change and Task 5's `_canonicalMap`, with the same shape (`FrameworkInfo[]`) in both.

**Test-count arithmetic.** 437 baseline → 439 (T1 +2) → 443 (T2 +4) → 448 (T3 +5) → 452 (T4 +4) → 457 (T5 +5) → 462 (T6 +5). Each task's expected total is stated in its own verification step, so an executor running tasks out of order can still tell whether its own tests passed even if the running total differs.

**One thing a reviewer should push back on.** Task 6's `MIN_PLAUSIBLE_CATALOG_SIZE = 1000` is a magic number, and I argued earlier in the session against exactly that. The distinction: it is not an *expected* catalog size (which would be brittle across SCF versions) but a floor below which no real SCF version has ever been — 1,468 today, and the framework has only grown. It still encodes an assumption that will need revisiting if SCF is ever split into smaller profiles, and a reviewer may reasonably prefer the truncation check alone (which needs no constant) with the small-catalog check dropped.

**Deliberately not planned.** Task 4 removes five frameworks from the product's picker, which is a visible product change; the plan implements the human's stated decision to quarantine, but a reviewer should confirm that intent still holds before Task 4 Step 5 touches production data. And the fabricated rows' `DELETE` runs against the live database via the SQL Editor — the only genuinely irreversible-feeling step in the plan, which is why it is an INSERT-then-DELETE in one transaction with a documented rollback block.
