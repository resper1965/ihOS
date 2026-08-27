# Standard GRC Platform API — Contract Audit

Audit of `src/lib/standard-api/client.ts` against the official API reference
(`https://standard-api.bekaa.eu/llms.txt` + full reference, 2026-07-02).

**Bottom line:** the Standard API behaves per its docs. Most defects are on the
**ihOS client side**. This doc separates (A) what ihOS must fix, from (B) the
open questions worth confirming *with the Standard team* before we finalize.

---

## 0. Verified CORRECT (no change needed)

- **`POST /gap/evaluate-evidence`** — body is camelCase `{ controlRequirement, evidenceDescription }`, response is snake_case `{ is_compliant, confidence_score, missing_elements, auditor_notes }`. The client matches exactly. *(An earlier hypothesis that this endpoint was snake_case was wrong — the docs confirm the split: LLM endpoints take camelCase inputs; "No-LLM" endpoints take snake_case.)*
- **`POST /intelligence/compliance-score`** — body `{ regulation_id, scf_controls_implemented }`, response fields (`score`, `scf_controls_implemented_count`, `total_required_controls`, `missing_controls`, `message`) all match the client.
- **Response envelope** `{ data, trace_id }` — the client's `get/post` unwrap `json.data` correctly.
- **Error format** `{ error: { code, message, trace_id } }` — the client reads `json.error.{message,code}` correctly.
- **Auth scheme** — `Authorization: Bearer standard_live_...` matches.

---

## A. ihOS-side fixes (our repo)

### A1 — `getScfControls` double-unwrap (FIXED) 🔴 highest impact
`get()` already unwraps `{ data, trace_id }`, so the paginated controls list
arrives as a bare array. `getScfControls` typed it as `{ data, total }` and the
engine read `batch.data` → `undefined` → **0 controls from the real API**; only
the local fallback (which wraps in `{ data }`) worked. `getScfFrameworks`
already handled this; `getScfControls` didn't. Now normalizes any shape
(array / `{data}` / `{items}` / `{controls}`).
→ `src/lib/standard-api/client.ts`

### A2 — Tenant header required but sent conditionally (FIXED: loud warning)
Docs: `x-standard-tenant-id: org_xxxxx` is **required for data-scoped
endpoints**. The client only sends it `if (config.tenantId)` and `getConfig`
didn't validate it. Added a warn-once if `STANDARD_GRC_TENANT_ID` is unset.
**Action for ops:** confirm `STANDARD_GRC_TENANT_ID=org_xxxxx` is set in prod.
→ `src/lib/standard-api/client.ts`

### A3 — Base URL must include `/api/v1` (FIXED: loud warning)
Real paths are `/api/v1/intelligence/...`, `/api/v1/gap/evaluate-evidence`,
`/api/v1/scf/...`. The client sends paths WITHOUT `/api/v1`, so
`STANDARD_GRC_API_URL` must be `https://standard-api.bekaa.eu/api/v1`. Added a
warn-once if the base URL has no version segment. (Left as a warning, not an
auto-rewrite, to avoid breaking a working reverse-proxy config.)
**Action for ops:** confirm the env value.
→ `src/lib/standard-api/client.ts`, `README.md`

### A4 — Endpoint inventory drift (client vs. real API) — TODO (not yet changed)
The client only wires the **stateless** endpoints (`/intelligence/*`,
`/gap/evaluate-evidence`, `/soc/*`, `/executive/*`, `/privacy/scan-vendor-contract`,
`/intelligence/council`). The real API ALSO offers a full **stateful assessment
lifecycle** (`/assessments/:id/evidence-analysis/run`, `/gap-analysis/draft`,
`/poam/draft`, `/reports/draft`, `/compliance-gate`) that natively does upload →
RAG → evidence analysis → gap. ihOS reimplements that loop client-side (its own
SCF fetch + its own RAG + per-control `evaluate-evidence`). This is a valid
"bring-your-own-orchestration" choice, **not a bug** — but worth a deliberate
decision: keep the client-side loop (more control, more API calls) vs. adopt the
server lifecycle (less code, server-managed). See "Open questions" B4.

### A5 — `council` endpoint path
Client calls `/intelligence/council`; docs list it as
`POST /api/v1/intelligence/council`. ✅ matches (with the A3 prefix). Note:
unlike the other `/intelligence/*` scorers, council is `tenantRequired:true`
(B2), so `STANDARD_GRC_TENANT_ID` must be set to use it.

