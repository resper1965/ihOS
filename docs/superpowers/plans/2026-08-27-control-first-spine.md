# Control-First Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the vendor's SCF control catalogue the single spine of assessment, persist it and its official crosswalk locally, and put every framework number behind an explicit, versioned curation policy.

**Architecture:** One engine, not two. The SCF catalogue (~1,468 controls, live, `scf:read`) replaces the committed `iso27001-annex-a.json`. Each control's official mappings are fetched once and persisted, carrying `relationship_type`, `relationship_strength`, `is_official` and `is_synthetic` from the vendor. A framework score becomes a *projection*: local evidence verdicts per control, joined to persisted mappings, filtered by a curation policy that decides what a relationship type contributes. The policy is code, versioned, and stamped onto every score it produces.

**Tech Stack:** Next.js 16 App Router, TypeScript 5 strict, Supabase (Postgres + pgvector), Vitest.

**Spec:** None. This plan is written directly from measured API behaviour recorded in `docs/standard-api/CONTRACT_AUDIT.md` §H (added by Task 0) and from the product framing agreed in conversation on 2026-08-27: *"quando penso, não penso no standard e sim no controle"* and *"precisa de curadoria"*. **A plan without a spec makes its rulings provisional** — Task 0 exists to close that gap before any code is written.

---

## Global Constraints

Every value below was measured against the live API on 2026-08-27, not read from the OpenAPI document. Where the document and the API disagree, the API wins.

- **UUIDs are NOT stable across SCF versions.** Vendor-confirmed 2026-08-27, from their schema: `scf_controls`, `scf_frameworks` and `scf_mappings` all use `id uuid defaultRandom()` with the real uniqueness on `(scf_version_id, <business key>)`. A new row is minted per version, so `control_id`, `framework_id` and the mapping row's own `id` **all rotate on a version bump**. Their words: *"the UUID is a row identity, not a control identity."* **Every persisted key in this plan is therefore `(scf_version_id, control_code)` or equivalent — never a bare UUID.** This is the single most consequential constraint here and it invalidated the first draft of Task 1.
- **Rate limit: 120 requests per 60 seconds.** Headers `x-ratelimit-limit: 120`, `x-ratelimit-reset: 60`. The crosswalk walk must throttle and must be resumable. The vendor will raise the limit for our key during a window we name — ask before a full load rather than absorbing 13 minutes of budget.
- **Controls have a bulk export; mappings do not.** `GET /scf/versions/{id}/controls` with `Accept: application/x-ndjson` streams the entire catalogue in **one request**. That is also the only way to learn the catalogue's size — count the lines; there is no total count and the vendor has said they are not adding one. For mappings, per-control walking is the only path today (~1,468 requests); no bulk export and no changed-since delta exists, though the vendor is building the former and declined to give a date.
- **`limit` caps at 100** on the JSON form. Cursor pagination is the correct walk: send `?after=` **present but empty** to enter cursor mode, then follow `pagination.next_cursor`. Until 2026-08-27 the route selected its response shape by reading the *value* of `after`, so a cold start always fell into the legacy offset shape and `pagination` was unreachable — which is why an earlier draft of this plan recorded `pagination` as absent. It is not absent; it was unenterable. Fix pending merge on their side.
- **Any `relationship_strength` of exactly `0.500` already ingested is unverified.** The vendor's seeding code was `(parseFloat(row.relationship_strength) || 0.5).toFixed(3)`, so a source value that failed to parse became a confident-looking `0.500` indistinguishable from a measured one. Their fix keeps unparseable values null and omits the field. **Re-read mappings after that ships**, and until then treat `0.500` as "unquantified", never as a measurement.
- **An empty `scf_framework_id` is a bug, not a signal.** It was hardcoded `scf_framework_id: "", // resolved at service layer via requirement` and never resolved, which also made their own framework-filtered queries return nothing. Task 3's drop rule was built on the opposite premise and must be revisited once their fix is live — as written it discards legitimate rows.
- **Frameworks are addressed by UUID, never by code.** `/scf/frameworks/{frameworkId}/coverage` and `/scf/cross-mapping/{a}/{b}` reject `iso27001` with `400 Invalid UUID format for parameter: frameworkId`.
- **The vendor's `framework_code` is a human string, not a slug** — e.g. `"AICPA TSC 2017:2022 (used for SOC 2)"`, `"AICPA Privacy Management Framework (PMF)"`. There are **272** frameworks. Our own codes (`iso27001`, `soc2`, `BR-LGPD`, …) are ours and address nothing on their side.
- **`relationship_type` vocabulary is exactly:** `"equal" | "subset" | "intersects" | "superset" | "no_relation"`. `relationship_strength` is a decimal string (observed `"0.500"`).
- **Never write a number a policy cannot explain.** Constitution Principle VIII. In this plan that hardens into: no framework score may be persisted without the id of the curation policy version that produced it.
- **Absence of a permission clause in the OpenAPI document does not mean a route is open.** `/regulations` documented no permission and returned `403`. Reachability is established by calling, never by reading. The vendor traced this to an empty permission list failing closed in both directions — no RBAC runs so any human session passes, while the M2M scope check denies every API key because required scopes are *derived from* permissions. **91 read routes were in that state.** All now declare a permission, and the static catalogue (`/regulations` and its sub-resources) takes `scf:read`, which our key already holds. Only `GET /users/me` and `DELETE /auth/sessions/others` remain permission-free by design.
- **Run commands as:** `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && <command>")`.

