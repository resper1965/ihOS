# Implementation Plan: ihOS — Compliance Intelligence Platform

**Branch**: `main` | **Date**: 2026-06-29 | **Spec**: `.specify/memory/spec.md`

**Input**: Feature specification from `.specify/memory/spec.md`

## Summary

ihOS is a **mature, functional platform** with 13 dashboard modules, 12 API route groups, 30+ Supabase tables, and a full agentic AI system already operational. This plan focuses on **closing gaps, hardening quality, and completing deferred work** — not greenfield development.

The primary technical approach is:
1. Complete deferred Assessment Engine items (listing page React Query migration, component integration)
2. Regenerate Supabase types to eliminate 215 `'never'` TS errors
3. Harden the existing modules with proper error handling, loading states, and test coverage
4. Consolidate duplicated patterns across the codebase

## Technical Context

**Language/Version**: TypeScript 5 (strict mode) + Python 3.11+

**Primary Dependencies**: Next.js 16, React 19, Supabase JS v2, TanStack React Query 5, Vercel AI SDK 6, Zod 4, Tailwind CSS 4, FastAPI

**Storage**: Supabase PostgreSQL + pgvector (HNSW indexes, 1536-dim embeddings)

**Testing**: Vitest (unit/integration) + Playwright (E2E)

**Target Platform**: Vercel (frontend) + Railway/Docker (backend API)

**Project Type**: Full-stack web application (multi-stack)

**Performance Goals**: Quick assessment <90s, Deep assessment <5min (Vercel limit), RAG search <3s

**Constraints**: 5-minute Vercel execution limit, OpenAI rate limits, Supabase RLS enforcement

**Scale/Scope**: 6,410+ document chunks, 1,468 SCF controls, 231 frameworks, 30+ tables, 13 dashboard modules

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Dual-Stack Architecture | ✅ PASS | ihOS (Next.js) + ihos-api (FastAPI) + ionic-txramp (CLI) |
| II. Card-Based Stepper UI | ✅ PASS | Threat Modeling + Assessment Detail use stepper. Assessments listing needs migration. |
| III. Single Source of Truth | ✅ PASS | `framework-registry.ts` + `persistence.ts` created. `assessment-to-scorecard.ts` migrated. |
| IV. React Query for Server State | ⚠️ PARTIAL | Detail page uses React Query. **Listing page still uses raw Supabase calls.** |
| V. Dual-Phase Evaluation | ✅ PASS | Engine unified with ISMS + Evidence phases. |
| VI. Security & Compliance First | ✅ PASS | Zod validation on API routes, RLS, admin client. |
| VII. Glass Morphism Design | ✅ PASS | All new components use glass-card system. |

**Constitution Violations to Fix**:
- Assessments listing page violates Principle IV (raw Supabase calls instead of React Query)
- Some older modules may still have raw `useEffect` + `fetch` patterns

## Project Structure

### Source Code (ihOS — Next.js)

```text
src/
├── app/
│   ├── (auth)/                    # Login, Signup, Callback
│   ├── (dashboard)/               # 13 dashboard modules
│   │   ├── page.tsx               # Dashboard Home (447 lines)
│   │   ├── compliance/            # Compliance Intelligence + SCRMS + GRC Mapping
│   │   ├── threat-modeling/       # STRIDE + FMEA
│   │   ├── chat/                  # Agentic Chat
│   │   ├── assessments/           # Assessment Engine
│   │   ├── documents/             # Document Management
│   │   ├── goals/                 # Remediation Goals
│   │   ├── knowledge-base/        # RAG Health
│   │   ├── reports/               # Report Generation
│   │   ├── settings/              # Settings + Versions
│   │   └── admin/                 # Admin Users
│   ├── api/                       # 12 API route groups
│   └── pending-approval/          # Approval gate
├── components/
│   ├── ui/                        # 6 base components
│   ├── dashboard/                 # 14 dashboard components
│   ├── chat/                      # 4 chat components
│   ├── documents/                 # 3 document components
│   ├── risk/                      # 9 threat/risk components
│   ├── assessments/               # 2 assessment components
│   ├── onboarding/                # 2 onboarding components
│   └── providers/                 # 1 query provider
├── hooks/
│   ├── queries/                   # React Query hooks
│   └── *.ts                       # Custom hooks
├── lib/
│   ├── supabase/                  # DB clients + types (22.8KB types)
│   ├── agents/                    # Agentic AI system
│   ├── assessment/                # Assessment engine + utilities
│   ├── chat/                      # Chat + RAG
│   ├── standard-api/              # Standard GRC Engine client
│   ├── ihos-engine/               # ihOS Engine client
│   ├── integrations/              # DefectDojo, Composio, Notifications
│   ├── context/                   # React contexts
│   └── data/                      # Server-side data fetchers
└── middleware.ts                   # Auth + Rate Limiting + RBAC

tests/
├── unit/
├── integration/
├── e2e/                           # Playwright
├── api/
├── agents/
├── chat/
└── setup.ts
```

