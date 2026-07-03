# Runbook — Validating the Analysis Flow (Cache, Fallback, Lineage)

This runbook validates `specs/001-analysis-flow-caching` and
`specs/002-analysis-flow-hardening` against a **live** Supabase + GRC
environment. The code ships with typecheck + unit-test coverage, but the
following can only be confirmed with real infrastructure (which the authoring
session did not have). Run this in **staging**, not production.

> Estimated time: ~30 min. Requires: staging Supabase (service role), a working
> Standard GRC Engine + ihos-api, and an admin/ionic_user login.

> **Schema-drift note (verified 2026-07-02 against `types.generated.ts`).** The
> live DB has drifted from the tracked migrations (e.g. it already has the
> `assessments` table and `product_versions.is_default`, neither of which is in
> any migration file). It does NOT yet have this feature's new
> columns/tables. The application code degrades gracefully if you run it before
> applying the migrations (it falls back to base columns), but you should still
> apply Section 1 first to get the full behavior (caching, lineage, delta
> confidence). Nothing here drops or rewrites existing data.

---

## 0. Pre-flight: confirm the fallback is fail-closed in production

The single highest-risk item. In the Vercel project (production):

```bash
# Must be EITHER unset, or explicitly false. If GRC_LOCAL_FALLBACK_ENABLED=true
# in prod, estimated (non-authoritative) compliance data may be served.
vercel env ls production | grep -i GRC_LOCAL_FALLBACK_ENABLED
vercel env ls production | grep -i GRC_FALLBACK_DISABLED
```

Expected: `GRC_LOCAL_FALLBACK_ENABLED` unset/false. If it is `true`, decide
deliberately whether estimation is acceptable; otherwise unset it.

---

## 1. Apply migrations

Two options:

- **CLI**: `supabase db push` (applies `20260702_control_evaluation_cache.sql`
  and `20260702_version_baseline_lineage.sql`).
- **No CLI / quickest**: paste `docs/sql/analysis_flow_validation.sql` into the
  Supabase SQL Editor and Run. It runs the pre-flight diagnostic (Section 1),
  applies the same migrations idempotently (Section 2), and verifies
  (Section 3) in one shot.

Verify the objects exist:

```sql
select table_name from information_schema.tables
  where table_name = 'control_evaluation_cache';

select column_name from information_schema.columns
  where table_name = 'product_versions' and column_name = 'previous_version_id';

select column_name from information_schema.columns
  where table_name = 'threat_models' and column_name in ('baseline_model_id','source');

select column_name from information_schema.columns
  where table_name = 'product_version_deltas'
  and column_name in ('extraction_confidence','needs_review','source_document_id');
```

---

## 2. Validate the persisted evaluation cache (specs/001)

1. Run a **quick** assessment for a product version (UI: Assessments → Run).
2. Note the response `totalFreshlyEvaluated` (should equal `totalControlsEvaluated`, `totalFromCache = 0`).
3. Without changing any document, run the **same** assessment again.
4. **Assert**: second run has `totalFromCache === totalControlsEvaluated`, `totalFreshlyEvaluated ≈ 0`.
5. Check the server log line `Assessment completed` — `cacheHitRate` should be ~100 on the second run.
6. Upload/reindex a document scoped to that version (or global), then re-run.
7. **Assert**: `totalFreshlyEvaluated > 0` again (corpus fingerprint changed → cache invalidated).
8. Run with **Force re-evaluation** checked → `totalFromCache === 0`.

```sql
-- Cache rows should exist and carry a corpus_fingerprint:
select control_code, mode, scope_key, corpus_fingerprint, evaluated_at
  from control_evaluation_cache order by evaluated_at desc limit 10;
```

---

## 3. Validate fail-closed fallback (specs/002)

