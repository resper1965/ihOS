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