### Source Code (ihos-api — FastAPI)

```text
ihos-api/
├── api/                           # FastAPI route handlers
├── services/                      # Business logic
└── requirements.txt
```

### Source Code (ionic-txramp — CLI)

```text
ionic-txramp/
├── etl_llamaparse.py              # ETL pipeline
├── search_v2.py                   # RAG search
├── query_router.py                # Query routing
├── scf_graph_resolver.py          # SCF graph resolution
├── reranker.py                    # Cross-encoder reranking
└── *.py                           # Other CLI scripts
```

**Structure Decision**: Multi-stack architecture is already established and functional. No structural changes needed.

## Work Streams

### Stream A: Technical Debt Resolution (Priority: HIGH)

| ID | Task | Impact |
|----|------|--------|
| A1 | Regenerate Supabase types (`supabase gen types`) | Eliminates 215 `'never'` TS errors |
| A2 | Migrate assessments listing page to React Query | Constitution compliance (Principle IV) |
| A3 | Integrate extracted components into listing page | Complete page decomposition |
| A4 | Audit all pages for raw `useEffect`+`fetch` patterns | Constitution compliance |

### Stream B: Quality & Testing (Priority: HIGH)

| ID | Task | Impact |
|----|------|--------|
| B1 | Add Vitest unit tests for assessment engine | Prevent regressions |
| B2 | Add Vitest unit tests for framework-registry | Validate alias resolution |
| B3 | Add Playwright E2E for assessment flow | End-to-end confidence |
| B4 | Add Playwright E2E for threat modeling flow | End-to-end confidence |

### Stream C: Feature Completion (Priority: MEDIUM)

| ID | Task | Impact |
|----|------|--------|
| C1 | Extract ISO 27001 Annex A controls to JSON data file | Clean separation of data from code |
| C2 | Parallelize local-engine evaluation loop | Performance improvement |
| C3 | Dashboard Home: fix `compliance_assessments` table reference | Same bug as assessment detail |
| C4 | Implement Evidence Upload UI (Document Management → RAG pipeline) | User Story 10 (P3) |

### Stream D: Hardening & Observability (Priority: MEDIUM)

| ID | Task | Impact |
|----|------|--------|
| D1 | Add structured error logging across all API routes | Debuggability |
| D2 | Add Sentry breadcrumbs for assessment engine steps | Production monitoring |
| D3 | Rate limiting configuration review | Security hardening |
| D4 | RLS policy audit for all 30+ tables | Security compliance |

### Stream E: Analysis Flow Caching & No-Fabrication (Priority: HIGH — DONE)

See `specs/001-analysis-flow-caching/` for the full spec/plan/tasks. Summary: the GRC assessment engine and threat modeling now persist and reuse evaluations keyed to a document/delta fingerprint instead of re-calling RAG/Standard-API/ihos-api on every run (Constitution Principle VIII), and the threat-modeling route no longer fabricates a mock threat model when the external GRC engine is unavailable — it returns an explicit `GRC_ENGINE_UNAVAILABLE` gap instead.

| ID | Task | Impact |
|----|------|--------|
| E1 | `control_evaluation_cache` table + corpus-fingerprint invalidation | Minimizes RAG + Standard GRC Engine API usage on repeat assessments |
| E2 | Delta-fingerprint reuse for threat modeling (`product_version_deltas`) | Minimizes ihos-api engine calls when the product hasn't changed |
| E3 | Removed `createMockThreatModel` fabricated fallback | Eliminates silently-invented compliance data |
| E4 | Regenerate Supabase types to drop `(admin as any)` casts for the new table | *Deferred — see tasks.md T050* |

## Complexity Tracking

No constitution violations requiring justification. All work follows established patterns.
