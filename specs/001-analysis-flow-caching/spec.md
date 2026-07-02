# Feature Specification: Analysis Flow — Persisted Evaluation Cache & No-Fabrication Guarantee

**Feature Branch**: `claude/analysis-flow-caching-08g0h9`

**Created**: 2026-07-02

**Status**: Implemented

**Input**: User description (pt-BR): "analize profundamente a aplicação, principalmente o fluxo de análises. A aplicação conta com um modelo documental em RAG que são as fontes da verdade da atual situação dos controles dos produtos. Minimizar o uso da API: já avaliando e persistindo a situação frente aos controles, e só reavaliando sob demanda ou atualização da documentação. O GRC avalia a situação frente a diversos standards. O threat modeling deve avaliar o status de adequação frente a novas features do produto, geradas a partir de documentos da versão — persistir a última análise para controles acumulados e só variar a partir das diferenças. Usar a standard API, não inventar avaliações; se houver gaps para avaliação, avisar, pois isso deve ser resolvido na API externa."

## Problem Statement

The RAG document corpus (`compliance_documents` / `document_chunks`) is the source of truth for whether a product control is currently satisfied. Before this change, both analysis flows re-derived that state from scratch on every request:

- **GRC Assessment Engine** (`runAssessment`) called RAG search + the Standard GRC Engine API (`evaluate-evidence`) for every SCF control on every run, even when the underlying documentation had not changed since the previous run.
- **Threat Modeling** (`POST /api/threat-modeling`) called the external ihos-api GRC engine from scratch on every request, with no notion of "what changed since the last accumulated analysis." Worse, when the external engine was unavailable, the route silently fabricated a fixed, hardcoded threat model (`createMockThreatModel`, always `T-001`/`T-002`) and returned it as if it were a real result — with no indicator surfaced to the UI that the data was invented.

This wasted external API budget (OpenAI + Standard GRC Engine calls) and, in the threat-modeling case, risked presenting compliance officers with entirely fictitious findings.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Reuse persisted control evaluations until documentation changes (Priority: P1)

A compliance officer re-runs a GRC assessment after no new documents were uploaded. The engine should reuse the last evaluation for every control instead of re-querying RAG and the Standard GRC Engine API.

**Why this priority**: Directly implements "minimizar o uso da API" — this is the core ask.

**Independent Test**: Run a quick/deep assessment twice in a row with no document changes in between; the second run's `totalFromCache` should equal `totalControlsEvaluated`, and no new rows should need to be written to `evidence_evaluations`/RAG calls for those controls.

**Acceptance Scenarios**:

1. **Given** a control was evaluated for product version X and no `compliance_documents` row scoped to X (or global) changed since, **When** the assessment re-runs, **Then** the control's evaluation is served from `control_evaluation_cache` (`fromCache: true`) without calling `searchDocuments` or `standardApi.evaluateEvidence`.
2. **Given** a document relevant to that scope is uploaded, updated, or reindexed, **When** the assessment re-runs, **Then** the corpus fingerprint changes and the control is re-evaluated fresh.
3. **Given** the officer checks "Force re-evaluation" in the Run Assessment modal, **When** the assessment runs, **Then** every control is re-evaluated regardless of the cache (on-demand override).
4. **Given** an evaluation ends in `[EVALUATION_ERROR]`, **When** the batch completes, **Then** that result is NOT written to the cache (a transient API failure must never be persisted as "current state").

---

### User Story 2 — Threat modeling varies only from accumulated product-version deltas (Priority: P1)

A security architect regenerates a threat model for a product version where no new technical features were extracted since the last analysis.

**Why this priority**: Implements "persistir a última análise de threat para controles acumulados e só variar a partir das diferenças."

**Independent Test**: Extract deltas for version X (via document upload), generate a threat model, then generate again with no new deltas — the second call must return the persisted model (`cached: true`) without calling the external GRC engine.

**Acceptance Scenarios**:

1. **Given** `product_version_deltas` for a product version has not changed (same `feature_slug` + `updated_at` set) since the last `threat_models` row for the same version + framework set, **When** a new generation is requested, **Then** the persisted model is returned (`cached: true`) and the external engine is not called.
2. **Given** a new delta is extracted (new feature uploaded in version documentation), **When** generation is requested, **Then** the delta fingerprint no longer matches and the engine is called again.
3. **Given** the caller passes `force_reevaluate: true`, **When** generation is requested, **Then** the cache is bypassed unconditionally.

---

### User Story 3 — Never fabricate an evaluation; surface gaps instead (Priority: P1)

When the external Standard/ihos GRC engine cannot produce a result, the system must say so — not invent one.

**Why this priority**: Direct, explicit user requirement: "não invente avaliações... avise pois isso deve ser resolvido na api externa."

**Independent Test**: Force `ihosEngine.generateThreatModel` to reject; the API must respond with a structured error, never a 200 with synthetic threat data.

**Acceptance Scenarios**:

1. **Given** the external GRC engine call fails (network error, 5xx, timeout), **When** `POST /api/threat-modeling` handles it, **Then** it returns HTTP 502 with `{ error: "GRC_ENGINE_UNAVAILABLE" }` and no `threat_models` row is inserted.
2. **Given** a product version has zero rows in `product_version_deltas`, **When** a threat model is generated, **Then** the response's `limitations` array includes an explicit gap notice recommending version documentation upload or external resolution — never silently omitted.
3. **Given** the GRC Standard API resiliency fallback (`tryLocalFallback` in `standard-api/client.ts`) is invoked for compliance scoring/evidence evaluation, **Then** it remains gated by `GRC_FALLBACK_DISABLED` (pre-existing kill switch) — unchanged by this feature, documented here as the sibling mechanism to the threat-modeling gap-warning behavior.

---

### Edge Cases

- Corpus fingerprint query returns zero documents → fingerprint is a stable hash of "empty"; first evaluation is always a cache miss.
- `product_version` string sent by the client does not match any `product_versions.version_code` → delta fingerprint falls back to `"no-product-version-match"`, deltas treated as empty, gap warning is added.
- Two assessments run concurrently for the same scope → last upsert wins (acceptable: cache is a best-effort optimization, not a correctness-critical store — `evidence_evaluations` remains the audit trail of record).
- A control that previously existed in the cache is no longer part of the selected frameworks → simply not read (cache is looked up by control ID actually being evaluated in this run).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The assessment engine MUST persist each fresh control evaluation to `control_evaluation_cache`, keyed by `(control_code, mode, scope_key)` where `scope_key` encodes `product_version_id` + `sales_channel`.
- **FR-002**: The assessment engine MUST compute a `corpus_fingerprint` (hash of published-document count + latest `updated_at`, scoped to global + the target product version) once per run and compare it against each cached row before deciding to reuse it.
- **FR-003**: The assessment engine MUST support an explicit `forceReevaluate` flag that bypasses the cache entirely.
- **FR-004**: The assessment engine MUST NOT cache `[EVALUATION_ERROR]` results.
- **FR-005**: `POST /api/threat-modeling` MUST compute a `delta_fingerprint` from `product_version_deltas` for the resolved product version and compare it against the `delta_fingerprint` stamped in the most recent matching `threat_models` row before calling the external engine.
- **FR-006**: `POST /api/threat-modeling` MUST NOT fabricate threat data when the external engine call fails. It MUST return an error response (`GRC_ENGINE_UNAVAILABLE`, HTTP 502) instead.
- **FR-007**: `POST /api/threat-modeling` MUST surface a coverage-gap warning in the response `limitations` when no product-version deltas exist for the requested version.
- **FR-008**: Both flows MUST support an on-demand override (`forceReevaluate` / `force_reevaluate`) so users can force a fresh evaluation regardless of cache state.

### Key Entities

- **control_evaluation_cache**: Persisted last-known `ControlEvaluation` per SCF control / scope (`product_version_id` + `sales_channel` + `mode`), invalidated by `corpus_fingerprint`.
- **product_version_deltas** *(pre-existing, now load-bearing for caching)*: Accumulated technical feature deltas extracted from version documentation; its aggregate fingerprint drives threat-model reuse.
- **threat_models** *(pre-existing)*: Now stamped with `model_data.metadata.delta_fingerprint` and `applied_deltas` so future requests can detect "nothing changed."

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Re-running a quick/deep assessment with an unchanged document corpus results in `totalFromCache === totalControlsEvaluated` (zero RAG/Standard-API calls for those controls).
- **SC-002**: Regenerating a threat model with no new `product_version_deltas` returns `cached: true` and does not invoke `ihosEngine.generateThreatModel`.
- **SC-003**: 100% of `POST /api/threat-modeling` failure responses return a structured `GRC_ENGINE_UNAVAILABLE` error — zero fabricated threat records are ever persisted or returned.
- **SC-004**: Every threat model generated for a product version with zero extracted deltas carries an explicit `limitations` entry describing the coverage gap.

## Assumptions

- The published `compliance_documents.updated_at` (maintained by the existing `set_updated_at` trigger) is a sufficient, if coarse, signal for "documentation changed" — no finer-grained per-chunk diffing is required for v1.
- `product_version_deltas` extraction (`extractDeltasFromDocument`, pre-existing) is accurate enough to serve as the accumulation ledger; this feature does not change how deltas are extracted, only how they gate re-generation.
- The external ihos-api GRC engine does not (yet) accept a "only evaluate these deltas" partial-generation parameter; caching is therefore implemented as a call/no-call decision on the ihOS side, not a partial-request optimization on the engine side. If the engine later exposes incremental generation, `applied_deltas`/`delta_fingerprint` already provide the bookkeeping needed to adopt it.
- `control_evaluation_cache` is a best-effort optimization layer; `evidence_evaluations` remains the authoritative, append-only audit trail and is unaffected by this change.
