# Implementation Plan: Analysis Flow Hardening

**Branch**: `claude/analysis-flow-caching-08g0h9` | **Date**: 2026-07-02 | **Spec**: `specs/002-analysis-flow-hardening/spec.md`

## Summary

Three hardening streams on top of `specs/001`:

1. **Fail-closed Standard API fallback** — invert the fallback default to opt-in, flag all estimates, exclude them from cache, distinguish grounded-DB computations from LLM/heuristic invention in logging.
2. **Version-baseline lineage** — explicit `previous_version_id`, post-hoc inheritance diff, and a manual seed endpoint to bootstrap history.
3. **Provenance & telemetry** — delta extraction confidence, RAG `searchSource`, and cache hit-rate logging.

Technique: **ponytail** — reuse `logger`/Sentry, the `(client as any)` untyped-table convention, the existing RBAC pattern, and `specs/001`'s fingerprint helpers; add the smallest new surface (one lineage module, one seed route, one migration) rather than reworking the engine.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| VI. Security & Compliance First | ✅ | Seed endpoint is RBAC-gated (admin/ionic_user); new table columns carry no secrets. |
| VIII. Minimize API / Never Fabricate | ✅ REINFORCED | This feature is the hardening of VIII: fail-closed fallback + estimate flagging + no-cache-of-estimates. Constitution bumped to v1.2.0. |
| Single Source of Truth | ✅ | Lineage logic centralized in `src/lib/threat-modeling/lineage.ts`; fallback gating in one `isLocalFallbackEnabled()`. |

## Files

### New
```
supabase/migrations/20260702_version_baseline_lineage.sql
src/lib/threat-modeling/lineage.ts
src/app/api/threat-modeling/seed/route.ts
tests/unit/standard-api/fallback.test.ts
tests/unit/threat-modeling/lineage.test.ts
docs/RUNBOOK_analysis_flow_validation.md
specs/002-analysis-flow-hardening/{spec,plan,tasks}.md
```

### Modified
```
src/lib/standard-api/client.ts        # opt-in fallback, estimate flagging, severity-split logging
src/lib/standard-api/types.ts         # EstimatedResultMarker on result types
src/lib/assessment/engine.ts          # consume is_estimated; never cache estimates; carry searchSource
src/lib/assessment/persistence.ts     # needs_review for estimates; record searchSource/isEstimated
src/lib/assessment/corpus-fingerprint.ts  # getDeltaFingerprint returns needsReviewCount
src/lib/assessment/delta-extractor.ts # per-delta confidence + DELTA_REVIEW_THRESHOLD
src/lib/chat/rag-search.ts            # searchSource on every result
src/app/api/threat-modeling/route.ts  # lineage/inheritance, needs-review warning, telemetry, source column
src/app/api/assessments/run/route.ts  # cache hit-rate telemetry
src/app/api/documents/upload/route.ts + [id]/reindex/route.ts  # persist delta confidence/review/source
README.md, .specify/memory/constitution.md, docs/THREAT_MODELING_GUIDE.md
tests/unit/{assessment/*,test_threat_modeling_post}.test.ts  # coverage + fix pre-existing failure
```

## Work Streams (status)

| ID | Task | Status |
|----|------|--------|
| H1 | Fail-closed fallback + estimate flagging + logging | Done |
| H2 | Engine: consume/flag estimates, never cache them | Done |
| H3 | Migration: previous_version_id, threat lineage cols, delta confidence cols | Done |
| H4 | Lineage module + inheritance diff in route | Done |
| H5 | Seed endpoint | Done |
| H6 | Delta confidence extraction + persistence + warning | Done |
| H7 | RAG searchSource + cache hit-rate telemetry | Done |
| H8 | Tests (fallback gating, lineage, delta review, persistence provenance) + fix pre-existing failing test | Done |
| H9 | Docs (constitution, README env, guide) + validation RUNBOOK | Done |
| H10 | *(Deferred)* UI: surface inherited/new + estimated badges; seed form; regenerate Supabase types to drop casts | Not started — see tasks.md |
| H11 | *(Operator)* Live-DB validation per RUNBOOK (migrations + E2E) | Pending — requires live Supabase/GRC |

## Live-schema findings (from `types.generated.ts`, the real DB)

Inspected the real schema via the generated types (the live host is blocked by
this environment's egress policy, so REST access was not possible; the
generated types are extracted from the real DB and are authoritative for column
existence).

- ✅ `assessments` (17 cols) exists and matches what `assessments/run` + `grc-trigger` write. The `assessments` vs `compliance_assessments` worry is **not** a bug — both tables exist; the app writes `assessments`.
- ✅ `evidence_evaluations` (17 cols) already has every column `buildEvidenceBatch` writes (`chunk_id, scf_control_code, control_requirement, evidence_text, trace_id, needs_review, evidence_sources, …`). The provenance change lands inside the `evidence_sources` JSONB — safe.
- ⚠️ The real DB has drifted from the tracked migrations (e.g. `product_versions.is_default`, the `assessments` table itself are not in any migration). Migration discipline cannot be assumed.
- 🔴 The real DB does NOT yet have the columns this feature adds: `threat_models.{baseline_model_id,source}`, `product_versions.previous_version_id`, `product_version_deltas.{extraction_confidence,needs_review,source_document_id}`, nor the `control_evaluation_cache` table (specs/001).

**Consequence & mitigation:** because of the drift, the new code must NOT hard-depend on its own migrations being applied first. Added graceful degradation so every new-column write falls back to base columns when the migration is absent:
- `resolveVersionContext` retries `select('id')` if `previous_version_id` is missing (H12).
- Threat-model insert retries without `baseline_model_id/source` (H12).
- `persistDeltas()` retries base columns if confidence columns are missing (H12).
- `getDeltaFingerprint` already tolerated the missing columns; `control_evaluation_cache` reads/writes already degrade to no-cache on error.

| ID | Task | Status |
|----|------|--------|
| H12 | Graceful degradation when lineage migration not yet applied (retry base columns) + regression tests | Done |

## Complexity Tracking

`(admin as any)` casts remain for columns not yet in the generated Supabase types (previous_version_id, baseline_model_id, source, extraction_confidence). Consistent with the existing codebase convention; resolved by regenerating types (H10). No other justified complexity.