### A6 — SCF controls pagination page size (FIXED) 🔴 real bug
The engine paged at `per_page=200`, but the API caps at 100 (B1). The loop's
`items.length < 200` termination fired on page 1 → only the first **100** of
1,468 controls ever loaded. Now `per_page=100` in both the client (cap) and the
engine, so pagination advances correctly.
→ `src/lib/standard-api/client.ts`, `src/lib/assessment/engine.ts`

### A7 — 401/403 no longer trigger fallback (FIXED)
Per B3, `post`/`get` only fall back on 5xx/timeout/network now — 401/403 throw
immediately so scope/cross-tenant/auth problems surface instead of being masked
by a local estimate.
→ `src/lib/standard-api/client.ts`

### A8 — stopped injecting `tenant_id` into request bodies (FIXED)
Per B6, tenant is header-only; removed the body injection.
→ `src/lib/standard-api/client.ts`

---

## B. Answers from the Standard team (RESOLVED 2026-07-03, source: API `main`)

- **B1 — controls list shape + max per_page.** Default JSON is a **bare array
  under `data`**: `{ data: [...], scf_version_id, page, per_page, trace_id }` —
  there is **no `total`**. `per_page` **max = 100** (default 50); asking 200 is
  silently capped to 100. Terminate pagination by offset (page shorter than
  `per_page`) or cursor (`?after=`, response `pagination.has_more/next_cursor`).
  NDJSON stream available via `Accept: application/x-ndjson`.
  → **Applied:** A1 confirmed correct; client now caps `per_page` at 100 and the
  engine pages at 100 (was 200 → the `items.length < 200` check broke on page 1,
  loading only the first 100 controls — real bug, fixed).
- **B2 — tenant on stateless scorers?** **No.** The 8 scorers
  (`compliance-score`, `cross-coverage`, `roi-path`, `blast-radius`,
  `gap-analysis`, `dpia-score`, `retention-check`, `breach-sla`) are
  `tenantRequired:false`. Required (`true`) for `/gap/evaluate-evidence`,
  `/gap/evaluate-evidence/batch`, `/intelligence/council`, and data-scoped
  endpoints; missing there (authenticated) → **400 `TENANT_CONTEXT_REQUIRED`**.
  → **Applied:** client no longer implies tenant is universally required; the
  warn message is refined; the header is still sent whenever configured.
- **B3 — 401/403 are hard errors.** 401 = missing/invalid credential; 403 =
  RBAC denial / `INSUFFICIENT_SCOPE` / cross-tenant block (logged critical).
  All are auth/config/security, **not** degradable. Fallback only on 5xx/timeout.
  → **Applied:** removed the 401/403 → fallback path in `post`/`get`; fallback
  now triggers only on `>= 500` and network/timeout.
- **B4 — batch is async, no inline verdicts.** `POST /gap/evaluate-evidence/batch`
  returns `202 { job_id }`; results are written via audit
  (`gap.evidence.batch.item_evaluated`), not returned inline. So the **single**
  `/gap/evaluate-evidence` remains correct for the synchronous per-control loop.
  Stateful lifecycle exists but is an architecture choice, not a bug.
  → **No change** (current approach validated).
- **B5 — no incremental / ETag.** No `ETag`/`If-None-Match`/`Last-Modified`/delta
  support anywhere. App-level subset submission is the only "delta". ihOS cache
  stays "call vs. don't call" — this is now CONFIRMED, not an assumption.
- **B6 — tenant only from header.** Read solely from `x-standard-tenant-id`
  (or `x-tenant-id`/path), never the body. Bodies aren't `.strict()`, so a
  stray `tenant_id` is stripped, but cleanest is to not send it; org-scoped
  bodies use `organization_id`.
  → **Applied:** removed the `tenant_id` body injection in `post()`.

---

## C. Ops verification checklist (no code, just confirm)

- [ ] `STANDARD_GRC_API_URL` = `https://standard-api.bekaa.eu/api/v1` (incl. `/api/v1`).
- [ ] `STANDARD_GRC_TENANT_ID` = `org_xxxxx` is set in prod.
- [ ] `STANDARD_GRC_API_KEY` uses the `standard_live_` prefix.
- [ ] `GRC_LOCAL_FALLBACK_ENABLED` is unset/false in prod (fail-closed).

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

