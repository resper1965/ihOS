---
description: "Task list for the analysis-flow caching feature"
---

# Tasks: Analysis Flow — Persisted Evaluation Cache & No-Fabrication Guarantee

**Input**: `specs/001-analysis-flow-caching/spec.md`, `specs/001-analysis-flow-caching/plan.md`

## Phase 1: Foundational

- [X] T001 Create `control_evaluation_cache` migration with RLS (`supabase/migrations/20260702_control_evaluation_cache.sql`)
- [X] T002 [P] Implement `getCorpusFingerprint()` + `getDeltaFingerprint()` (`src/lib/assessment/corpus-fingerprint.ts`)
- [X] T003 [P] Unit tests for both fingerprint helpers (`tests/unit/assessment/corpus-fingerprint.test.ts`)

## Phase 2: User Story 1 — Reuse persisted control evaluations (P1)

- [X] T010 Compute `corpusFingerprint` + `scopeKey` and bulk-load `control_evaluation_cache` before the evaluation loop (`src/lib/assessment/engine.ts`)
- [X] T011 Early-return cached evaluations inside the per-control batch callback, marking `fromCache: true`
- [X] T012 Bulk-upsert freshly-evaluated (non-error) controls to the cache after each batch
- [X] T013 Add `forceReevaluate` to `AssessmentConfig`, `RunAssessmentRequestSchema`, `POST /api/assessments/run`, `useRunAssessment`
- [X] T014 "Force re-evaluation" checkbox + cache-reuse summary in `RunAssessmentModal`
- [X] T015 [P] Type-shape tests for `forceReevaluate` / `fromCache` / `totalFromCache` (`tests/unit/assessment/engine.test.ts`)

## Phase 3: User Story 2 — Threat modeling varies only from deltas (P1)

- [X] T020 Resolve `product_versions.id` from the client-supplied `version_code` string
- [X] T021 Compute `delta_fingerprint` from `product_version_deltas` and compare against the latest matching `threat_models` row before calling the engine
- [X] T022 Stamp `delta_fingerprint` + `applied_deltas` into `model_data.metadata` on fresh generations
- [X] T023 `force_reevaluate` body param to bypass the cache on demand

## Phase 4: User Story 3 — Never fabricate; warn on gaps (P1)

- [X] T030 Delete `createMockThreatModel()` and the silent fallback-on-failure branch
- [X] T031 Return `502 GRC_ENGINE_UNAVAILABLE` with a explanatory message when the external engine call fails; do not insert a `threat_models` row
- [X] T032 Append a `limitations` gap warning when a product version has zero extracted deltas
- [X] T033 [P] Regression tests: no fabricated data on engine failure, gap warning present (`tests/unit/test_threat_modeling_post.test.ts`)

## Phase 5: Governance & Docs

- [X] T040 Amend `.specify/memory/constitution.md` with Principle VIII (API-usage minimization + no-fabrication)
- [X] T041 Update `docs/THREAT_MODELING_GUIDE.md` with the caching/no-fabrication behavior
- [X] T042 This spec/plan/tasks set

## Deferred (not in this pass)

- [ ] T050 Regenerate Supabase generated types (`npx supabase gen types typescript`) so `control_evaluation_cache` (and pre-existing untyped tables: `assessments`, `product_version_deltas`, `threat_models`) no longer need `(admin as any)` casts. Requires a live DB connection this session did not have.
- [ ] T051 Surface `cached: true` from `POST /api/threat-modeling` in the UI (e.g. a "Reused from last analysis — no product changes detected" badge on the generate modal / detail page), mirroring the cache-reuse summary already added to the assessments modal (T014).
- [ ] T052 If/when the external ihos-api GRC engine exposes an incremental "evaluate only these deltas" endpoint, wire `applied_deltas` from T022 into the request instead of doing a full regeneration — currently the ihOS side only decides *whether* to call the engine, not *what subset* to ask it to evaluate (see spec.md Assumptions).
- [X] T053 Fixed in `specs/002-analysis-flow-hardening` (T034): the test now mocks the admin client so `insert().select().single()` echoes the inserted row, matching real Supabase behavior. Full suite green.
