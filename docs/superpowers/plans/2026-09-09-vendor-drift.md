# Vendor Drift Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect a Standard API catalogue change that can move a published compliance figure, before it moves one silently.

**Architecture:** Two new pure-ish check functions join the two already in `src/lib/spine/invariants.ts`. They take their Supabase client as a parameter, never throw, and return arrays of failures. A new `src/lib/spine/baseline.ts` holds eight mapping counts measured on 2026-09-09; changing one of those numbers is a commit signed by a person. The existing daily cron at `/api/cron/spine-invariants` spreads the new failures into the array it already returns with a 500.

**Tech Stack:** TypeScript, Next.js App Router, Supabase JS client, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-vendor-drift-design.md`

## Global Constraints

- **Branch:** `docs/vendor-drift-spec` (already checked out, spec committed as `c6f238d`). Do not commit to `main`.
- **Never throw from a check function.** The cron route awaits all checks with no `try`/`catch`; one throw discards every other check's already-computed results. A failed query becomes one legible failure entry instead. This rule is stated at `src/lib/spine/invariants.ts:117`.
- **Exact counts only.** Row counting uses `select('*', { count: 'exact', head: true })`. Never count by reading pages. PostgREST gives no stable row order between two `range()` calls without `.order()`, so an unordered paged read silently skips and repeats rows — this produced a false "TX-LEVEL-2 has zero mappings" reading while preparing the spec, when the true count is 366. Spec §6.
- **Baseline is keyed by our `local_code`**, never by the vendor slug. The slug is the value that drifts. Spec §4.
- **Code and comments in English**; this repository's source is English throughout.
- **Commit message trailer:** end each commit with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`, matching the repository's recent history.
- **Current catalogue version** is `826a1f05-f065-4feb-9f44-ced8019a6701`. All eight curated identities carry this same value in `decided_against_version` today, so a correct implementation produces zero failures against the live database right now.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/spine/baseline.ts` (create) | The measured counts, and nothing else. No logic, no I/O. |
| `src/lib/spine/invariants.ts` (modify) | Gains `checkCurationVersionCurrent` and `checkMappingCountsStable` alongside the two existing checks. |
| `src/app/api/cron/spine-invariants/route.ts` (modify) | Spreads two more check results into the existing `failures` array. |
| `tests/unit/spine/invariants.test.ts` (modify) | Gains a `describe` block per new check. |

**Why `checkMappingCountsStable` guards its own version.** Spec §7 requires that when the catalogue version has moved, count checks are skipped rather than run — counts taken against a different catalogue measure nothing, and nine meaningless arithmetic failures would bury the one fact that matters. Rather than making the route responsible for calling things in the right order, the function compares `CATALOGUE_BASELINE.scfVersionId` against the version it is given and returns a single "skipped" failure. The ordering becomes a property of the function, testable without route mocks, and the route stays a two-line change.

---

### Task 1: `checkCurationVersionCurrent`

Fires when a curated framework identity was decided against a catalogue version that is no longer current. On 2026-09-08 all eight identities were decided against a catalogue that had just been replaced, and nothing said so for eleven days.

**Files:**
- Modify: `src/lib/spine/invariants.ts` (append after `checkOfferedFrameworksResolve`, before `AnnexInvariantFailure`)
- Test: `tests/unit/spine/invariants.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `export interface VersionInvariantFailure { framework: string; reason: string }`
  - `export async function checkCurationVersionCurrent(client: unknown, scfVersionId: string): Promise<VersionInvariantFailure[]>`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/spine/invariants.test.ts`. Note the import line at the top of the file must gain `checkCurationVersionCurrent` and `VersionInvariantFailure` is not imported (it is inferred).

```ts
import {
  checkOfferedFrameworksResolve,
  checkCurationVersionCurrent,
  KNOWN_UNCURATED,
} from '@/lib/spine/invariants';

/** A client whose framework_identity_curation table holds exactly `rows`. */
function curationClient(
  rows: Array<{ local_code: string; decided_against_version: string; confidence: string }>,
  error: { message: string } | null = null,
) {
  return {
    from: (_table: string) => ({
      select: async (_cols: string) => ({ data: error ? null : rows, error }),
    }),
  };
}