---

## E. Blocker found 2026-08-26: the SCF control catalog is unreachable

Probed the live API directly (new `standard_live_` key, issued 2026-08-26).
**The control catalog endpoint the assessment engine depends on is denied to
every API key, and this is a server-side configuration state, not a
credential problem.**

```
GET /api/v1/scf/versions/latest                        -> 200
GET /api/v1/scf/frameworks                             -> 200
GET /api/v1/scf/versions/{id}/controls?page=1           -> 403
```

The 403 body is explicit:

```json
{"title":"INSUFFICIENT SCOPE","status":403,
 "detail":"This route is protected but has no API key scopes configured.
           Access denied for machine-to-machine actors.",
 "instance":"/api/v1/scf/versions/.../controls"}
```

"No API key scopes configured" means the route declares protection but nothing
defines which scopes satisfy it, so no `standard_live_` key can ever pass. A
newly-issued key does not help; we tried one.

**Not the tenant header.** An earlier hypothesis here (that
`STANDARD_GRC_TENANT_ID` was malformed — it is a 36-char UUID where README
line 98 asks for an `org_`-prefixed id) was **wrong**: the request returns an
identical 403 with the header and without it. The tenant format may still be
worth correcting on its own merits, but it is not this blocker.

### Spec-vs-deployment drift, found while diagnosing

`https://standard-api.bekaa.eu/docs/openapi.json` documents 51 paths. The two
sets disagree in both directions:

- **In the spec, 404 in production:** `/api/v1/organizations`, `/api/v1/tenants`,
  `/api/v1/me/account`.
- **Not in the spec, 200 in production:** `/scf/versions/latest`,
  `/scf/frameworks`. No `/scf/*` path appears in the spec at all — nor any
  `/gap/*`, despite §0 of this document verifying `POST /gap/evaluate-evidence`
  against the docs on 2026-07-02.

So the published spec cannot currently be used to reason about what the
deployment offers, in either direction.

### What this blocks

`runAssessment` loads the SCF catalog from this endpoint (on `main`). With it
denied, an assessment cannot run at all — confirmed end to end:

```
[WARN] (standard-api) Standard GRC API unavailable and local fallback is
DISABLED — surfacing error instead of estimating/serving stale truth
[ERROR] (cron/run-assessment) runAssessment threw: Forbidden
```

That is the fail-closed behaviour working exactly as intended (Constitution
Principle VIII): it refused to estimate rather than fabricate a score. Before
the 2026-08-25/26 work it would have returned an estimated result or a
hardcoded number.

### Action required — vendor side, not ours

Whoever administers the Standard GRC subscription needs scopes configured for
`/scf/versions/{id}/controls` (the securityScheme description says keys are
"issued from the Standard dashboard", so that is the likely place). Quote the
error `detail` verbatim and a `trace_id` from a failing call — the API returns
one per request.

### Workaround that exists but is not on `main`

`scf_controls` already holds the full 1,468-row catalog locally (verified
2026-08-25). Branch `posture-release-readiness` carries a DB-first catalog read
that would make the engine independent of this endpoint. It is not on `main`,
and it needs the completeness guard described as Task 6 in
`docs/superpowers/plans/2026-08-25-epistemic-integrity.md` before it should be
relied on — without that guard a partially-seeded table yields confident scores
over a truncated control set.

### A9 — control identity mismatch: the engine filters UUIDs against codes (NOT FIXED)

Found 2026-08-26 while running the first assessment after the vendor configured
the catalog scope. The assessment returned `totalControls: 0` with a working
catalog and 5,441 iso27001 mapping rows present. Cause, verified against both
sides:

```
scf_framework_mappings.scf_control_code   ->  "AST-22", "AST-01.4", "END-14"
Standard API control.control_id           ->  "653a70ef-16fd-4d53-a637-ff61cd998729"
Standard API control.control_code         ->  "AAT-01"
```

`src/lib/assessment/engine.ts` builds `relevantControlIds` from
`scf_control_code`, then filters:

```ts
allControls = allControls.filter(c => relevantControlIds.has(c.control_id || c.id));
```

`c.control_id` is a UUID; the set holds human codes. The predicate is never
true, so `allControls` becomes `[]` and every framework-filtered assessment
evaluates zero controls. The same mismatch then propagates: `controlId` is
derived from `control.control_id || control.id`, so even with filtering fixed
the per-control identity would be a UUID while `control_evaluation_cache`,
`evidence_evaluations` and `scf_framework_mappings` all key on the code.

