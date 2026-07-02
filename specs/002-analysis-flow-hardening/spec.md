# Feature Specification: Analysis Flow Hardening — Fail-Closed Fallback, Version Lineage & Provenance

**Feature Branch**: `claude/analysis-flow-caching-08g0h9`

**Created**: 2026-07-02

**Status**: Implemented (pending live-DB validation — see RUNBOOK)

**Input**: Follow-up to `specs/001-analysis-flow-caching/` after a critical review that surfaced three gaps: (1) the Standard API local fallback fabricated/estimated evaluations by default with no visibility; (2) there was no persistent notion of a "previous version" for threat analysis, and no way to seed one when no history exists; (3) no provenance/telemetry to prove the caching actually reduced API usage or to audit which RAG path answered.

## Problem Statement

`specs/001` introduced persisted evaluation caches. Review found the caching sat on top of two unaddressed integrity risks:

1. **Silent estimation (Standard API).** `src/lib/standard-api/client.ts` fell back to local LLM-judged / hardcoded results on any real-API failure or `401/403`, gated by an *opt-out* flag (`GRC_FALLBACK_DISABLED`) that was undocumented and almost certainly unset in production — meaning estimated compliance data was likely being served as authoritative, and could even be cached by `specs/001`.
2. **No cross-version accumulation.** Threat modeling reused analyses *within* a version but had no `previous_version_id`, no inheritance, and no way to seed a baseline when a version had no history — so "accumulate and vary only by the delta" was impossible across versions.
3. **No provenance.** No signal recorded whether an evaluation was estimated, which RAG path produced it, or how much the cache actually saved.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Fail-closed Standard API fallback (Priority: P1)

An operator runs an assessment while the Standard GRC Engine API is down or denies scope.

**Independent Test**: With no fallback flag set, the client rejects (surfacing a gap) instead of returning an estimate.

**Acceptance Scenarios**:

1. **Given** `GRC_LOCAL_FALLBACK_ENABLED` is unset, **When** the real API fails, **Then** the client throws (`GRC_API_UNAVAILABLE`/`NETWORK_ERROR`) and the engine marks the control `[EVALUATION_ERROR]` — never a silent estimate.
2. **Given** `GRC_LOCAL_FALLBACK_ENABLED=true`, **When** the real API fails, **Then** a local estimate is produced, flagged `is_estimated: true` with an `estimation_note`, and a high-severity log/Sentry event is emitted.
3. **Given** an estimated evaluation, **Then** it is NEVER written to `control_evaluation_cache` and is marked `needs_review` in `evidence_evaluations`.
4. **Given** the legacy `GRC_FALLBACK_DISABLED=true`, **Then** the fallback is forced off regardless of the opt-in flag.
5. **Given** the API is down, **Then** static SCF reference data (frameworks/versions/controls catalog) is still served (reference data, not an evaluation).

---

### User Story 2 — Accumulated threat analysis across versions (Priority: P1)

An architect declares that version `v2.3.x` builds on `v2.2.x`, then generates a threat model for `v2.3.x`.

**Independent Test**: With a declared `previous_version_id` and an approved prior model, the new model labels inherited vs. new threats.

**Acceptance Scenarios**:

1. **Given** `v2.3.x.previous_version_id = v2.2.x` and an approved `v2.2.x` threat model, **When** a `v2.3.x` model is generated, **Then** each threat is labelled `is_new` / `inherited_from_version` by matching `stride_category + affected_component`, and metadata records `baseline_model_id`, `inherited_threat_count`, `new_threat_count`.
2. **Given** no `previous_version_id`, **Then** all threats are treated as new (backward-compatible).
3. **Honest limitation**: the external engine is NOT incremental — inheritance is a post-hoc diff on the ihOS side; the response and stored `source` field make this explicit (`generated` vs `inherited`).

---

### User Story 3 — Seed a baseline when no history exists (Priority: P1)

An operator imports a pre-existing threat analysis (from a spreadsheet/prior tool) as the approved baseline for a version that has no persisted history.

**Independent Test**: `POST /api/threat-modeling/seed` with a payload persists it with `source: 'manual_seed'` and it becomes usable as an inheritance baseline.

**Acceptance Scenarios**:

