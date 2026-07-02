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
Client calls `/intelligence/council`; docs list it under "Additional
Intelligence Endpoints" as `POST /api/v1/intelligence/council`. ✅ matches (with
the A3 prefix).

---

## B. Questions to send to the Standard team (contract not fully pinned by docs)

> These are the items to "devolver para o Standard" — the docs don't fully
> specify them and a wrong assumption on our side is silent.

- **B1 — Exact response shape of `GET /scf/versions/{id}/controls`.** Is it
  `{ data: [ ...controls ], trace_id }` (bare array under `data`) or
  `{ data: { items: [...], total, page }, trace_id }`? Our fix (A1) tolerates
  both, but confirming lets us read `total` for correct pagination termination.
  Also: what is the **max `per_page`**? (We currently page at 200, cap 20 pages.)
- **B2 — Is `x-standard-tenant-id` required for the stateless intelligence
  endpoints** (`compliance-score`, `cross-coverage`, `roi-path`,
  `blast-radius`), or only for assessment/data-scoped ones? Affects whether a
  missing tenant should hard-fail those.
- **B3 — Auth failure status:** docs list `UNAUTHORIZED (401)` but not 403. Our
  client treats **401 AND 403** as "scope denied → (opt-in) fallback". Does the
  API ever return 403 (e.g. wrong tenant / insufficient scope), and should that
  be treated as a hard auth error rather than a degradable one?
- **B4 — Recommended integration pattern:** for per-product-version compliance
  scoring, do you recommend the stateful assessment lifecycle
  (`/assessments/... /evidence-analysis/run`) over the stateless
  `evaluate-evidence` loop? Any **batch** evidence endpoint (we saw
  `scan-vendor-contract/batch` returns a `jobId`; is there an evidence batch)?
- **B5 — Incremental evaluation:** is there any endpoint that accepts "only
  re-evaluate these controls/deltas", or a content hash / `If-None-Match` style
  cache validator? This would turn ihOS's threat/assessment caching from
  "call vs. don't call" into true partial re-evaluation.
- **B6 — `x-standard-tenant-id` vs. body `tenant_id`/`organization_id`.** Our
  client injects `tenant_id` into request bodies. The docs show bodies using
  `organization_id` (e.g. create assessment). Is a stray `tenant_id` in the body
  ignored, or can it trigger `VALIDATION_ERROR`?

---

## C. Ops verification checklist (no code, just confirm)

- [ ] `STANDARD_GRC_API_URL` = `https://standard-api.bekaa.eu/api/v1` (incl. `/api/v1`).
- [ ] `STANDARD_GRC_TENANT_ID` = `org_xxxxx` is set in prod.
- [ ] `STANDARD_GRC_API_KEY` uses the `standard_live_` prefix.
- [ ] `GRC_LOCAL_FALLBACK_ENABLED` is unset/false in prod (fail-closed).