The fix is to treat `control_code` as the identity throughout this path, not
`control_id`. Note the DB-first catalog read on branch
`posture-release-readiness` already maps `control_id: c.control_code`, so that
branch does not have this bug — a third reason to land it.

Impact observed: the `assessments` table shows `total_controls = 0` for the
2026-08-24, -25 and -26 cron runs, and the run performed on 2026-08-26 deleted
the previous scorecard rows and wrote `score: 0.0` for iso27001/iso27701 from
zero evaluated controls. A 0% derived from measuring nothing is as much a
fabricated claim as a 100% was.

### A10 — /intelligence/compliance-score also denied (NOT FIXED)

Same run: both framework scores came back
`"message": "Score calculation failed: Forbidden"`. So after the catalog scope
was granted, `POST /api/v1/intelligence/compliance-score` still 403s. Per §B2 of
this document that endpoint is `tenantRequired:false`, so this is likely another
route needing API-key scopes configured — worth raising with the vendor in the
same thread as the catalog one.

### Tenant header status, corrected again

With the catalog scope now granted, the tenant question resolved differently
than §E first recorded. Retested 2026-08-26:

```
GET /scf/versions/{id}/controls  WITHOUT x-standard-tenant-id  -> 200
GET /scf/versions/{id}/controls  WITH    x-standard-tenant-id  -> 403
   {"title":"FORBIDDEN","detail":"This API key can only access its own organization."}
```

So the configured `STANDARD_GRC_TENANT_ID` (a 36-char UUID beginning `000000`)
is genuinely not this key's organization, and sending it now actively breaks
requests that would otherwise succeed. It is disabled (commented out) in BOTH
`.env.local` and `.env` — Next.js falls back to `.env` when `.env.local` omits a
key, so commenting it in one file only left it live. The correct `org_`-prefixed
id is still unknown and IS required for `/gap/evaluate-evidence` (deep mode) and
`/intelligence/council`.
## F. Vendor response 2026-08-26 — corrections to THIS document

The Standard team replied to the findings in §E, A9 and A10. Two of our own
claims were wrong and are corrected here rather than left to mislead the next
reader.

### F1 — There is no `org_`-prefixed tenant id. §A2, §B2 and §C were wrong.

Verbatim: *"There is no `org_`-prefixed identifier in this API. Organization ids
are UUIDs. If your integration documentation says otherwise, that documentation
is wrong and we would like to see it so we can correct it at the source."*

This document said `x-standard-tenant-id: org_xxxxx` in §A2 and §C, and
`README.md:98` said `STANDARD_GRC_TENANT_ID=org_your-org-id`. All of that was
invented on our side. It also actively misled this session's diagnosis: the
`org_` shape was used to argue the configured UUID was malformed, which turned
out to be the wrong hypothesis twice over.

### F2 — The header should be OMITTED, permanently. It is not a workaround.

Verbatim: *"The key's own organization is bound to the key, so the
straightforward fix is to omit `x-standard-tenant-id` entirely — every request
you showed us succeeding did exactly that. The header is only for callers acting
across organizations, which an API key never is."*

So §B2's "required for data-scoped endpoints" is wrong for API-key callers.
`STANDARD_GRC_TENANT_ID` is now commented out in `.env.local` and `.env`, and
`README.md` / `docs/OPERATIONS.md` say to leave it unset. The value we held (a
UUID beginning `000000`) they identify as "almost certainly a seed or fixture
value".

### F3 — Fix status as of 2026-08-26, verified by probe

Deployed:
```
GET /api/v1/organizations  -> 405 (was 404; POST-only, wrong-verb bug fixed)
GET /api/v1/tenants        -> 405   ** DEPRECATED, Sunset 2026-11-25 **
openapi.json               -> 366 paths (was 51); /scf/* now 35 paths
```
`/api/v1/tenants` is deprecated in favour of `/api/v1/organizations` —
`tenant` is legacy vocabulary, the field has been `organization_id` for some
time. Our client's naming (`STANDARD_GRC_TENANT_ID`, `tenantId`,
`tenantRequired`) inherits that legacy term.