1. **Given** an admin/ionic_user posts a valid `model_data` payload, **Then** a `threat_models` row is created with `status` (default `approved`), `source: 'manual_seed'`, and provenance (`seeded_by`, `seeded_at`) — the GRC engine is NOT called and nothing is fabricated.
2. **Given** a non-privileged user, **Then** the request is rejected `403`.
3. **Given** a malformed payload (no `threat_model.threats`), **Then** `400` with a validation message.

---

### User Story 4 — Provenance & telemetry (Priority: P2)

A maintainer needs to prove the cache reduced API usage and audit which RAG path/estimation produced each evaluation.

**Acceptance Scenarios**:

1. **Given** an assessment completes, **Then** a structured log records `fromCache`, `freshlyEvaluated`, `estimatedResults`, and `cacheHitRate`.
2. **Given** each evaluation, **Then** `evidence_evaluations.evidence_sources` records `searchSource` (`ihos-engine` | `supabase-fallback`) and `isEstimated`.
3. **Given** each extracted product-version delta, **Then** `extraction_confidence` and `needs_review` are persisted; deltas below `DELTA_REVIEW_THRESHOLD` (0.6) are flagged, and a threat-model generation with flagged deltas adds a `limitations` warning.

### Edge Cases

- `previous_version_id` points to a version with no threat models → no baseline, all new (no crash).
- Fallback enabled but the local computation itself errors → returns its own error-shaped estimate, still flagged.
- Delta extractor omits confidence (older payloads) → treated as needs_review via absence handling.
- Seed payload with extra fields → allowed (passthrough), provenance still stamped.

## Requirements *(mandatory)*

- **FR-001**: The Standard API local fallback MUST be opt-in (`GRC_LOCAL_FALLBACK_ENABLED`), default fail-closed; legacy `GRC_FALLBACK_DISABLED=true` forces off.
- **FR-002**: Every fallback result MUST carry `is_estimated: true` + `estimation_note` and emit a log/Sentry event (error-level for LLM/heuristic endpoints, warn-level for grounded DB computations).
- **FR-003**: Estimated evaluations MUST NOT be cached and MUST be flagged `needs_review` in persistence.
- **FR-004**: Static SCF catalog reference data MAY still be served on outage regardless of the flag.
- **FR-005**: `product_versions` MUST support an explicit, admin-set `previous_version_id`.
- **FR-006**: Threat generation MUST diff against the previous version's approved model and label inherited vs. new threats + lineage metadata; persisted `source` distinguishes `generated`/`inherited`/`manual_seed`.
- **FR-007**: `POST /api/threat-modeling/seed` MUST allow privileged users to import a baseline without calling the engine.
- **FR-008**: The delta extractor MUST emit per-delta `confidence`; low-confidence deltas MUST be flagged `needs_review` and surfaced as a coverage warning.
- **FR-009**: RAG results MUST record which path produced them (`searchSource`); assessments MUST log cache hit-rate telemetry.

### Key Entities

- **control_evaluation_cache** (from specs/001): now explicitly excludes estimated results.
- **product_versions.previous_version_id**: declared lineage.
- **threat_models.baseline_model_id / source**: inheritance provenance.
- **product_version_deltas.extraction_confidence / needs_review / source_document_id**: delta trust.
- **evidence_evaluations.evidence_sources.{searchSource,isEstimated}**: per-evaluation provenance.

## Success Criteria *(mandatory)*

- **SC-001**: With the flag unset, zero estimated results are returned or cached — failures surface as gaps.
- **SC-002**: A regenerated threat model for a version with a declared, approved baseline reports `inherited_threats > 0` when threats overlap.
- **SC-003**: A seeded baseline is retrievable and usable as inheritance input without any engine call.
- **SC-004**: Assessment logs expose a `cacheHitRate` metric; evaluation rows expose `searchSource`.

## Assumptions

- `stride_category + affected_component` is a good-enough identity for threat inheritance matching in v1 (coarser than full semantic equivalence; acceptable because it only affects labelling, not whether a threat is present).
- The external GRC engine remains non-incremental; if it later exposes partial generation, `applied_deltas`/`baseline_model_id` already provide the bookkeeping to adopt it.
- Live-DB validation (migrations + E2E) is performed by an operator per the RUNBOOK; this session validated via typecheck + unit tests only (no live Supabase/GRC access).
