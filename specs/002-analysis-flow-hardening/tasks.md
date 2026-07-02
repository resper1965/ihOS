---
description: "Task list for analysis-flow hardening"
---

# Tasks: Analysis Flow Hardening

**Input**: `specs/002-analysis-flow-hardening/{spec,plan}.md`

## Phase 1: Fail-closed Standard API fallback (US1)

- [X] T001 `isLocalFallbackEnabled()` opt-in gate (`GRC_LOCAL_FALLBACK_ENABLED`, legacy `GRC_FALLBACK_DISABLED` still hard-off)
- [X] T002 Split static-catalog fallback (always served) from evaluation fallback (gated)
- [X] T003 `EstimatedResultMarker` on result types; `withEstimatedMarker()` stamps `is_estimated`/`estimation_note`
- [X] T004 Severity-split logging (error for LLM/heuristic, warn for grounded DB) with endpoint + reason
- [X] T005 Engine consumes `is_estimated`: prefix `[ESTIMATED]`, mark evaluation, EXCLUDE from `control_evaluation_cache`
- [X] T006 Persistence: estimates → `needs_review`; record `searchSource`/`isEstimated` in `evidence_sources`
- [X] T007 [P] Tests: fail-closed default, opt-in, legacy override (`tests/unit/standard-api/fallback.test.ts`)

## Phase 2: Version lineage (US2, US3)

- [X] T010 Migration: `product_versions.previous_version_id`, `threat_models.{baseline_model_id,source}`, `product_version_deltas.{extraction_confidence,needs_review,source_document_id}`
- [X] T011 `src/lib/threat-modeling/lineage.ts`: `resolveVersionContext`, `findBaselineModel`, `annotateInheritance`
- [X] T012 Route: inheritance diff, `source`/`baseline_model_id` persisted, inheritance metadata + response fields
- [X] T013 `POST /api/threat-modeling/seed` (RBAC-gated, no engine call, `source: manual_seed`)
- [X] T014 [P] Tests: inheritance diff cases (`tests/unit/threat-modeling/lineage.test.ts`)

## Phase 3: Provenance & telemetry (US4)

- [X] T020 Delta extractor emits per-delta `confidence`; `DELTA_REVIEW_THRESHOLD`
- [X] T021 Persist `extraction_confidence`/`needs_review`/`source_document_id` at both upsert sites
- [X] T022 `getDeltaFingerprint` returns `needsReviewCount`; route adds low-confidence-delta warning
- [X] T023 RAG `searchSource` on every result; assessment cache hit-rate telemetry log
- [X] T024 [P] Tests: delta needs_review count, persistence provenance, forceReevaluate default

## Phase 4: Governance & docs

- [X] T030 Constitution v1.2.0 (fail-closed fallback wording)
- [X] T031 README env var doc (`GRC_LOCAL_FALLBACK_ENABLED`)
- [X] T032 `docs/THREAT_MODELING_GUIDE.md` (inheritance, seed, needs_review warning)
- [X] T033 `docs/RUNBOOK_analysis_flow_validation.md` (live-DB migration + E2E steps)
- [X] T034 Fix pre-existing failing test `test_threat_modeling_post` (mock now echoes inserted row)
- [X] T035 This spec/plan/tasks set

## Phase 5: Live-schema hardening (from real-schema inspection)

- [X] H12a Graceful degradation: `resolveVersionContext` retries `id`-only when `previous_version_id` is absent
- [X] H12b Graceful degradation: threat-model insert retries without `baseline_model_id/source`
- [X] H12c `persistDeltas()` helper (dedups upload/reindex) with base-column fallback
- [X] H12d Regression tests for both fallbacks (`persist-deltas.test.ts`, `lineage.test.ts`)
- [X] H12e One-shot SQL diagnostic+migration for the Supabase SQL Editor (`docs/sql/analysis_flow_validation.sql`)

## Deferred

- [ ] T040 UI: badges for inherited vs. new threats and estimated evaluations; seed-baseline form; "previous version" selector in Settings → Versions.
- [ ] T041 Regenerate Supabase generated types (live DB) to drop `(admin as any)` casts for the new columns/tables.
- [ ] T042 Persist cache hit-rate telemetry to a queryable store (not just logs) for a real API-savings dashboard.
- [ ] T043 [Operator] Run `docs/RUNBOOK_analysis_flow_validation.md` against staging: apply migrations, run 2× assessment (assert cache hit-rate), generate + regenerate threat model (assert `cached:true`), seed a baseline, verify inheritance. Confirm `GRC_LOCAL_FALLBACK_ENABLED` is unset in production.
- [ ] T044 Consider category-scoped corpus fingerprint (only invalidate controls whose document category changed) — pending telemetry from T023 showing over-invalidation is real.