NOT yet deployed (still failing at time of writing):
```
POST /intelligence/compliance-score  -> 403 INSUFFICIENT SCOPE
POST /intelligence/cross-coverage    -> 403 INSUFFICIENT SCOPE
POST /privacy/scan-vendor-contract   -> 403 INSUFFICIENT SCOPE
POST /gap/evaluate-evidence          -> 403 FORBIDDEN "Permission denied."
```

Root causes they gave, which are worth recording because they explain why
`/scf/*` started working and these did not:
- The ten routes declared **no permissions at all**, so no scopes could be
  derived and the gateway failed closed. Required scopes now: `intelligence:run`
  for all nine `/intelligence/*`, `privacy:read` for `/privacy/scan-vendor-contract`.
- `/gap/evaluate-evidence` was a separate defect: routes declare *permissions*
  (`evidence:run`) while keys carry *scopes* (`gap:write`), and the authorization
  layer compared the two vocabularies directly. That only worked where a
  permission and its scope share a name — `scf:read` happens to, which is
  precisely why the catalog began working while this route did not. Now
  translated before comparison; requires the `gap:write` scope.

### F4 — `/soc/status` is by design, not a defect. Remove it from our client.

Verbatim: *"It requires `admin:write` and a human actor. Administrative and
approval-gated routes are deliberately unreachable by API keys, so that a
machine credential can never approve an assessment, mint another key, or read
platform-wide state."*

That is a sound design decision and our client should stop calling it. If we
need pipeline health they offered to expose a scoped equivalent — worth asking
for rather than working around.

### F5 — Open action on us: confirm the key's scopes

They asked for the key's prefix (the first 12 characters after
`standard_live_`) — **not** the full key — to look it up and confirm it carries
`intelligence:run` and `gap:write`. They also stated plainly that if the full
key has been transmitted in clear text at any point, it should be revoked and
reissued rather than kept in use.

### F6 — Spec now generated, so we can stop inferring shapes

The spec is now generated from the routes with a CI check that fails the build
on drift, and `/scf/*` and `/gap/*` carry full response schemas. That removes
the reason our client normalizes "any shape" in `getScfControls` (§A1) and
hand-maintains response types. Generating types from the spec is now viable and
would have caught A9 (`control_id` vs `control_code`) at compile time.

### F7 — PENDING: the current API key is being rotated

Requested from the Standard team on 2026-08-26 because the full key had been
transmitted in clear text (they asked to be told if that had happened, and it
had). The key currently in `.env.local` / `.env` — prefix `236a84400ffe` — is
therefore **live but scheduled for revocation**, and will stop working without
further warning on our side.

Deliberately NOT rotated locally yet: reissue takes time on their side, and the
current key is what lets us keep probing whether the ten scope fixes have
deployed. When the replacement arrives, update `STANDARD_GRC_API_KEY` in BOTH
`.env.local` and `.env` — Next.js falls back to `.env` when `.env.local` omits a
key, so changing one file only leaves the old value live (this exact trap cost a
debugging cycle on 2026-08-26 with `STANDARD_GRC_TENANT_ID`).

Also update it in the Vercel project's environment variables, which this session
could never verify (`vercel whoami` reports no credentials here) — see §C.

### F8 — Status after the vendor's deployment (probed 2026-08-26, later)

The route-side fix from §F3 has **deployed**. The error class changed on every
affected route, which is the tell:

```
before:  403 INSUFFICIENT SCOPE  "This route is protected but has no
                                  API key scopes configured."
now:     403 FORBIDDEN           "Permission denied."
```

`INSUFFICIENT SCOPE` meant the route declared no permissions, so no scopes could
be derived and nothing could ever satisfy it. `FORBIDDEN / Permission denied.`
means the gate now works and **our key does not carry the required scope**. That
is the second half of what the vendor asked us to check:

> *"Please check your key carries `intelligence:run`. If it does not, that is a
> one-line change on our side — tell us and we will reissue."*

Current state of all 15 routes the client calls:

| Routes | Status |
|---|---|
| `/scf/versions/latest`, `/scf/frameworks`, `/scf/versions/{id}/controls` | **200** — working |
| 8 `/intelligence/*` scorers + `/intelligence/council` | 403 `Permission denied.` — needs `intelligence:run` |
| `/privacy/scan-vendor-contract` | 403 `Permission denied.` — needs `privacy:read` |
| `/gap/evaluate-evidence` | 403 `Permission denied.` — needs `gap:write` |
| `/soc/status` | 403 — by design (§F4), key-inaccessible; our client should stop calling it |