---

## Why this plan exists

The product has two assessment engines and neither produces a defensible number.

`engine.ts` fetches the real SCF catalogue, evaluates every control against the organisation's documents by RAG, builds `implementedControlIds` — and then, at `:576`, throws the result at `POST /intelligence/compliance-score` to be converted into a percentage. That endpoint returns 403. The catch at `:589` writes `score: 0, totalRequired: 0` for every framework. Phase 3 is not mode-gated, so this happens on every run, quick or deep. The `isScoreBacked` guard now stops those zeros reaching the dashboard, which is why the product currently produces nothing rather than producing a lie.

`local-engine.ts` needs no vendor scoring at all — but it starts from the wrong end. Its control set is `data/iso27001-annex-a.json`, 93 hand-maintained ISO Annex A controls: a local duplicate of a catalogue we do not own. Because it starts from ISO controls rather than SCF controls, it must guess an SCF code for each one, and when the guess fails it substitutes a hardcoded default (`local-engine.ts:99`, `scfCodes[0] || 'GOV-01.3'`). That fallback is not an isolated defect; it is the direct consequence of choosing the wrong spine.

Meanwhile the asset both engines needed has been reachable the whole time. `GET /scf/controls/{controlId}/mappings` returns **200** with the current key and gave **65 official mappings** for a single control, each carrying `relationship_type`, `relationship_strength`, `mapping_source: "official_scf"`, `is_official: true` and `is_synthetic: false`. Four crosswalk endpoints require only `scf:read`, granted in the first vendor round. The single crosswalk endpoint that is blocked — `POST /intelligence/cross-coverage` — is the computed convenience, not the raw data.

This matters beyond convenience. The 25,589 mapping rows quarantined in `20260825000002` were fabricated by string-prefixing one framework's ids into another's. The vendor's own mapping records carry an `is_synthetic` boolean. Had the product consumed this endpoint from the start, that fabrication would have had nowhere to hide: the data states its own provenance.

**And the crosswalk is still not an answer.** A mapping of type `intersects` at strength `0.500` does not say whether the control satisfies the requirement. Deciding that is GRC judgement. Counting it automatically would reproduce the fabrication in better clothing — a number that looks derived while resting on a rule we invented and never wrote down. The curation layer is therefore not a nicety bolted onto the load; it is the part of this system that carries the product's value, and Task 4 exists before Task 5 for that reason.

---

## File Structure

| File | Responsibility |
|---|---|
| `docs/superpowers/specs/2026-08-27-control-first-design.md` | **Create.** The spec this plan argues from (Task 0). |
| `supabase/migrations/20260828000001_control_spine.sql` | **Create.** `scf_controls_cache`, `scf_framework_catalog`, `scf_control_mappings`, `framework_identity_curation`. |
| `src/lib/standard-api/sync/throttle.ts` | **Create.** One rate-limit governor: 120/60s, resumable, header-aware. |
| `src/lib/standard-api/sync/catalog.ts` | **Create.** Paginate the SCF catalogue into `scf_controls_cache`. |
| `src/lib/standard-api/sync/crosswalk.ts` | **Create.** Walk each control's mappings into `scf_control_mappings`. |
| `src/lib/assessment/curation/policy.ts` | **Create.** The versioned relationship→contribution policy. The only place that decides what counts. |
| `src/lib/assessment/projection.ts` | **Create.** Framework score as a projection over verdicts × mappings × policy. |
| `src/lib/assessment/engine.ts` | **Modify.** Delete Phase 3's `complianceScore` call and its zero-writing catch; call the projection. |
| `src/lib/assessment/local-engine.ts` | **Modify, then retire.** Point at the catalogue; delete the `GOV-01.3` fallback. |
| `src/app/api/admin/sync/scf/route.ts` | **Create.** Operator-triggered sync, admin-gated, reports progress. |

---

### Task 0: Write the spec this plan is missing

Every other task in this plan is an argument from a design nobody has written down or approved. This plan was composed straight from probe output during a conversation. That is enough to start engineering from, and not enough to make rulings against.

**Files:**
- Create: `docs/superpowers/specs/2026-08-27-control-first-design.md`

- [ ] **Step 1: Record the measured API contract as §H of the audit**

Append to `docs/standard-api/CONTRACT_AUDIT.md` a section H containing every value in this plan's Global Constraints, each with the observation that produced it (endpoint, HTTP status, trace_id where available). This is the evidence base; the spec cites it rather than restating it.

- [ ] **Step 2: Write the design document**

It must state, in prose an auditor could follow: the control is the unit; the framework is a projection; the crosswalk is raw material; the curation policy is a product decision with a version and an owner. It must name what this design deliberately does NOT do — it does not compute a vendor-comparable score, because the vendor's `complianceScore` may weight requirements in ways we cannot observe.

- [ ] **Step 3: Get the spec approved before Task 1**