describe('a curated identity decided against an older catalogue', () => {
  it('passes when every identity was decided against the current version', async () => {
    const failures = await checkCurationVersionCurrent(
      curationClient([
        { local_code: 'iso27001', decided_against_version: 'v-current', confidence: 'exact' },
        { local_code: 'soc2', decided_against_version: 'v-current', confidence: 'exact' },
      ]),
      'v-current',
    );
    expect(failures).toEqual([]);
  });

  it('fails one row per identity decided against an older catalogue', async () => {
    // This is 2026-09-08: the catalogue moved and eight decisions kept being
    // trusted because nothing compared them against the version in force.
    const failures = await checkCurationVersionCurrent(
      curationClient([
        { local_code: 'iso27001', decided_against_version: 'v-old', confidence: 'exact' },
        { local_code: 'soc2', decided_against_version: 'v-current', confidence: 'exact' },
        { local_code: 'iso27701', decided_against_version: 'v-old', confidence: 'probable' },
      ]),
      'v-current',
    );
    expect(failures.map((f) => f.framework).sort()).toEqual(['iso27001', 'iso27701']);
  });

  it('names both versions and the confidence, because a probable row costs more to reconfirm', async () => {
    const failures = await checkCurationVersionCurrent(
      curationClient([
        { local_code: 'iso27701', decided_against_version: 'v-old', confidence: 'probable' },
      ]),
      'v-current',
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toContain('v-old');
    expect(failures[0].reason).toContain('v-current');
    expect(failures[0].reason).toContain('probable');
  });

  it('turns a query error into one failure instead of throwing', async () => {
    // The cron awaits every check with no try/catch. A throw here would discard
    // the results the other checks have already computed.
    const failures = await checkCurationVersionCurrent(
      curationClient([], { message: 'relation does not exist' }),
      'v-current',
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toContain('relation does not exist');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/spine/invariants.test.ts -t "decided against an older catalogue"`

Expected: FAIL. The import of `checkCurationVersionCurrent` does not resolve, so the file fails to load.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/lib/spine/invariants.ts`, after `checkOfferedFrameworksResolve`:

```ts
export interface VersionInvariantFailure {
  framework: string;
  reason: string;
}

/**
 * A curated identity is a decision a person made while looking at one
 * catalogue. When the vendor publishes a new one, that decision is not
 * automatically wrong — it is unconfirmed, which is a different thing and has
 * to be said out loud.
 *
 * On 2026-09-08 the catalogue moved and all eight identities kept being
 * trusted. They happened to be re-curated eleven days later; nothing in the
 * system had asked for it.
 *
 * `confidence` travels in the message because it changes what reconfirming
 * costs. `iso27701` and `nist_800_53` are `probable`, and a probable identity
 * surviving a catalogue change is a coincidence, not a confirmation.
 */
export async function checkCurationVersionCurrent(
  client: unknown,
  scfVersionId: string,
): Promise<VersionInvariantFailure[]> {
  const db = client as {
    from: (t: string) => {
      select: (cols: string) => Promise<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };

  const { data, error } = await db
    .from('framework_identity_curation')
    .select('local_code, decided_against_version, confidence');

  if (error) {
    return [{ framework: '(curation)', reason: `framework_identity_curation: ${error.message}` }];
  }

  const failures: VersionInvariantFailure[] = [];
  for (const row of data ?? []) {
    const decidedAgainst = String(row.decided_against_version ?? '');
    if (decidedAgainst === scfVersionId) continue;

    failures.push({
      framework: String(row.local_code),
      reason:
        `identity decided against catalogue version ${decidedAgainst || '(none recorded)'}, ` +
        `but the catalogue in force is ${scfVersionId}. Confidence was ` +
        `"${String(row.confidence ?? 'unknown')}". A person must reconfirm which vendor ` +
        `framework this local code means in the new catalogue.`,
    });
  }

  return failures;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/spine/invariants.test.ts -t "decided against an older catalogue"`

Expected: PASS, 4 tests.

- [ ] **Step 5: Run the whole spine suite and the typechecker**

Run: `npx vitest run tests/unit/spine/invariants.test.ts && npm run typecheck`

Expected: every test in the file passes, and `tsc --noEmit` reports no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/spine/invariants.ts tests/unit/spine/invariants.test.ts
git commit -F - <<'MSG'
feat(spine): a curated identity decided against a retired catalogue now says so

Each of the eight identities in framework_identity_curation records the
catalogue version a person was looking at when they decided. Nothing compared
that against the version in force, so on 2026-09-08 all eight kept being
trusted after the catalogue underneath them was replaced.

The check reports one failure per stale row and carries the confidence into the
message, because reconfirming a probable identity is not the same job as
reconfirming an exact one -- iso27701 and nist_800_53 are the two that matter.

A query error becomes a single failure rather than a throw: the cron awaits
every check with no try/catch, and one throw would discard the results the
other checks already computed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 2: The baseline, and `checkMappingCountsStable`

Fires when a curated framework's mapping count moves at all, or when the catalogue total moves. The existing `checkOfferedFrameworksResolve` is binary — `soc2` falling from 1,478 rows to 12 passes it, while the percentage on the screen changes.

The baseline file is created here rather than in its own task because it is data with no behaviour: it is only meaningful as the thing this check compares against.

**Files:**
- Create: `src/lib/spine/baseline.ts`
- Modify: `src/lib/spine/invariants.ts` (append after `checkCurationVersionCurrent`)
- Test: `tests/unit/spine/invariants.test.ts`

**Interfaces:**
- Consumes: `resolveVendorFrameworkCode` from `@/lib/assessment/curation/identity` (already imported at the top of `invariants.ts`).
- Produces:
  - `export const CATALOGUE_BASELINE` from `@/lib/spine/baseline` — shape `{ scfVersionId: string; totalMappings: number; byFramework: Record<string, number> }`
  - `export interface CountInvariantFailure { framework: string; reason: string }`
  - `export async function checkMappingCountsStable(client: unknown, scfVersionId: string, baseline?: typeof CATALOGUE_BASELINE): Promise<CountInvariantFailure[]>`

- [ ] **Step 1: Create the baseline file**

Create `src/lib/spine/baseline.ts`:

```ts
// What the vendor's catalogue held when someone last looked.
//
// Measured 2026-09-09 against the live database with exact counts
// (`select('*', { count: 'exact', head: true })`), never with a paginated read.
// An unordered paged read reported TX-LEVEL-2 at zero mappings while preparing
// this; the true count is 366. PostgREST guarantees no stable row order between
// two range() calls, and a baseline that miscounts manufactures the false alarm
// it exists to prevent.
//
// The 67,234 total reconciles with the per-relationship figures published in
// docs/standard-api/FINDINGS_2026-09-09.md -- intersects 39,185, null 14,819,
// subset 8,391, equal 4,796, superset 43. Two independent measurements agreeing
// is why this number is usable as a baseline at all.
//
// CHANGING A NUMBER HERE IS A CLAIM THAT THE VENDOR CHANGED.
// Not that the test is inconvenient. Re-measure with exact counts, then say in
// the commit message what moved and why you believe the new value. This is the
// same discipline framework_identity_curation applies to identities through
// decided_by and rationale.
//
// Keyed by OUR local_code, never by the vendor slug. The slug is the value that
// drifts -- keying by it would reproduce the 2026-09-08 break inside the file
// written to detect it.
//
// Spec: docs/superpowers/specs/2026-09-09-vendor-drift-design.md §4
export const CATALOGUE_BASELINE = {
  scfVersionId: '826a1f05-f065-4feb-9f44-ced8019a6701',
  totalMappings: 67234,
  byFramework: {
    iso27001: 316,
    iso27701: 149,
    'BR-LGPD': 80,
    'EU-GDPR': 241,
    'EU-DORA': 442,
    soc2: 1478,
    'TX-LEVEL-2': 366,
    nist_800_53: 1117,
  } as Record<string, number>,
};
```

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/spine/invariants.test.ts`, and add `checkMappingCountsStable` to the import from `@/lib/spine/invariants`:

```ts
/**
 * A client for the count check. `slugs` maps local_code to curated slug;
 * `counts` maps a slug to its exact row count. The version total is the sum
 * unless `total` is given.
 */
function countingClient(
  slugs: Record<string, string>,
  counts: Record<string, number>,
  total?: number,
) {
  return {
    from: (table: string) => ({
      select: (_cols: string, _opts?: unknown) => ({
        eq: (_col: string, v1: string) => {
          if (table === 'framework_identity_curation') {
            return {
              maybeSingle: async () => ({
                data: { vendor_framework_code: slugs[v1] ?? null, confidence: 'exact' },
                error: null,
              }),
            };
          }
          // scf_control_mappings: .eq(version).eq(framework_code) counts one
          // framework; .eq(version) awaited directly counts the whole version.
          const versionOnly = {
            count: total ?? Object.values(counts).reduce((a, b) => a + b, 0),
            error: null as { message: string } | null,
          };
          return {
            eq: async (_c2: string, slug: string) => ({
              count: counts[slug] ?? 0,
              error: null,
            }),
            then: (resolve: (v: typeof versionOnly) => unknown) => resolve(versionOnly),
          };
        },
      }),
    }),
  };
}

const BASE = {
  scfVersionId: 'v-current',
  totalMappings: 396,
  byFramework: { iso27001: 316, soc2: 80 } as Record<string, number>,
};

describe('a mapping count that moves without reaching zero', () => {
  it('passes when every count matches the baseline', async () => {
    const failures = await checkMappingCountsStable(
      countingClient(
        { iso27001: 'general-iso-27001-2022', soc2: 'general-aicpa-tsc-2017' },
        { 'general-iso-27001-2022': 316, 'general-aicpa-tsc-2017': 80 },
      ),
      'v-current',
      BASE,
    );
    expect(failures).toEqual([]);
  });

  it('fails a framework whose count moved, naming both numbers', async () => {
    // The gap this check exists for: checkOfferedFrameworksResolve is binary,
    // so 1,478 rows falling to 12 passes it while the published percentage
    // changes underneath.
    const failures = await checkMappingCountsStable(
      countingClient(
        { iso27001: 'general-iso-27001-2022', soc2: 'general-aicpa-tsc-2017' },
        { 'general-iso-27001-2022': 12, 'general-aicpa-tsc-2017': 80 },
        396,
      ),
      'v-current',
      BASE,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].framework).toBe('iso27001');
    expect(failures[0].reason).toContain('316');
    expect(failures[0].reason).toContain('12');
  });

  it('fails when the catalogue total moved even if every framework held', async () => {
    const failures = await checkMappingCountsStable(
      countingClient(
        { iso27001: 'general-iso-27001-2022', soc2: 'general-aicpa-tsc-2017' },
        { 'general-iso-27001-2022': 316, 'general-aicpa-tsc-2017': 80 },
        70000,
      ),
      'v-current',
      BASE,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].framework).toBe('(catalogue)');
    expect(failures[0].reason).toContain('70000');
  });

  it('skips every count when the catalogue version has moved, and says so', async () => {
    // Spec §7. Counts taken against a different catalogue measure nothing, and
    // nine arithmetic failures would bury the one fact that matters.
    const failures = await checkMappingCountsStable(
      countingClient({ iso27001: 'general-iso-27001-2022' }, { 'general-iso-27001-2022': 999 }),
      'v-moved',
      BASE,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatch(/skipped/i);
    expect(failures[0].reason).toContain('v-current');
    expect(failures[0].reason).toContain('v-moved');
  });

  it('turns an uncurated local code into one failure instead of throwing', async () => {
    const failures = await checkMappingCountsStable(
      countingClient({ soc2: 'general-aicpa-tsc-2017' }, { 'general-aicpa-tsc-2017': 80 }, 396),
      'v-current',
      BASE,
    );
    expect(failures.some((f) => f.framework === 'iso27001')).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/unit/spine/invariants.test.ts -t "moves without reaching zero"`

Expected: FAIL. `checkMappingCountsStable` does not resolve from `@/lib/spine/invariants`.

- [ ] **Step 4: Write the minimal implementation**

Append to `src/lib/spine/invariants.ts`, and add the import at the top of the file:

```ts
import { CATALOGUE_BASELINE } from '@/lib/spine/baseline';
```

```ts
export interface CountInvariantFailure {
  framework: string;
  reason: string;
}

/**
 * Whether the catalogue still holds what it held when someone last measured.
 *
 * checkOfferedFrameworksResolve asks a binary question — does this framework
 * match any row at all — and soc2 falling from 1,478 rows to 12 answers yes
 * while the percentage on the screen moves. This check compares against a
 * number a person wrote down.
 *
 * Counts are exact. Never count by reading pages: PostgREST gives no stable row
 * order between two range() calls without .order(), so an unordered paged read
 * skips and repeats rows. That is not hypothetical — it reported TX-LEVEL-2 at
 * zero while this was being designed, against a true count of 366.
 *
 * When the catalogue version has moved, every count is skipped and the skip is
 * the single failure returned. A count taken against a different catalogue is
 * not a measurement of anything, and eight or nine of them would bury the one
 * fact worth reading: the catalogue moved.
 */
export async function checkMappingCountsStable(
  client: unknown,
  scfVersionId: string,
  baseline: typeof CATALOGUE_BASELINE = CATALOGUE_BASELINE,
): Promise<CountInvariantFailure[]> {
  if (baseline.scfVersionId !== scfVersionId) {
    return [
      {
        framework: '(catalogue)',
        reason:
          `count checks skipped: the baseline was measured against catalogue version ` +
          `${baseline.scfVersionId}, and the version in force is ${scfVersionId}. ` +
          `Re-measure with exact counts and commit the new numbers in ` +
          `src/lib/spine/baseline.ts, stating what moved.`,
      },
    ];
  }

  const db = client as {
    from: (t: string) => {
      select: (c: string, o?: unknown) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => Promise<{ count: number | null; error: { message: string } | null }>;
        } & PromiseLike<{ count: number | null; error: { message: string } | null }>;
      };
    };
  };

  const failures: CountInvariantFailure[] = [];

  const totalQuery = await db
    .from('scf_control_mappings')
    .select('*', { count: 'exact', head: true })
    .eq('scf_version_id', scfVersionId);

  if (totalQuery.error) {
    failures.push({ framework: '(catalogue)', reason: `total count failed: ${totalQuery.error.message}` });
  } else if ((totalQuery.count ?? 0) !== baseline.totalMappings) {
    failures.push({
      framework: '(catalogue)',
      reason:
        `catalogue holds ${totalQuery.count ?? 0} mapping rows in version ${scfVersionId}; ` +
        `the baseline records ${baseline.totalMappings}. Either the vendor re-imported or ` +
        `our walk is incomplete, and those call for different work.`,
    });
  }

  for (const [localCode, expected] of Object.entries(baseline.byFramework)) {
    let slug: string;
    try {
      slug = await resolveVendorFrameworkCode(localCode, client as never);
    } catch (err) {
      failures.push({
        framework: localCode,
        reason: `no curated vendor identity: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const { count, error } = await db
      .from('scf_control_mappings')
      .select('*', { count: 'exact', head: true })
      .eq('scf_version_id', scfVersionId)
      .eq('framework_code', slug);

    if (error) {
      failures.push({ framework: localCode, reason: `count failed for "${slug}": ${error.message}` });
      continue;
    }

    const observed = count ?? 0;
    if (observed !== expected) {
      failures.push({
        framework: localCode,
        reason:
          `"${slug}" holds ${observed} mapping rows in version ${scfVersionId}; the baseline ` +
          `records ${expected}. Any figure projected for ${localCode} has moved by the same ` +
          `amount, silently.`,
      });
    }
  }

  return failures;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/spine/invariants.test.ts -t "moves without reaching zero"`

Expected: PASS, 5 tests.

- [ ] **Step 6: Run the whole file and the typechecker**

Run: `npx vitest run tests/unit/spine/invariants.test.ts && npm run typecheck`

Expected: all tests in the file pass, `tsc --noEmit` clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/spine/baseline.ts src/lib/spine/invariants.ts tests/unit/spine/invariants.test.ts
git commit -F - <<'MSG'
feat(spine): eight counts a person wrote down, and the check that reads them

checkOfferedFrameworksResolve asks whether a framework matches any row at all.
soc2 falling from 1,478 mappings to twelve answers yes, and the percentage on
the screen moves anyway. This compares against a number someone measured.

The baseline lives in the repository rather than the database so that changing
it is a commit signed by a person with a reason, which is what
framework_identity_curation already requires of an identity. Deriving it from
the previous catalogue version was measurably wrong: both versions are retained,
but the older rows carry the phrase form of framework_code, so all eight curated
slugs count zero against them -- a version-to-version check would compare the
break against the break, permanently.

When the catalogue version moves, the counts are skipped and the skip is the one
failure returned. Counts against a different catalogue measure nothing, and nine
of them would bury the fact that the catalogue moved.

Counts are exact, never paginated. An unordered paged read reported TX-LEVEL-2
at zero mappings while this was being designed; the true count is 366.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 3: Wire both checks into the daily cron

Neither check runs until the route calls it. This is a separate task because a reviewer could accept the checks and still object to how they surface.

**Files:**
- Modify: `src/app/api/cron/spine-invariants/route.ts:34-37`

**Interfaces:**
- Consumes: `checkCurationVersionCurrent` and `checkMappingCountsStable` from Task 1 and Task 2.
- Produces: nothing further.

- [ ] **Step 1: Extend the import**

In `src/app/api/cron/spine-invariants/route.ts`, replace:

```ts
import { checkOfferedFrameworksResolve, checkAnnexMappingsResolve } from '@/lib/spine/invariants';
```

with:

```ts
import {
  checkOfferedFrameworksResolve,
  checkAnnexMappingsResolve,
  checkCurationVersionCurrent,
  checkMappingCountsStable,
} from '@/lib/spine/invariants';
```

- [ ] **Step 2: Spread the two new results**

Replace:

```ts
  const failures = [
    ...(await checkOfferedFrameworksResolve(admin, scfVersionId)),
    ...(await checkAnnexMappingsResolve(admin, scfVersionId)),
  ];
```

with:

```ts
  // checkMappingCountsStable compares the baseline's version against the one in
  // force and returns a single "skipped" entry when they differ, so the order
  // of these four is presentational rather than load-bearing.
  const failures = [
    ...(await checkOfferedFrameworksResolve(admin, scfVersionId)),
    ...(await checkCurationVersionCurrent(admin, scfVersionId)),
    ...(await checkMappingCountsStable(admin, scfVersionId)),
    ...(await checkAnnexMappingsResolve(admin, scfVersionId)),
  ];
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`

Expected: no errors. The `failures` array now holds four failure shapes; all four are `{ ...: string; reason: string }` objects and serialise cleanly, so no type annotation is needed.

- [ ] **Step 4: Run the full unit suite**

Run: `npm run test:unit`

Expected: PASS. No existing test asserts the shape of this route's response, so nothing should break; if something does, it is a real regression and must be understood before continuing.

- [ ] **Step 5: Verify against the live database**

The eight identities all carry `decided_against_version = 826a1f05-f065-4feb-9f44-ced8019a6701`, which is the version in force, and the eight baseline counts were measured the same day. A correct implementation therefore reports **zero failures** right now.

Run the dev server and call the route with the configured secret:

```bash
npm run dev
# in another shell:
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/spine-invariants
```

Expected: HTTP 200 and `{"scfVersionId":"826a1f05-f065-4feb-9f44-ced8019a6701","failures":[]}`.

If any failure appears, do not adjust the baseline to silence it. A failure here means either the implementation is wrong or something really has moved since 2026-09-09 — and telling those apart is the whole point of the check. Report it rather than editing `baseline.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/spine-invariants/route.ts
git commit -F - <<'MSG'
feat(spine): the two new checks now run daily alongside the two that existed

A check nothing calls is a comment. Both new invariants join the cron that
already returns 500 with its failures rather than a reassuring 200.

Verified against the live database: all eight identities were decided against
the catalogue in force and all eight counts match what was measured on
2026-09-09, so the route reports zero failures today. That green is the baseline
the next vendor change will be read against.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

## Self-Review

**Spec coverage.** §4 baseline → Task 2 Step 1. §5 `checkCurationVersionCurrent` → Task 1. §6 `checkMappingCountsStable`, exact counts → Task 2. §7 ordering → Task 2 Step 4, via the function's own version guard, tested at Task 2 Step 2 case 4. §10 the three named test cases → Task 1 (baseline matches, count differs is Task 2, version differs is Task 2 case 4). §3 warn-do-not-hide → Task 3 leaves the route's 500-with-failures behaviour untouched and adds no UI change. §8 out-of-scope items → no task, correctly.

**Placeholders.** None. Every code step carries the code.

**Type consistency.** `VersionInvariantFailure` and `CountInvariantFailure` both use `{ framework, reason }`, matching the existing `InvariantFailure`. `CATALOGUE_BASELINE.byFramework` is typed `Record<string, number>` so the test's `BASE` literal is assignable to `typeof CATALOGUE_BASELINE`. `resolveVendorFrameworkCode(localCode, client as never)` matches the cast used by `checkOfferedFrameworksResolve` at `invariants.ts:42`.

**One known rough edge, called out rather than hidden.** The structural type for `db.from().select().eq()` in Task 2 must be both awaitable (the version-only total) and further chainable (the per-framework count). It is written as an intersection with `PromiseLike`. If `tsc` rejects it, the honest fix is two separate narrow casts — one for the total query, one for the per-framework query — not an `any`. The test double models both shapes, so the tests will hold either way.
