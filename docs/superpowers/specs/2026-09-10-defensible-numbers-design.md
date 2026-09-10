# Defensible numbers — the score the product shows must be one it can defend

**Date:** 2026-09-10
**Status:** approved in conversation; §3.1 is an addition found while writing and is flagged for review
**Branch:** `docs/defensible-numbers`
**Builds on:** `docs/superpowers/plans/2026-08-26-no-unbacked-numbers.md` (its invariant, and its rule to scope by *sink* rather than by call site) and `.specify/memory/constitution.md` Principle VIII.

Every figure below was measured against the live database, the live Standard API
or the Vercel runtime logs on 2026-09-10. None is estimated.

---

## 1. The complaint, and why it is correct

The brief was "my hardest problem is explaining the system to new users", and the
failure mode named was: **they do not trust what they see.**

They are right not to. The help text answers *"How is the Compliance Score
calculated?"* with *"the calculated average score of the active regulatory and
discretionary controls mapped to your current baseline"* — a sentence that
explains nothing, about a number that, as §3 shows, is computed in a unit no other
screen uses, from a table this project already declared untrustworthy, by a code
path that refuses to let it go down.

Explaining that number better would make the product more persuasive about
something wrong. The number has to become defensible first. Teaching the model
(§8) comes after.

## 2. Decisions taken

| Decision | Chosen | By | Why |
|---|---|---|---|
| Where the vendor key is set | **In the application (Supabase Vault), with the Vault taking precedence for this one key** | product owner, 2026-09-10 | Vercel access is temporarily unavailable, and the key configured there is revoked. The concern — this inverts a deliberate precedence in `vault.ts` to solve a temporary access problem — was raised and the decision reaffirmed. |
| How the Overview shows scores | **One card per framework**, each naming its framework, its denominator and its policy | product owner, 2026-09-10 | No blending of different standards into one average. |

## 3. What was measured

### 3.1 Three units answering one question

The same question — *how compliant is Ionic with ISO 27001?* — is answered in three
incompatible units today:

| Where | Divides by | Source table | ISO 27001 denominator |
|---|---|---|---|
| Overview card | distinct **SCF controls** | `scf_framework_mappings` (legacy) | **582** |
| Frameworks page (built 2026-09-09) | distinct **requirements** | `scf_control_mappings` (official crosswalk) | **148** |
| `'all'` scorecard row, `overall_score` | **compliant controls ÷ evaluated controls**, summed across every framework | assessment result | — |

`scf_framework_mappings` is the table from which 25,589 fabricated rows were
quarantined on 2026-08-25. An operator comparing the Overview with the Frameworks
page sees the product contradict itself, and correctly concludes neither can be
trusted.

### 3.2 The defensible path has been dead since 2026-08-29

`engine.ts` produces a projection-based score stamped with `policyVersion` and
`policyOwner`. That code path has not completed a run since the stamp was added:

- The last row in `assessments` is from **2026-08-26**. The stamp was introduced on
  **2026-08-27** (commit `bf4ff92`).
- `/api/cron/run-assessment` (daily, 02:00) has failed **every night from 2026-08-29
  to 2026-09-10** — seven runtime-error occurrences, all identical:
  `runAssessment threw: Unexpected token '<', "<!DOCTYPE"... is not valid JSON`.
- The runtime log for 2026-09-10 02:00 shows the request that failed:
  `GET https://standard-api.bekaa.eu/api/v1/scf/versions/latest`.
- **That endpoint does not exist.** The vendor's published contract
  (`src/lib/standard-api/generated/schema.d.ts`) declares no version endpoint at
  all, and the working catalogue sync (`sync/catalog.ts:70`) uses `/scf/versions` —
  the crosswalk walk succeeded at 2026-09-09 00:08, two hours before the assessment
  failed against `/latest` the same night.
- **The client hid the HTTP status for twelve nights.** `get()` calls
  `response.json()` before it checks `response.ok` (`client.ts:221-223`); `post()`
  does the same. When the vendor answered with an HTML error page, the parse threw,
  and the error that reached the log named a JSON token instead of a status code.

A second caller of the dead endpoint exists: `api/compliance/mappings/sync/route.ts:34`,
behind the Sync button on the Control Crosswalk page. The Settings connection probe
(`api/settings/integrations/standard-api/route.ts:147`) also probes `/latest`.

### 3.3 The legacy calculation has three outlets

`calculateFrameworkScoresLocally` (in `src/lib/data/compliance-data.ts`) computes
scores from the legacy table. It reaches the screen through three doors:

1. **`agentic-triggers` sweep 3** (`route.ts:232`, every six hours) computes it and
   writes scorecard snapshots — behind a ratchet that refuses to write a lower score
   (*"preserving higher score"*) and a list of "authoritative" sources it will never
   overwrite.
2. **`getFrameworkScores`** falls back to it whenever the scorecard table is empty
   (`compliance-data.ts:402`), and caches the result in Redis for 300 seconds.
3. **`/api/compliance/scorecard`** falls back to it directly (`route.ts:50`).

Every scorecard row in the database today — all **3** of them (`iso27001`,
`iso27701`, `all`) — was written by door 1, with no policy stamp.

This is why deleting those three rows alone would not work: door 2 would recompute
the legacy number live on the next read. The sink is the function, not the table.
No test covers the function or `getFrameworkScores`, so nothing currently prevents
the legacy number from returning.

### 3.4 The engine evaluates the wrong control set

`engine.ts:230` chooses which controls to evaluate by reading `scf_framework_mappings`.
The projection then scores against `scf_control_mappings`. For ISO 27001 + 27701 at
the current catalogue version:

| | controls |
|---|---:|
| chosen for evaluation (legacy table) | 679 |
| used by the stamped score (official crosswalk) | 80 |
| in both | 66 |
| **evaluated, never contribute to the score** | **613** |
| **contribute to the score, never evaluated** | **14** |

The 14 include `SEA-02.1`, `GOV-09`, `AST-01.2`, `HRS-02`, `HRS-05.1`, `HRS-05.2`.
Their requirements would land permanently as "unevaluated", depressing the score
for a reason unrelated to evidence. The 613 are evaluation cost with no effect on
any number — in `deep` mode each may be a vendor call, against Principle VIII's
first clause. `local-engine.ts` already removed this filter; `engine.ts` did not.

### 3.5 The stamp is produced, then dropped

Both engines push `policyVersion` and `policyOwner` into each `FrameworkScore`
(`engine.ts:626`, `local-engine.ts:373`). `assessment-to-scorecard.ts` builds the
snapshot without them. A stamped run would still produce an unstamped snapshot.

### 3.6 "Cannot compute" can still become 0%

`isScoreBacked` (`assessment-to-scorecard.ts:28`) checks only
`totalRequired > 0`. The projection returns `score: null` when nothing is decidable
(`projection.ts:290`), but the writer recomputes `implementedCount / totalRequired`
itself and writes **0%**. It is the defect `2026-08-26-no-unbacked-numbers` closed
as finding I2, reintroduced one layer down. Latent today — no stamped run exists —
but plausible: 58% of the crosswalk is `intersects`, which the curation policy
routes to human review rather than to a decision.

### 3.7 The vendor key leaked and is revoked

The key configured in production and in the local `.env` has the fingerprint
`sha256:7eb14124dcdd` (78 characters). The same key appears in the diffs of **five
public commits**, from `aaf2f30` (2026-06-16) to `804eb68` (2026-09-08): a test
script, the retired Python engine and the threat-modelling API. It is absent from
`HEAD` but present in public history. It was never rotated. The vendor now answers
every endpoint with `401 — "Invalid or revoked API key."`

Until a new key is in place, **no call to the vendor succeeds**: the nightly
assessment, the crosswalk sync, and the Control Crosswalk Sync button.

## 4. Design

### §1 The key — the Vault wins, for this key only

- `src/lib/supabase/vault.ts` gains `VAULT_FIRST = new Set(['STANDARD_GRC_API_KEY'])`.
  For a name in the set, `getSecret` reads the Vault first and falls back to
  `process.env` when the Vault holds nothing. Every other name keeps env-first —
  `OPENAI_API_KEY` (`openai.ts:11`) is unaffected.
- The env fallback is required, not optional: `tests/setup.ts` sets
  `STANDARD_GRC_API_KEY` for every test and the mocked Vault returns no value, so a
  Vault-only read would strip the key from half the suite.
- `getSecretSource` applies the same order, so the Settings screen keeps reporting
  which source is actually in use. The key route's `shadowedByEnv` then reads
  truthfully: a saved key answers *"Saved and now in use."*
- The in-memory secret cache gains a 60-second expiry. It never expires today;
  with the Vault winning, a rotation would otherwise leave warm Vercel instances on
  the old key until they recycle. The save route already invalidates its own
  instance; the expiry covers the rest.
- The Settings connection probe stops probing `/scf/versions/latest` and probes
  `/scf/versions`.
- A comment in `vault.ts` records the decision, the date, the reason, and that it
  applies to this one key.

### §2 The client names the status