The fallback path is exercised ONLY by availability failures (5xx/timeout/network).
`401/403` always hard-fail regardless of `GRC_LOCAL_FALLBACK_ENABLED` (they are
auth/scope/cross-tenant errors, per `docs/standard-api/CONTRACT_AUDIT.md` B3/A7),
so use the unreachable-host method here — not key revocation.

1. Temporarily point `STANDARD_GRC_API_URL` at an unreachable host (staging only) to force a network/timeout error.
2. With `GRC_LOCAL_FALLBACK_ENABLED` **unset**, run a deep assessment.
3. **Assert**: affected controls are `[EVALUATION_ERROR]` (not silently compliant), and NO estimated rows landed in `control_evaluation_cache`.
4. Set `GRC_LOCAL_FALLBACK_ENABLED=true`, re-run.
5. **Assert**: results appear but are flagged — `evidence_evaluations.evidence_sources.isEstimated = true`, `needs_review = true`, and a Sentry event was emitted. These rows are STILL absent from `control_evaluation_cache`.
6. Restore the real API config.

**Separate auth-failure check (401/403):** revoke/invalidate the key and run an
assessment — even with `GRC_LOCAL_FALLBACK_ENABLED=true`, controls must surface a
hard error (never estimated), and nothing is written to `control_evaluation_cache`.

```sql
select control_code, needs_review, evidence_sources->>'isEstimated' as estimated,
       evidence_sources->>'searchSource' as rag_source
  from evidence_evaluations order by created_at desc limit 20;
```

---

## 4. Validate threat-model reuse + lineage (specs/001 + 002)

1. Generate a threat model for `v2.2.x`. Note `source: 'generated'`.
2. Regenerate for `v2.2.x` with no new deltas → response `cached: true`, engine NOT called (check logs).
3. In `product_versions`, set `v2.3.x.previous_version_id = <v2.2.x id>`:
   ```sql
   update product_versions set previous_version_id =
     (select id from product_versions where version_code = 'v2.2.x')
     where version_code = 'v2.3.x';
   ```
4. Approve the `v2.2.x` model (status → approved).
5. Generate a model for `v2.3.x`.
6. **Assert**: response has `source: 'inherited'`, `inherited_threats > 0` (for overlapping stride+component), `new_threats` for the rest; `model_data.metadata.baseline_model_id` is set.

---

## 5. Validate manual seed (specs/002)

```bash
curl -X POST "$APP_URL/api/threat-modeling/seed" \
  -H "Cookie: <authenticated admin/ionic_user session>" \
  -H "Content-Type: application/json" \
  -d '{
    "product_version": "v2.1.x",
    "target_frameworks": ["ISO 27001"],
    "status": "approved",
    "model_data": { "threat_model": { "threats": [
      { "id": "S1", "stride_category": "spoofing", "affected_component": "Legacy Auth" }
    ] } }
  }'
```

**Assert**: `200 { seeded: true }`; row has `source: 'manual_seed'`, and it now serves as an inheritance baseline for any version whose `previous_version_id` points at `v2.1.x`. A non-privileged user gets `403`; a payload without `threat_model.threats` gets `400`.

---

## 6. Delta confidence

1. Upload a version document that introduces a clear new feature (e.g. an SAD mentioning a new WebRTC channel).
2. ```sql
   select feature_slug, extraction_confidence, needs_review, source_document_id
     from product_version_deltas order by updated_at desc limit 10;
   ```
3. **Assert**: rows carry a confidence; low-confidence ones are `needs_review = true`.
4. Generate a threat model for that version with any flagged deltas → response `limitations` includes the "flagged low-confidence" warning.

---

## Rollback

All changes are additive. To roll back code, revert the branch. The migrations
only ADD a table/columns (safe to leave); if you must drop:

```sql
drop table if exists control_evaluation_cache;
alter table product_versions drop column if exists previous_version_id;
alter table threat_models drop column if exists baseline_model_id, drop column if exists source;
alter table product_version_deltas
  drop column if exists extraction_confidence,
  drop column if exists needs_review,
  drop column if exists source_document_id;
```