This is a genuine stop. The curation policy in Task 4 encodes a compliance judgement that will appear on customer-facing numbers, and the framework identity decisions in Task 1 are the exact surface where fabrication entered last time. Neither is an engineering call.

---

### Task 1: Framework identity, curated — not guessed

Our codes address nothing. There are 272 vendor frameworks and 7 of ours. The join between them is the surface where 25,589 fabricated rows were born, so it is built as curated data with provenance, never as a derived string transform.

**Files:**
- Create: `supabase/migrations/20260828000001_control_spine.sql` (the `framework_identity_curation` table and catalogue table)
- Create: `src/lib/standard-api/sync/catalog.ts` (framework catalogue portion)
- Test: `tests/unit/spine/framework-identity.test.ts`

**Interfaces:**
- Produces: `syncFrameworkCatalog(): Promise<{ inserted: number; total: number }>`, table `scf_framework_catalog(framework_id uuid pk, framework_code text, framework_name text, is_synthetic bool, status text, synced_at timestamptz)`, table `framework_identity_curation(local_code text pk, framework_id uuid null, decided_by text, decided_at timestamptz, rationale text, confidence text check (confidence in ('exact','probable','rejected','undecided')))`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260828000001_control_spine.sql'),
  'utf8',
);

describe('framework identity is curated, never derived', () => {
  it('records who decided each mapping and how confident they were', () => {
    expect(sql).toMatch(/framework_identity_curation/);
    expect(sql).toMatch(/decided_by/);
    expect(sql).toMatch(/rationale/);
    expect(sql).toMatch(/confidence\s+text\s+check/i);
  });

  it('admits an undecided local code rather than forcing a guess', () => {
    // A local code with no defensible vendor counterpart must be storable as
    // undecided. The alternative — omitting the row — is what let fabricated
    // mappings look like an absence of data rather than a decision not made.
    expect(sql).toMatch(/vendor_framework_code\s+text\s+null/i);
    expect(sql).toMatch(/'undecided'/);
  });

  it('never derives a vendor identifier from a local code', () => {
    // No string transform anywhere in the migration: no replace, no concat,
    // no prefix arithmetic on framework codes. That is precisely how the
    // 25,589 quarantined rows were manufactured.
    expect(sql).not.toMatch(/replace\s*\(\s*framework_code/i);
    expect(sql).not.toMatch(/framework_code\s*\|\|/);
  });

  it('keys nothing on a vendor UUID, because vendor UUIDs rotate per version', () => {
    // Vendor-confirmed: scf_controls / scf_frameworks / scf_mappings all use
    // `id uuid defaultRandom()` and mint a new row per SCF version. A UUID
    // primary key here would break every reference on a version bump, and in
    // framework_identity_curation it would silently destroy human decisions.
    // scf_version_id IS legitimately part of a key — it is the version scope
    // that makes a business code unique. What must never appear in a key is a
    // rotating row identity. Those are named *_uuid by convention here
    // precisely so this assertion can be written.
    const pkLines = sql.match(/PRIMARY KEY\s*\([^)]*\)/gi) ?? [];
    expect(pkLines.length).toBeGreaterThanOrEqual(4);
    for (const pk of pkLines) {
      expect(pk).not.toMatch(/_uuid/i);
    }
    expect(sql).not.toMatch(/REFERENCES\s+public\.scf_framework_catalog/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/spine/framework-identity.test.ts")`
Expected: FAIL — the migration file does not exist (`ENOENT`).

- [ ] **Step 3: Write the migration**

```sql
-- Migration 20260828000001: the control-first spine.
--
-- Four tables. Three are caches of vendor data and may be dropped and
-- rebuilt at will. The fourth, framework_identity_curation, is the only one
-- holding human judgement and must never be rebuilt from a transform.

-- Vendor-confirmed 2026-08-27: every UUID this API returns for a control, a
-- framework or a mapping row is minted per SCF version and rotates on a
-- version bump. Their words: "the UUID is a row identity, not a control
-- identity." So no UUID is a primary key anywhere below. UUIDs are stored as
-- attributes — they are needed to address the API within a version — and the
-- keys are the business identifiers that survive.

CREATE TABLE IF NOT EXISTS public.scf_framework_catalog (
  scf_version_id uuid  NOT NULL,
  framework_code text  NOT NULL,
  framework_uuid uuid  NOT NULL,          -- valid ONLY within scf_version_id
  framework_name text  NOT NULL,
  is_synthetic   boolean NOT NULL DEFAULT false,
  status         text  NOT NULL,
  synced_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scf_version_id, framework_code)
);

COMMENT ON COLUMN public.scf_framework_catalog.framework_uuid IS
  'The UUID to put in a URL path. Rotates per SCF version — never store it as '
  'a foreign key and never persist it outside a row that also names the version.';

COMMENT ON TABLE public.scf_framework_catalog IS
  'Mirror of GET /api/v1/scf/frameworks. 272 rows as of 2026-08-27. '
  'framework_code is the vendor human string (e.g. "AICPA TSC 2017:2022 '
  '(used for SOC 2)") and is NOT one of our slugs. Safe to truncate and re-sync.';

-- The judgement table. Our slugs on the left, the vendor's framework on the
-- right, a named human in the middle.
--
-- The first draft of this plan had `framework_id uuid REFERENCES ...` here.
-- That was wrong in the worst possible place: this is the one table that holds
-- human decisions and must never be rebuilt from a transform, and it would
-- have had every row's foreign key break on an SCF version bump — silently
-- orphaning curation work with no way to tell which decision had been lost.
-- It keys on framework_code, which survives versions.
--
-- vendor_framework_code stays nullable on purpose: "we looked and could not
-- defensibly decide" is a real, recordable answer, and it is the answer the
-- 25,589 fabricated rows should have carried instead of a manufactured id.
CREATE TABLE IF NOT EXISTS public.framework_identity_curation (
  local_code            text PRIMARY KEY,
  vendor_framework_code text NULL,
  confidence   text NOT NULL CHECK (confidence IN ('exact','probable','rejected','undecided')),
  decided_by   text NOT NULL,
  decided_at   timestamptz NOT NULL DEFAULT now(),
  decided_against_version uuid NOT NULL,  -- which SCF version the human was looking at
  rationale    text NOT NULL
);

COMMENT ON TABLE public.framework_identity_curation IS
  'Which vendor framework each of our local codes means. Populated by a '
  'human, never by a string transform. Migration 20260825000002 quarantined '
  '25,589 rows manufactured by prefixing one framework''s control ids into '
  'another''s; this table is the structural answer to that. Deliberately has '
  'no FK: framework_code is stable, and a hard reference would make a vendor '
  'version bump destroy curation work.';

CREATE TABLE IF NOT EXISTS public.scf_controls_cache (
  scf_version_id   uuid NOT NULL,
  control_code     text NOT NULL,
  control_uuid     uuid NOT NULL,         -- valid ONLY within scf_version_id
  control_title    text NOT NULL,
  control_description text,
  scf_domain_uuid  uuid,
  status           text NOT NULL,
  is_synthetic     boolean NOT NULL DEFAULT false,
  synced_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scf_version_id, control_code)
);

CREATE TABLE IF NOT EXISTS public.scf_control_mappings (
  scf_version_id           uuid NOT NULL,
  control_code             text NOT NULL,
  requirement_code         text NOT NULL,
  framework_code           text,
  mapping_uuid             uuid,          -- row identity, rotates per version
  requirement_uuid         uuid,          -- rotates per version
  relationship_type        text NOT NULL
    CHECK (relationship_type IN ('equal','subset','intersects','superset','no_relation')),
  relationship_strength    numeric NULL,
  strength_is_trustworthy  boolean NOT NULL DEFAULT true,
  mapping_source           text,
  is_official              boolean NOT NULL DEFAULT false,
  is_synthetic             boolean NOT NULL DEFAULT false,
  synced_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scf_version_id, control_code, requirement_code)
);

-- Until the vendor's fix ships, a stored strength of exactly 0.500 may be a
-- parse failure dressed as a measurement: their seeding did
-- `(parseFloat(row.relationship_strength) || 0.5).toFixed(3)`. The sync sets
-- this false for any 0.500 ingested before that fix is live, so a later
-- re-read can find them and no projection can mistake one for a real value.
COMMENT ON COLUMN public.scf_control_mappings.strength_is_trustworthy IS
  'False where relationship_strength may be the vendor''s pre-2026-08-27 '
  'parse-failure default of 0.500 rather than a measurement.';

CREATE INDEX IF NOT EXISTS scf_control_mappings_control_idx
  ON public.scf_control_mappings (scf_control_id);
CREATE INDEX IF NOT EXISTS scf_control_mappings_rel_idx
  ON public.scf_control_mappings (relationship_type);

-- The CHECK above is load-bearing beyond validation: if the vendor adds a
-- sixth relationship type, the sync fails loudly instead of silently
-- persisting a value the curation policy has no rule for.
COMMENT ON COLUMN public.scf_control_mappings.relationship_type IS
  'Vendor vocabulary, exactly five values as of 2026-08-27. A new value must '
  'break the sync, because src/lib/assessment/curation/policy.ts decides what '
  'each one contributes and cannot decide for a type it has never seen.';
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/spine/framework-identity.test.ts")`
Expected: PASS, 3 tests.

- [ ] **Step 5: Implement the catalogue sync for frameworks**

`syncFrameworkCatalog()` in `src/lib/standard-api/sync/catalog.ts`: page `GET /scf/frameworks?scf_version={id}&limit=100` through the throttle from Task 2, upsert on `framework_id`. Stop when a page returns fewer than 100 rows — **not** when `pagination.has_more` is false, because the live response omits `pagination` entirely.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260828000001_control_spine.sql src/lib/standard-api/sync/catalog.ts tests/unit/spine/framework-identity.test.ts
git commit -m "feat(spine): framework identity as curated data, not a string transform"
```

---

### Task 2: The throttle, and the catalogue behind it

Every later task issues hundreds of requests against a 120/60s budget. The governor is built first and used by all of them, because a sync that discovers the limit by being rejected has already lost its place.

**Files:**
- Create: `src/lib/standard-api/sync/throttle.ts`
- Modify: `src/lib/standard-api/sync/catalog.ts` (controls portion)
- Test: `tests/unit/spine/throttle.test.ts`

**Interfaces:**
- Produces: `createThrottle(opts?: { perWindow?: number; windowMs?: number }): { run<T>(fn: () => Promise<T>): Promise<T> }` and `syncControlCatalog(scfVersionId: string, onProgress?: (n: number) => void): Promise<{ synced: number; pages: number }>`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createThrottle } from '@/lib/standard-api/sync/throttle';

describe('the throttle respects a 120-per-60s budget', () => {
  it('serialises past the budget instead of bursting through it', async () => {
    vi.useFakeTimers();
    const t = createThrottle({ perWindow: 3, windowMs: 1000 });
    const done: number[] = [];
    const calls = Array.from({ length: 5 }, (_, i) =>
      t.run(async () => { done.push(i); return i; }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveLength(3);          // budget spent, two held back
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(calls);
    expect(done).toHaveLength(5);
    vi.useRealTimers();
  });

  it('honours a Retry-After the server sends rather than its own arithmetic', async () => {
    // Our window accounting is an approximation of the server's. When the
    // server contradicts it, the server is right.
    const t = createThrottle({ perWindow: 100, windowMs: 60_000 });
    let attempts = 0;
    const result = await t.run(async () => {
      attempts++;
      if (attempts === 1) {
        const e = new Error('429') as Error & { status?: number; retryAfterMs?: number };
        e.status = 429; e.retryAfterMs = 5;
        throw e;
      }
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/spine/throttle.test.ts")`
Expected: FAIL — cannot resolve `@/lib/standard-api/sync/throttle`.

- [ ] **Step 3: Implement the throttle**

A sliding window of request timestamps, `perWindow` default 110 (not 120 — leave headroom, the app makes other calls against the same key), `windowMs` default 60_000. On a thrown error carrying `status === 429`, wait `retryAfterMs` (or the `retry-after` header, seconds → ms) and retry once. Read `x-ratelimit-remaining` when present and narrow the local window to match it; the server's count is authoritative.

- [ ] **Step 4: Run the test and watch it pass**

Expected: PASS, 2 tests.

- [ ] **Step 5: Implement `syncControlCatalog` over the NDJSON stream**

One request, not fifteen: `GET /scf/versions/{scfVersionId}/controls` with header `Accept: application/x-ndjson` streams the whole catalogue (the vendor fetches it server-side in batches of 50). Parse line by line and upsert into `scf_controls_cache` on `(scf_version_id, control_code)`.

Counting the lines is also the **only** way to learn the catalogue's size — the vendor has confirmed there is no total count and that they are not adding one. Log the count reached; do not assert it equals 1,468, which is an observation from 2026-08-27 and not a contract.

Keep a JSON fallback path behind the same function for the case where the NDJSON content type is refused, and make it use cursor pagination correctly: send `?after=` **present but empty** to enter cursor mode, then follow `pagination.next_cursor`. Sending no `after` at all drops into the legacy offset shape where `pagination` never appears — that was a vendor bug, fixed 2026-08-27, and the plan records it because a fallback written against the old behaviour would silently paginate wrong.

- [ ] **Step 6: Commit**

```bash
git add src/lib/standard-api/sync/throttle.ts src/lib/standard-api/sync/catalog.ts tests/unit/spine/throttle.test.ts
git commit -m "feat(spine): rate-limit governor, and the control catalogue behind it"
```

---

### Task 3: Walk the official crosswalk into local storage

~1,468 controls × one request each ≈ 13 minutes at the measured budget. It must be resumable: a run that dies at control 900 resumes at 900, not at 1.

**Files:**
- Create: `src/lib/standard-api/sync/crosswalk.ts`
- Test: `tests/unit/spine/crosswalk-sync.test.ts`

**Interfaces:**
- Consumes: `createThrottle` (Task 2), `scf_controls_cache` (Task 2).
- Produces: `syncCrosswalk(opts?: { resumeAfterControlCode?: string }): Promise<{ controlsWalked: number; mappingsStored: number; skippedSelfReferential: number }>`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { classifyMapping } from '@/lib/standard-api/sync/crosswalk';

describe('crosswalk rows are stored with their provenance intact', () => {
  it('keeps relationship type and strength rather than flattening to a boolean', () => {
    const row = classifyMapping({
      id: '8a67296a-e0da-40fb-931c-5b3efb35447d',
      scf_control_id: '653a70ef-16fd-4d53-a637-ff61cd998729',
      control_code: 'AAT-01',
      relationship_type: 'intersects',
      relationship_strength: '0.500',
      mapping_source: 'official_scf',
      is_official: true,
      is_synthetic: false,
      framework_code: 'ISO 27001:2022',
      scf_framework_requirement_id: 'f184e38f-ea53-435a-99ea-cdcd5b04960f',
    });
    expect(row.store).toBe(true);
    expect(row.value?.relationship_type).toBe('intersects');
    expect(row.value?.relationship_strength).toBe(0.5);
    expect(row.value?.is_official).toBe(true);
  });

  it('drops SCF-to-SCF rows on framework_code alone, never on an empty id', () => {
    // The first draft dropped rows where scf_framework_id was "". The vendor
    // has since confirmed that field was hardcoded `scf_framework_id: ""` and
    // never resolved — a bug, not a signal, and one that also made their own
    // framework-filtered queries return nothing. Dropping on it would discard
    // legitimate mappings wholesale.
    //
    // The catalogue-mapped-onto-itself case is real and still worth dropping,
    // but it is identified by framework_code, which is populated.
    const selfRef = classifyMapping({
      control_code: 'AAT-01', requirement_code: 'r',
      relationship_type: 'equal', relationship_strength: '1.000',
      framework_code: 'Secure Controls Framework (SCF)',
      is_official: true, is_synthetic: false,
    });
    expect(selfRef.store).toBe(false);
    expect(selfRef.reason).toBe('self_referential');

    const emptyId = classifyMapping({
      control_code: 'AAT-01', requirement_code: 'r',
      relationship_type: 'equal', relationship_strength: '1.000',
      framework_code: 'ISO 27001:2022',
      scf_framework_id: '',
      is_official: true, is_synthetic: false,
    });
    expect(emptyId.store).toBe(true);
  });

  it('flags a 0.500 strength as untrustworthy rather than storing it as fact', () => {
    // The vendor's seeding was
    //   (parseFloat(row.relationship_strength) || 0.5).toFixed(3)
    // so an unparseable source value became a confident 0.500 indistinguishable
    // from a measurement. Until their fix is live, every 0.500 is suspect and
    // must be findable later for a re-read.
    const r = classifyMapping({
      control_code: 'X', requirement_code: 'r', framework_code: 'ISO 27001:2022',
      relationship_type: 'subset', relationship_strength: '0.500',
      is_official: true, is_synthetic: false,
    });
    expect(r.store).toBe(true);
    expect(r.value?.strength_is_trustworthy).toBe(false);

    const ok = classifyMapping({
      control_code: 'X', requirement_code: 'r2', framework_code: 'ISO 27001:2022',
      relationship_type: 'subset', relationship_strength: '0.750',
      is_official: true, is_synthetic: false,
    });
    expect(ok.value?.strength_is_trustworthy).toBe(true);
  });

  it('refuses a relationship type it has never seen instead of storing it', () => {
    expect(() => classifyMapping({
      id: '1', scf_control_id: '2', control_code: 'X',
      relationship_type: 'partially_maybe' as never,
      is_official: true, is_synthetic: false,
    })).toThrow(/unknown relationship_type/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — cannot resolve `@/lib/standard-api/sync/crosswalk`.

- [ ] **Step 3: Implement `classifyMapping` and `syncCrosswalk`**

```typescript
const KNOWN_RELATIONSHIPS = ['equal', 'subset', 'intersects', 'superset', 'no_relation'] as const;
type Relationship = (typeof KNOWN_RELATIONSHIPS)[number];

export function classifyMapping(m: Record<string, unknown>):
  | { store: true; value: StoredMapping }
  | { store: false; reason: 'self_referential' } {
  const rel = m.relationship_type as Relationship;
  if (!KNOWN_RELATIONSHIPS.includes(rel)) {
    // Loud, not lenient. The curation policy has no rule for a type it has
    // never seen, and inventing one here is how a number stops being explainable.
    throw new Error(`unknown relationship_type: ${String(rel)}`);
  }
  const fw = typeof m.framework_code === 'string' ? m.framework_code : '';
  if (/Secure Controls Framework/i.test(fw) || m.scf_framework_id === '') {
    return { store: false, reason: 'self_referential' };
  }
  return { store: true, value: { /* … field-by-field, strength parsed to number … */ } };
}
```

`syncCrosswalk` reads control codes from `scf_controls_cache` in ascending `control_code` order, so `resumeAfterControlCode` is a simple `WHERE control_code > $1`. Each control's mappings are fetched through the throttle and upserted on `id`. Counts of stored and skipped rows are returned and logged.

- [ ] **Step 4: Run the test and watch it pass**

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/standard-api/sync/crosswalk.ts tests/unit/spine/crosswalk-sync.test.ts
git commit -m "feat(spine): walk the official crosswalk, keeping type, strength and provenance"
```

---

### Task 4: The curation policy — the only place that decides what counts

This task is why the plan exists. `intersects` at strength 0.500 is not an answer, and a system that silently treats it as one is fabricating with extra steps. The policy is explicit, versioned, and stamped onto every number it produces.

**Files:**
- Create: `src/lib/assessment/curation/policy.ts`
- Test: `tests/unit/spine/curation-policy.test.ts`

**Interfaces:**
- Produces: `CURATION_POLICY_VERSION: string`, `type Contribution = 'satisfies' | 'contributes' | 'needs_review' | 'excluded'`, `contributionOf(m: { relationship_type: Relationship; relationship_strength: number | null; is_official: boolean }): Contribution`.

**BLOCKED on a vendor answer. Do not implement this task until it arrives.**

The vendor confirmed our `intersects` decision explicitly — *"routing intersects to human review at any strength is the one we would defend"* — and then, in the same paragraph, described their own ADR-001 as capping `superset` at 0.5 and treating **`equal` and `subset`** as 1.0.

That is the opposite of this plan's first draft, which counted `equal` and `superset` as satisfying and `subset` as merely contributing. Both readings are internally coherent, and which one is right depends entirely on a convention neither party has stated:

| If the convention is… | `subset` means | `superset` means |
|---|---|---|
| control ⊆ requirement (our first draft) | control covers only part of the requirement → **contributes** | control covers the requirement and more → **satisfies** |
| requirement ⊆ control (implied by their ADR-001) | the requirement sits inside the control → **satisfies** | the control covers only part → **contributes** |

The two conventions invert which relationship types count toward a customer-facing number. Guessing has a fifty per cent chance of publishing coverage that is wrong in the direction that flatters us, which is the precise failure this codebase has spent a week removing. Asked as Q7; see `docs/standard-api/VENDOR_QUESTIONS_2026-08-27.md`.

**What is already settled and may be implemented as written:** `intersects` → `needs_review` at any strength (vendor-endorsed); `no_relation` → `excluded`; `is_official: false` → `needs_review`; a strength of `0.500` with `strength_is_trustworthy = false` must never be read as a measurement. The `equal` case is safe in both conventions — it satisfies either way.

**Still a product decision after the vendor answers:** the vendor states plainly that they are *not aware of official SCF guidance* designating which relationship types satisfy a requirement for audit purposes as opposed to relate to it. So even a correct reading of the direction convention leaves the audit judgement ours. Task 0's spec review is where that gets owned by a named person.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { contributionOf, CURATION_POLICY_VERSION } from '@/lib/assessment/curation/policy';

describe('the curation policy is explicit about what counts', () => {
  it('counts equal and superset as satisfying', () => {
    expect(contributionOf({ relationship_type: 'equal', relationship_strength: 1, is_official: true })).toBe('satisfies');
    expect(contributionOf({ relationship_type: 'superset', relationship_strength: 1, is_official: true })).toBe('satisfies');
  });

  it('never lets intersects satisfy a requirement, at any strength', () => {
    for (const s of [0.1, 0.5, 0.9, 0.99, 1]) {
      expect(contributionOf({ relationship_type: 'intersects', relationship_strength: s, is_official: true }))
        .toBe('needs_review');
    }
  });

  it('treats subset as contributing but not sufficient', () => {
    expect(contributionOf({ relationship_type: 'subset', relationship_strength: 1, is_official: true })).toBe('contributes');
  });

  it('excludes no_relation and anything unofficial', () => {
    expect(contributionOf({ relationship_type: 'no_relation', relationship_strength: 0, is_official: true })).toBe('excluded');
    // An unofficial mapping may be someone's synthetic guess. It does not
    // get to move a customer-facing number without a human saying so.
    expect(contributionOf({ relationship_type: 'equal', relationship_strength: 1, is_official: false })).toBe('needs_review');
  });

  it('carries a version, so a score can name the policy that produced it', () => {
    expect(CURATION_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — cannot resolve `@/lib/assessment/curation/policy`.

- [ ] **Step 3: Implement the policy**

Pure function, no I/O, no configuration read at runtime — a policy that can be changed by an environment variable is a policy no score can cite. Changing it means editing this file and bumping `CURATION_POLICY_VERSION`.

- [ ] **Step 4: Run the test and watch it pass**

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assessment/curation/policy.ts tests/unit/spine/curation-policy.test.ts
git commit -m "feat(curation): one explicit, versioned rule for what a mapping contributes"
```

---

### Task 5: Framework score as a projection

**Files:**
- Create: `src/lib/assessment/projection.ts`
- Modify: `src/lib/assessment/engine.ts` (delete Phase 3's vendor call, lines ~575-598)
- Test: `tests/unit/spine/projection.test.ts`

**Interfaces:**
- Consumes: `contributionOf`, `CURATION_POLICY_VERSION` (Task 4); `scf_control_mappings` (Task 3).
- Produces: `projectFramework(frameworkId: string, verdicts: Map<ControlCode, 'conforming' | 'partial' | 'gap'>): Promise<FrameworkProjection>` where `FrameworkProjection` includes `policyVersion`, `requirementsTotal`, `requirementsSatisfied`, `requirementsNeedingReview`, and `unmappedControls`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { computeProjection } from '@/lib/assessment/projection';

describe('a framework score is a projection that can explain itself', () => {
  it('reports requirements needing review separately, never folded into the score', () => {
    const p = computeProjection({
      mappings: [
        { requirementId: 'r1', controlCode: 'GOV-01', relationship_type: 'equal', relationship_strength: 1, is_official: true },
        { requirementId: 'r2', controlCode: 'GOV-02', relationship_type: 'intersects', relationship_strength: 0.5, is_official: true },
      ],
      verdicts: new Map([['GOV-01', 'conforming'], ['GOV-02', 'conforming']]),
    });
    expect(p.requirementsTotal).toBe(2);
    expect(p.requirementsSatisfied).toBe(1);
    expect(p.requirementsNeedingReview).toBe(1);
    // The number a customer sees must not silently absorb the ambiguous one.
    expect(p.score).toBeCloseTo(0.5);
  });

  it('refuses to produce a score when the denominator is zero', () => {
    const p = computeProjection({ mappings: [], verdicts: new Map() });
    expect(p.score).toBeNull();
    expect(p.reason).toBe('no_requirements_mapped');
  });

  it('stamps the policy version onto the result', () => {
    const p = computeProjection({ mappings: [], verdicts: new Map() });
    expect(p.policyVersion).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — cannot resolve `@/lib/assessment/projection`.

- [ ] **Step 3: Implement `computeProjection` and wire it into the engine**

Delete `engine.ts` lines ~575-598 entirely: both the `complianceScore` call and the catch that writes `score: 0, totalRequired: 0`. That catch is the mechanism behind the dashboard's 0% event. Replace with `projectFramework`. `score: null` propagates; the existing `isScoreBacked` guard in `assessment-to-scorecard.ts` already refuses to persist an unbacked framework, and now has a real reason to fire rather than a symptom.

- [ ] **Step 4: Run the full suite**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run")`
Expected: PASS. Existing count is 510; this task adds 3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assessment/projection.ts src/lib/assessment/engine.ts tests/unit/spine/projection.test.ts
git commit -m "feat(assessment): framework score becomes a projection that names its policy"
```

---

### Task 6: Retire the duplicate control base

**Files:**
- Modify: `src/lib/assessment/local-engine.ts`
- Delete: `src/lib/assessment/data/iso27001-annex-a.json`
- Test: `tests/unit/spine/no-duplicate-catalogue.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

describe('there is one control base, and it is the vendor catalogue', () => {
  it('no committed JSON duplicates the control catalogue', () => {
    expect(existsSync(resolve(process.cwd(), 'src/lib/assessment/data/iso27001-annex-a.json'))).toBe(false);
  });

  it('no engine substitutes a hardcoded control code when a lookup misses', () => {
    // local-engine.ts:99 was `scfCodes[0] || 'GOV-01.3'` — an unmapped Annex A
    // control was silently attributed to a default. That existed only because
    // the engine started from ISO controls and had to guess an SCF code.
    const src = readFileSync(resolve(process.cwd(), 'src/lib/assessment/local-engine.ts'), 'utf8');
    expect(src).not.toMatch(/\|\|\s*'GOV-01\.3'/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL on both — the JSON exists and the fallback is present.

- [ ] **Step 3: Repoint `local-engine.ts` at `scf_controls_cache` and delete the JSON**

The ISO-to-SCF guess disappears with the JSON: iterating `scf_controls_cache` means the control *is* an SCF control, and `scf_control_mappings` states which requirements it touches. Nothing is left to guess, so the fallback has nothing to fall back from.

- [ ] **Step 4: Run the full suite and the typecheck**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run && npx tsc --noEmit 2>&1 | grep -c 'error TS'")`
Expected: tests PASS; tsc count must not exceed the CI baseline of 198.

- [ ] **Step 5: Commit**

```bash
git rm src/lib/assessment/data/iso27001-annex-a.json
git add src/lib/assessment/local-engine.ts tests/unit/spine/no-duplicate-catalogue.test.ts
git commit -m "refactor(assessment): one control base — delete the committed duplicate and its fallback guess"
```

---

### Task 7: Operator-triggered sync

**Files:**
- Create: `src/app/api/admin/sync/scf/route.ts`
- Test: `tests/api/scf-sync.test.ts`

- [ ] **Step 1: Write the failing test** — the route must return 401 without a session, 403 for a non-admin role, and must not start a second sync while one is running.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement.** Copy the auth gate shape from `src/app/api/settings/integrations/standard-api/key/route.ts:46-61` (`getUser()` → 401, `profiles.role` not in `('admin','ionic_user')` → 403). A 13-minute sync exceeds any serverless request budget, so the route starts the work and returns a job id; progress is read back from a row, not held in the request.
- [ ] **Step 4: Run the suite.**
- [ ] **Step 5: Commit.**

---

## Self-Review

**Spec coverage.** There is no spec; Task 0 writes it and is a genuine stop before Task 1. Recorded rather than hidden.

**Placeholder scan.** Task 7's steps are one line each rather than full code, and `classifyMapping`'s return value in Task 3 Step 3 elides the field-by-field mapping. Both are thinner than this plan's own standard. Task 7 is a route whose shape is fully determined by an existing file it is told to copy; Task 3's elision is a real gap and its implementer should expect to write those fields from the payload recorded in the "Why this plan exists" section.

**Type consistency.** `Relationship` is defined in Task 3 and used in Task 4's `contributionOf` signature — it must be exported from `crosswalk.ts` and imported by `policy.ts`, or moved to a shared type module. Flagged rather than silently left to the implementer.

**Open decision this plan cannot make.** The curation policy in Task 4 is stated as an assumption with its reasoning, not as a settled requirement. It decides what customers see. Task 0 Step 3 is where it gets confirmed.

**Unresolved with the vendor.** Five questions are outstanding and recorded in `docs/standard-api/VENDOR_QUESTIONS_2026-08-27.md`. Tasks 2 and 3 are written to work without their answers — pagination terminates on a short page, the throttle assumes the observed 120/60s — but answers to Q1 and Q2 could simplify both considerably.