`get()` and `post()` check `response.ok` **before** reading the body. On a
non-OK response they attempt `response.json()` for the vendor's problem details,
and if that throws, fall back to `HTTP_<status>` and `statusText`. The error
message names the endpoint and the status.

The body is not read as text first, deliberately: all seven fetch mocks in
`tests/unit/lib/standard-api-client.test.ts` implement `.json()` only. This form
leaves every one of them valid — including the 500 mock, whose body carries no
`error` field and already resolves to `HTTP_500` today.

The next nightly failure then reads *"HTTP 401 on /scf/…"* instead of a JSON
token.

### §3 The engine reads from the cache

- `local-engine.ts`'s row mapping (`scf_controls_cache` → `{ id, name, domain,
  description }`) moves into `loadCachedCatalogue(scfVersionId)` in
  `sync/catalog.ts`. Both engines call it. `controlIdentity` reads `id`, so the
  mapped object satisfies it unchanged.
- `engine.ts` replaces `getLatestScfVersion()` and the paginated `getScfControls()`
  with `getCachedScfVersionId()` and `loadCachedCatalogue()`. Two of the engine's
  three vendor calls disappear. `evaluateEvidence` (`engine.ts:487`, `deep` mode)
  remains and needs a valid key.
- `api/compliance/mappings/sync/route.ts` stops calling the dead endpoint and uses
  the catalogue sync's version lookup.
- `getLatestScfVersion` is deleted from `client.ts` and `index.ts`; no caller
  remains.

**Principle VIII, reconciled explicitly.** It requires catalogue data to *"come from
the Standard API"*, and a reviewer reading that clause alone could object to §3. The
same principle says ihOS *"consumes and caches it"* and forbids only *"a stale
hardcoded substitute"*. `scf_controls_cache` is the vendor's catalogue, synced from
the Standard API with a `synced_at`; `sync/catalog.ts:3` already names it the only
control source after a sync. Reading it is consumption, not substitution.

#### §3.1 The control filter follows the official crosswalk — *added while writing; review this*

This was not in the design presented in conversation. It was found by the
measurement in §3.4, and it changes the number this whole document exists to make
defensible, so it is included rather than deferred.

`engine.ts:230` stops reading `scf_framework_mappings`. For each selected framework
it resolves the curated vendor slug (`resolveVendorFrameworkCode`) and selects the
distinct `control_code` from `scf_control_mappings` at the cached catalogue version.
Evaluated set and scored set become the same 80 controls for ISO 27001 + 27701:
the 14 never-evaluated controls are evaluated, and 613 evaluations per run stop.

The existing empty-result guard stays: no mapped controls means no evaluation,
never all 1,468. Its catch block logs *"falling back to all controls"* and then sets
the list empty; the message is corrected to say what the code does.

### §4 One writer, and it stamps

**`calculateFrameworkScoresLocally` is deleted.** All three outlets close:

1. `agentic-triggers` sweep 3 builds its score map from the latest `'all'`
   scorecard row, read with the admin client it already uses. The map keeps its
   `{ code, score }` shape, so `resolveFrameworkScore` and its four tests are
   unchanged. The snapshot-writing block, the ratchet and the authoritative-source
   list are removed. `getFrameworkScores` is not used here: it creates a
   session-scoped client, and a cron has no session.
2. `getFrameworkScores` returns `[]` when the scorecard table is empty.
3. `/api/compliance/scorecard` loses its local-calculation branch.

**`assessment-to-scorecard.ts` becomes the only scorecard writer.**

- Per-framework rows and the entries of the `'all'` row's `frameworks[]` carry
  `policyVersion` and `policyOwner`, and take their score from the projection
  instead of recomputing it.
- The `'all'` row keeps `frameworks[]` — it is the container the agent tool, the
  MCP tool and the §5 cards all read — and drops `overall_score` and its top-level
  `score`, the cross-framework blend §2 rejected.
- `isScoreBacked` requires `score !== null` as well as `totalRequired > 0`. A
  computed 0 still passes — "evaluated, none met" is a real 0%. A `null` does not —
  "cannot compute" is not.

**Readers stop depending on write order.** Five files read "the latest scorecard,
any framework" — six reads in all: `api/dashboard/stats`,
`api/compliance/scorecard`, `api/compliance/report` (two reads),
`lib/agents/tools/index.ts`, `lib/mcp/posture-tools.ts`. Today they get the `'all'`
row only because it is inserted last. Each adds `.eq('framework_code', 'all')`.

**One-time cleanup.** `docs/sql/2026-09-10b_APPLY_ME_retire_legacy_scorecards.sql`
deletes the three unstamped `cron_scheduler` scorecard rows and records itself in
`schema_manual_applications`. The notification baselines in `agent_org_state` need
no cleanup: measured, there are **0** `framework_score_*` rows and **0**
`score_change` notifications ever emitted.

### §5 One card per framework on the Overview

- `api/dashboard/stats` adds a `frameworkScores` list read from the `'all'`
  container: framework name, satisfied count, requirement total, `policyVersion`,
  `policyOwner`, evaluated-at. The field is additive; `useDashboardStats`' schema
  is `.passthrough()`.
- The Overview replaces the single *Compliance Score* card with one card per
  framework. Format: **`ISO 27001 · 34 of 148 requirements · policy 2026-08-27.1`**
  — the numbers here are illustrative; no stamped run exists yet to show real ones.
- Each card's tooltip is built from that entry's data — its denominator, its
  policy, when it was evaluated — not from a fixed string.
- With no entry, the strip shows `—` and says no assessment has been run under the
  current policy.
- The *Total Frameworks* tooltip keeps its definition, which is correct, and loses
  its example, which is not: it cites SOC 2, which has never been assessed.

## 5. Transition, stated plainly

After deploy, and until the first stamped assessment completes:

- the Overview shows `—`, and every scorecard reader receives nothing;
- no `score_change` notification fires.

The first stamped run needs a valid vendor key, because `deep` mode calls
`evaluateEvidence`. This is the honest state: a number that could not be defended
is replaced by an absence that says so.

One residual, bounded: `getFrameworkScores` may serve a legacy result from Redis
for up to 300 seconds after deploy. The assessment writer clears that key on every
successful run.

## 6. Testing

Baselines measured on this branch before any change: **683 tests across 82 files**,
`tsc --noEmit` **199** locally (CI ratchet at 195), ESLint **1,222**. None may rise.

| Section | Tests |
|---|---|
| §1 | `tests/api/standard-api-key.test.ts:60` asserts the env var wins — it describes the rule being inverted and is rewritten to assert the Vault wins for this key. New: an empty Vault falls back to the env var. New unit test: `OPENAI_API_KEY` stays env-first. |
| §2 | New: a non-OK response whose body is not JSON raises an error carrying the HTTP status and endpoint. The seven existing mocks stay as they are. |
| §3 | `loadCachedCatalogue` maps a cache row to an object `controlIdentity` accepts. |
| §3.1 | The engine's control set for a framework equals the distinct `control_code` in `scf_control_mappings` for its curated slug at the cached version. |
| §4 | `tests/unit/assessment/scorecard-backing.test.ts` gains the `score` field on its four cases; the "0 of 582" case keeps `score: 0` and stays `true`. New: `score: null` with `totalRequired > 0` is `false`. New: `getFrameworkScores` returns `[]` for an empty table — the guard against the legacy number returning, which does not exist today. `tests/unit/agents/cron.test.ts` mocks only the admin client; with no `'all'` row the score sweep stays silent and the other sweeps are tested as today. |
| §5 | The stats route returns one `frameworkScores` entry per `'all'` framework, each with its denominator and policy; none when the row is absent. |

## 7. Operator steps

1. **Obtain a new key from the vendor**, and confirm with them that
   `sha256:7eb14124dcdd` is revoked — the 401 does not distinguish invalid from
   revoked.
2. After §1 ships: **Settings → Integrations → Standard GRC API Key**. The correct
   response is *"Saved and now in use."*
3. Apply `2026-09-10b_APPLY_ME_retire_legacy_scorecards.sql` and record it.
4. When Vercel access returns: delete `STANDARD_GRC_API_KEY` there. With §1 in
   place it no longer takes precedence, but it is a revoked secret in a config
   store and has no reason to remain.
5. Delete the `STANDARD_GRC_API_KEY` line from the local `.env`.

## 8. Explicitly not in this work

- **Teaching the model** — rewriting help, tours and onboarding around the three
  questions (Answer, Cover, Observe) and SCF as the interlingua. Separate spec, to
  be written once these numbers stand.
- **The score-change notification has never fired** — 0 baselines, 0 emitted.
  Recorded as measured; the cause is not investigated here.
- **The leaked key remains in public git history.** It is revoked, so the exposure
  is contained. Rewriting public history is not proposed.
- `api/compliance/report` computes `complianceRate` as `compliant / total`, which is
  `NaN` when `total` is 0. It reads evaluations, not scorecards, and is outside
  this sink.
- The header comment of `api/compliance/scorecard/route.ts` says it falls back to
  hardcoded data. It does not, and after §4 it has no fallback at all; the comment
  is corrected in passing.
