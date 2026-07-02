# Implementation Plan: Analysis Flow — Persisted Evaluation Cache & No-Fabrication Guarantee

**Branch**: `claude/analysis-flow-caching-08g0h9` | **Date**: 2026-07-02 | **Spec**: `specs/001-analysis-flow-caching/spec.md`

## Summary

Two changes to the existing, functional analysis flows:

1. **GRC Assessment Engine** (`src/lib/assessment/engine.ts`) gains a persisted per-control evaluation cache (`control_evaluation_cache`), invalidated by a document-corpus fingerprint, so repeated assessment runs stop re-calling RAG search and the Standard GRC Engine API for controls whose source documentation hasn't changed.
2. **Threat Modeling** (`src/app/api/threat-modeling/route.ts`) gains an accumulated-delta cache keyed off `product_version_deltas`, and the hardcoded mock-fallback (`createMockThreatModel`) is deleted outright — engine failures now surface as an explicit `GRC_ENGINE_UNAVAILABLE` gap instead of fabricated data.

Applied technique: **ponytail** (lazy-senior-dev minimization) — reuse the existing `GRC_FALLBACK_DISABLED` precedent for "don't invent, warn instead," reuse the existing `(client as any).from(<untyped-table>)` cast convention already used for `product_version_deltas`, and avoid introducing new abstractions where a plain cache-check-then-call suffices.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode), Next.js 16 App Router

**Primary Dependencies**: Supabase JS v2 (admin client, bypasses RLS for cache reads/writes), existing `standard-api` / `ihos-engine` clients (unchanged contracts — no new fields sent to the external API)

**Storage**: New table `control_evaluation_cache` (migration `20260702_control_evaluation_cache.sql`); reuses existing `product_version_deltas` and `threat_models` tables (additive use only — no schema change needed there, deltas already accumulate via upsert since the pre-existing document-upload pipeline).

**Testing**: Vitest unit tests — `tests/unit/assessment/corpus-fingerprint.test.ts` (new, full behavioral coverage of the fingerprint helpers) and additions to `tests/unit/assessment/engine.test.ts` / `tests/unit/test_threat_modeling_post.test.ts` (type-shape + no-fabrication regression tests), matching each file's existing testing style.

**Performance Goals**: A re-run with zero document changes should approach O(1) external API calls (SCF catalog page load + per-framework `complianceScore` only) instead of O(controls).

**Constraints**: Must not change the external Standard GRC Engine / ihos-api request contracts (no invented parameters); must not weaken the existing `evidence_evaluations` audit trail; cache must be scope-correct (product version + sales channel + mode) so a GEHC-channel evaluation is never served for a Direct-channel run.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Dual-Stack Architecture | ✅ PASS | No changes to the ihos-api contract; all caching logic lives in ihOS (Next.js) only. |
| III. Single Source of Truth | ✅ PASS | Cache read/write logic lives in one place per flow (`engine.ts`, `threat-modeling/route.ts`); fingerprint helpers centralized in `corpus-fingerprint.ts`. |
| IV. React Query for Server State | ✅ PASS | `useRunAssessment` mutation extended with `forceReevaluate`, no raw fetch introduced. |
| V. Dual-Phase Compliance Evaluation | ✅ PASS | Cache stores the full dual-phase `ControlEvaluation` unchanged; `[EVALUATION_ERROR]` results are explicitly excluded from caching (never persisted as "current state"). |
| VI. Security & Compliance First | ✅ PASS | New table has RLS enabled (`SELECT` for authenticated, write via `service_role` only, matching `product_version_deltas` precedent). |
| **New: Minimize External API Usage & Never Fabricate Evaluations** | ✅ PASS | See constitution amendment (Principle VIII) — this feature is the reference implementation. |

**Constitution Amendment**: Added Principle VIII (see `.specify/memory/constitution.md` v1.1.0) codifying the "cache until the source changes, never invent, always warn on gaps" pattern established by this feature, so future analysis flows follow the same rule instead of re-deriving it.

## Project Structure

### New files

```text
supabase/migrations/20260702_control_evaluation_cache.sql   # cache table + RLS
src/lib/assessment/corpus-fingerprint.ts                    # getCorpusFingerprint(), getDeltaFingerprint()
tests/unit/assessment/corpus-fingerprint.test.ts
specs/001-analysis-flow-caching/{spec,plan,tasks}.md
```

### Modified files

```text
src/lib/assessment/engine.ts                  # cache read (pre-loop) + write (post-batch); forceReevaluate; cache stats
src/lib/assessment/persistence.ts             # RunAssessmentRequestSchema += forceReevaluate
src/app/api/assessments/run/route.ts          # pass forceReevaluate through
src/hooks/queries/use-assessments.ts          # useRunAssessment mutation body += forceReevaluate
src/components/assessments/run-assessment-modal.tsx  # "Force re-evaluation" checkbox + cache-reuse summary
src/app/api/threat-modeling/route.ts          # delta-fingerprint cache; createMockThreatModel deleted; GRC_ENGINE_UNAVAILABLE error path
tests/unit/assessment/engine.test.ts          # type-shape coverage for new fields
tests/unit/test_threat_modeling_post.test.ts  # no-fabrication + gap-warning regression tests
.specify/memory/constitution.md               # Principle VIII amendment
docs/THREAT_MODELING_GUIDE.md                 # caching/no-fabrication behavior documented for operators
```

**Structure Decision**: No structural changes — this slots into the existing `src/lib/assessment/` and `src/app/api/` layout. No new lib directory needed.

## Work Streams (status)

| ID | Task | Status |
|----|------|--------|
| W1 | `control_evaluation_cache` migration + RLS | Done |
| W2 | `corpus-fingerprint.ts` (doc + delta fingerprints) | Done |
| W3 | Engine cache read/write + `forceReevaluate` + cache stats | Done |
| W4 | Assessment API/hook/UI plumbing for `forceReevaluate` | Done |
| W5 | Threat-modeling delta cache + mock-fallback removal + gap warning | Done |
| W6 | Constitution amendment (Principle VIII) | Done |
| W7 | Tests (fingerprint behavior, no-fabrication regression, type coverage) | Done |
| W8 | Docs update (`THREAT_MODELING_GUIDE.md`) | Done |
| W9 | *(Deferred — see tasks.md)* Regenerate Supabase generated types to drop the `(admin as any)` casts for `control_evaluation_cache` | Not started |
| W10 | *(Deferred — see tasks.md)* Surface `cached: true` state in the Threat Modeling UI (badge/toast) | Not started |

## Complexity Tracking

No constitution violations requiring justification. The two `(admin as any)` casts in `engine.ts` follow the pre-existing convention for tables not yet in the generated Supabase types (same pattern already used for `product_version_deltas` in `documents/upload/route.ts`) — tracked as deferred work (W9), not new debt invented by this feature.
