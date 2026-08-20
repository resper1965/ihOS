# Trustworthy Posture — Design

**Date:** 2026-08-20
**Status:** awaiting review
**Author:** brainstormed with Claude, decisions by @resper

---

## 1. Why

The platform currently reports **131 controls, 100% conforming**. That number cannot be defended.

Verified against the production database (`uomdcazsriznqytvnsrv`) on 2026-08-20:

| Fact | Value |
|---|---|
| `control_evaluation_cache` rows | 131 — **all** `mode=quick`, **all** `conforming` |
| Distinct verdict states present | 1 (`conforming`). No `partial`, no `informal`, no `gap` |
| `assessments` rows | 10, all `mode=quick`, all dated 2026-07-16 |
| `document_control_provenance` | **table does not exist** (PGRST205) |
| `compliance_documents` / `document_chunks` | 198 / 4082 |
| `evidence_evaluations` | 917 |
| `scf_framework_mappings` | 35,663 rows across **7** framework codes |

Three independent defects produce that number:

**D1 — `quick` mode is not an evaluation.** `src/lib/assessment/engine.ts:379-402` skips the LLM
entirely, derives `conforming` from a single rescaled similarity score, and assigns
`evidencePhase` as a **field-by-field copy of `ismsPhase`**. Constitution Principle V requires two
independently evaluated phases; in `quick` the second phase is a copy of the first. `quick` is the
default in the API schema (`persistence.ts:12`), in the UI modal (`run-assessment-modal.tsx:43`),
and is the only mode present in the database.

**D2 — the evidence chain does not exist.** `document_control_provenance` was never migrated. 198
documents and 4082 chunks have no traceable link to any control. The artifact an auditor asks for
— *"which document, which paragraph, supports this control"* — cannot be produced.

**D3 — the two phases are not structurally separable.** Even in the correct engine
(`local-engine.ts:169-177`, which implements the honest 4-state logic and is reachable only via the
cron-token endpoint `/api/assessments/audit`), both phases are fields on one object, and Phase 2's
category filter includes `ISMS_CORE`. Nothing prevents the same chunk from satisfying both phases.

## 2. Root cause

The system conflates two different claims:

> *"we hold a document that discusses X"* — and — *"control X is satisfied"*

Every defect above is that conflation expressed in code. `quick` mode is the conflation with the
LLM removed.

## 3. Decisions taken

| # | Decision | Rationale |
|---|---|---|
| **DEC-1** | **ihOS owns the inventory and the SoA. The Standard API is a stateless calculator.** `cross-coverage`, `gap-analysis`, `compliance-score` are queried; no local copy of any framework crosswalk is kept as truth. | The API owns the 231×1,468 crosswalk authoritatively. `scf_framework_mappings` covers only 7 frameworks, which is why any new market silently returns zero controls. |
| **DEC-2** | **Greenfield, decomposed.** New tables and new modules under `src/lib/posture/`. Existing assessment tables are read-only during migration, then retired. | Chosen scope was "greenfield amplo"; decomposition keeps each increment shippable so the current certification never loses its tooling. |
| **DEC-3** | **First deliverable: trustworthy posture for the controls already in scope.** Framework projection and client answering follow. | Fixing a wrong number outranks widening its reach. |

## 4. The model

Three tables replace one conflated cache. The central idea: **the verdict is not stored, it is
derived** — and the two phases become two *kinds of row*, so one can never be a copy of the other.

```
compliance_documents ──┐
                       ├──▶ evidence_provenance ──▶ control_evidence ──▶ (derived) Verdict
document_chunks ───────┘         (what a chunk          (what counts as
                                  is about)              evidence, and in
                                                         which role)
control_inventory ─────────────────────────────────────▶ (our own statement)
```

### 4.1 `control_inventory` — what *we* implement

Framework-independent, per product version. This is the stratified statement of our own controls;
frameworks are applied to it later as masks, never baked into it.

Key columns: `scf_control_code`, `product_version_id`, `implementation_state`
(`implemented` | `partial` | `planned` | `not_applicable`), `statement` (how we implement it),
`owner`, `updated_at`. Unique on `(scf_control_code, product_version_id)`.

