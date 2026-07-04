---
description: "Task list for the truth-platform master plan (specs/003)"
---

# Tasks: ihOS Truth Platform (F1–F7)

**Input**: `specs/003-truth-platform/plan.md`

## F1 — Semantic doc_type taxonomy

- [X] T101 Migration `20260705000001_doc_type_taxonomy.sql`: backfill `file_format` from legacy format values, reset non-taxonomy `doc_type` to `UNCLASSIFIED`, map legacy semantic values (policy/manual/soa/matrix/procedure/evidence/audit_report/internal_audit — local-engine filters) onto the taxonomy, add CHECK admitting the taxonomy (incl. `EVIDENCE_RECORD`) + `UNCLASSIFIED`
- [X] T102 `DocumentType` union + `DOCUMENT_TYPES` labels (`src/lib/supabase/types-custom.ts`)
- [X] T103 Upload route accepts validated `docType` (defaults `UNCLASSIFIED`); `doc_type` becomes semantic, format stays in `file_format`
- [X] T104 UploadWizard "Document Type" select with per-type consumer descriptions
- [X] T105 Threat-modeling readiness checklist detects SAD/SRS/infra by `doc_type` (filename regex kept only as fallback for `UNCLASSIFIED` legacy rows)
- [ ] T106 Triage surface for `UNCLASSIFIED` documents (badge + count on Documents page; inline type editor) — next slice
- [ ] T107 Category-scoped corpus fingerprint leveraging doc_type (merges specs/002 T044) — telemetry-gated

## F2 — Mandatory version × channel context

- [ ] T201 Global Context Bar (version × channel) in the dashboard header; per-user persistence
- [ ] T202 Chat conversations bound to context; visible warning on context switch mid-conversation
- [ ] T203 Questionnaire flow requires channel + version at step 1; `filter_categories` derived from channel (same rule as assessment engine)
- [ ] T204 "All channels" restricted to internal aggregate views, labelled as such — never on answering surfaces

## F3 — Posture-grounded answering

- [ ] T301 Question → SCF control mapping (embedding match against catalog)
- [ ] T302 Read persisted verdicts (control_evaluation_cache / evidence_evaluations) for mapped controls in scope
- [ ] T303 Layered answer composition: verdict → document citations → declared gap; needs_review propagation; staleness warning
- [ ] T304 Replace "best-effort" prompt with fail-closed wording (Principle VIII)

## F4 — Customer assessments entity

- [ ] T401 Migration: `customer_assessments` + `customer_assessment_answers` (+ RLS)
- [ ] T402 Inbox screen (list, status, progress, due dates) + 3-step wizard (client/channel/version → upload/parse → generate)
- [ ] T403 Review screen: keyboard-first HITL, provenance chips, diff on edits
- [ ] T404 Export: filled XLSX + provenance PDF; status transitions + audit trail

## F5 — Verified-answer memory (safeguarded)

- [ ] T501 Migration: `verified_answers` (channel/version scoping, posture_fingerprint, validity)
- [ ] T502 Promotion path writes to `verified_answers` (replaces VERIFIED_QA chunks); legacy chunk migration
- [ ] T503 Invalidation on corpus-fingerprint change; re-confirmation flow ("previous answer — possibly stale" as suggestion)
- [ ] T504 Regression test: layer 2 never reads layer 3; channel isolation test

## F6 — MCP posture surface

- [ ] T601 MCP server route with get_posture / answer_question / list_gaps (version+channel mandatory) and get_threat_posture (version-scoped exception, documented)
- [ ] T602 Read-only service auth + per-call audit log

## F7 — UX charter (cross-cutting)

- [ ] T701 Provenance chips component (posture/document/verified-QA/estimated/gap) reused across chat, questionnaire, assessments
- [ ] T702 "What to do now" panels: post-upload, post-review, dashboard staleness
- [ ] T703 Contrast audit (amber-on-glass light theme) per dataviz validator