Fresh trace_ids: `a316511cac47fb01` (compliance-score),
`a31651208b0353f5` (gap/evaluate-evidence), `a3165128e8f8e0f4`
(privacy/scan-vendor-contract).

**Open action: ask the vendor to grant `intelligence:run`, `privacy:read` and
`gap:write` to the key** (prefix `236a84400ffe`), or to include them on the
replacement key already requested in §F7. Nothing further is needed from our
side on these routes — the client code is correct, the credential is not
scoped.

---

## G. Vendor response 2026-08-27 — scopes granted, and a correction to us

### G1 — The three scopes are granted, on the REPLACEMENT key

`intelligence:run`, `privacy:read` and `gap:write` confirmed correct. They are
being attached to the **replacement** key rather than added to the current one,
so the rotation request and the scope grant land as a single step with the old
key revoked at that point. That retires a key whose full value was transmitted
in clear text without leaving a gap in coverage.

| Route | Scope |
|---|---|
| `POST /api/v1/intelligence/*` (all nine) | `intelligence:run` |
| `POST /api/v1/privacy/scan-vendor-contract` | `privacy:read` |
| `POST /api/v1/gap/evaluate-evidence` | `gap:write` |

**So the twelve routes open when the new key arrives, not before.** Nothing
further is needed from our side. When it lands, update `STANDARD_GRC_API_KEY`
in BOTH `.env.local` and `.env` (Next.js falls back to `.env` when
`.env.local` omits a key — this trap already cost one debugging cycle) and in
the Vercel project.

### G2 — WE WERE WRONG about `/intelligence/roi-path`, and the cause is worth recording

§F-era notes and an email to the vendor claimed `/intelligence/roi-path`
documented `intelligence:create` while its siblings needed `intelligence:run`,
and asked them to check whether that route was special. **It was not. The
discrepancy did not exist.**

The vendor checked and replied that roi-path documented nothing at all, like
seven of its eight siblings, and that `council` was the only one carrying a
clause — "which is likely where the `intelligence:create` you saw came from."

They were right, and the cause is a defect in how we extracted it. Our script
found the path key `"/api/v1/intelligence/roi-path"` and then regex-searched a
**fixed 1400-character window** after it for `Requires permission(s)`. Measured
in the generated spec:

```
roi-path  at char 199691
council   at char 200248     distance: 557
window:   1400 chars   ->    council's block fell INSIDE roi-path's window
```

So the first permission clause the window found belonged to the next route. We
attributed a neighbour's permission to roi-path and reported it upstream as an
inconsistency in the vendor's document.

**The lesson, stated so it does not recur:** a fixed-width window over
structured text crosses record boundaries silently. Extracting a field that
belongs to a specific record requires parsing the structure — for JSON, parse
the JSON; for the generated `.d.ts`, bound the search at the next sibling key.
The cost here was small but it was borne by someone else: the vendor spent time
disproving a discrepancy we invented.

All nine `/intelligence/*` routes declare `intelligence:create`, which derives
to the scope `intelligence:run`. roi-path behaves exactly like the family.

### G3 — The spec gap we reported is fixed, and better than we asked

Both halves of §F6's observation were accepted:

- The permission clause was emitted only for routes with a *generated* OpenAPI
  block; hand-written ones said nothing. Of the twelve routes we were blocked
  on, one documented its permission and eleven were silent — so the endpoints
  someone had bothered to document by hand were precisely the ones that said
  nothing about what they require.
- Even where the clause appeared it named the *permission* a route declares,
  never the *scope* a key carries. Different vocabularies:
  `/gap/evaluate-evidence` declares `evidence:run` and is reachable by a key
  holding `gap:write`. So the spec could not be read as a scope reference at all.

Now every route that declares permissions states **both**, regardless of block
type — 271 of 407 operations carry the clause, and the remaining 136 require no
permission. A route no API key can reach says so outright, which answers the
`/soc/status` question inside the spec rather than by email. They added a test
that walks every route and fails their build if one ships without a documented
scope.

**Consequence for us: regenerate.** `npm run gen:api-types` will now pick up
the permission/scope clauses, which makes required scopes visible at our call
sites. Worth doing once the replacement key arrives so both land together.