### 4.2 `evidence_provenance` — what a chunk is about

The missing chain, rebuilt: `document_id`, `chunk_id`, `scf_control_code`, `method`
(`vector` | `llm_confirmed`), `score`, `snippet`, `justification`. Unique on
`(chunk_id, scf_control_code)`.

### 4.3 `control_evidence` — what counts, and in which role

`scf_control_code`, `product_version_id`, `chunk_id`, `role` (`policy` | `operational`), `score`.
Unique on `(scf_control_code, product_version_id, chunk_id, role)`.

**A chunk may hold at most one role.** The role is a function of the document's `doc_type`, so a
policy document can never be counted as operational evidence. This is D3 fixed structurally rather
than by convention.

### 4.4 Role assignment — deliberately strict

| `doc_type` | Role |
|---|---|
| `POLICY`, `PROCEDURE`, `CONTRACT`, `CLOUD_ARCH_ORG`, `SAD`, `SRS_SDS` | `policy` — states intent |
| `TEST_REPORT`, `EVIDENCE_RECORD` | `operational` — records something that happened |
| `UNCLASSIFIED`, `null` | **none** — cannot serve as evidence |

Only a record of something that *happened* is operational evidence. Design and architecture
documents state intent, so they are policy. `UNCLASSIFIED` fails closed.

Consequence, stated plainly: if the 198 documents are mostly policies, most controls will resolve
to `partial`, not `conforming`. **That is the correct answer** and the point of the exercise.

### 4.5 The verdict — a pure function

```
conforming : ≥1 policy evidence AND ≥1 operational evidence
partial    : ≥1 policy evidence AND  0 operational evidence
informal   :  0 policy evidence AND ≥1 operational evidence
gap        :  0 policy evidence AND  0 operational evidence
```

Only `conforming` counts as compliant. This is exactly `local-engine.ts:173-179` — the honest logic
already in the repository — promoted to be the only logic and made a total function over rows.

Because it is derived, it cannot drift from its evidence, and it is testable without a database.

## 5. Scope of this spec

**In scope:** the three tables, the role classifier, the verdict function, the provenance and
evidence writers, a backfill over the existing 198 documents, and a read API that serves posture
with its evidence.

**Explicitly out of scope** (later sub-projects, each with its own spec):

- **SP-2 — Framework projection.** `cross-coverage` / `gap-analysis` against the inventory; retire
  `scf_framework_mappings`. Serves the new-market pain.
- **SP-3 — Client assessment answering.** Rebuilt on the inventory, fail-closed.
- **SP-4 — CTEM loop.** DefectDojo validation and mobilization into goals and POA&M.

**Not touched by this spec:** auth, document ingestion, RAG retrieval, chat, the UI shell.

## 6. Non-goals

- No LLM judgment in the verdict. The verdict counts evidence rows; an LLM may only *classify* a
  chunk's relevance when writing provenance, and that classification is recorded with its
  justification.
- No estimation. A control with no evidence is `gap`, never a guess.
- No new external dependency. Same stack.

## 7. Success criteria

1. `deriveVerdict` is a pure, exhaustively tested total function.
2. A policy-only document set produces `partial`, never `conforming`.
3. An `UNCLASSIFIED` document contributes no evidence in any role.
4. Every non-`gap` verdict can name its document, chunk and snippet per role.
5. The backfill reports, for the existing corpus, a verdict distribution containing more than one
   state — the direct refutation of today's uniform `conforming`.
6. No code path can assign the same chunk to both roles for one control.

## 8. Risks

| Risk | Handling |
|---|---|
| The honest number will look far worse than 100% | That is the deliverable, not a regression. Report old and new side by side so the change is legible. |
| `doc_type` is `UNCLASSIFIED` on much of the corpus | The backfill reports the count; triage is a separate task, not a blocker. |
| `match_documents_hybrid` is `SECURITY DEFINER` and bypasses RLS | Out of scope here; recorded in the risk register. The backfill runs service-role anyway. |
| Retiring `evidence_evaluations` breaks the current dashboard | Old tables stay readable until SP-2 moves the read path. |
