# ihOS Constitution

## Core Principles

### I. Dual-Stack Architecture (NON-NEGOTIABLE)
- **ihOS** (Next.js 15 App Router + Supabase) handles the **frontend, auth, persistence, and orchestration**.
- **ihos-api** (FastAPI + Python) handles **AI/ML, RAG search, NLP, and GRC Engine** workloads.
- Communication is strictly via REST API over HTTPS. No shared database connections across stacks.
- Each stack is independently deployable: ihOS on Vercel, ihos-api on Railway/Docker.

### II. Card-Based Stepper UI Pattern (NON-NEGOTIABLE)
- All multi-step user workflows MUST use the card-based stepper pattern established in Threat Modeling.
- Steps are horizontally laid out with numbered indicators, active/past/future states.
- Each step renders its own content panel below the stepper bar.
- Pattern reference: `src/app/(dashboard)/threat-modeling/[id]/page.tsx`.
- Animations: `animate-in fade-in slide-in-from-bottom-2 duration-300`.

### III. Single Source of Truth
- Framework IDs, names, and icons are managed exclusively through `framework-registry.ts`.
- Evidence persistence uses shared `persistence.ts` utilities — no inline batch construction.
- Types (`AssessmentResult`, `ControlEvaluation`, `FrameworkScore`) are defined once in `engine.ts` and re-exported.
- Supabase table names are never hardcoded inline — use constants or shared queries.

### IV. React Query for Server State
- All data fetching from Supabase or API routes MUST use TanStack React Query hooks.
- Follow the established pattern: Zod schema → query keys factory → typed hooks.
- Pattern reference: `src/hooks/queries/use-threat-models.ts`, `use-assessments.ts`.
- No raw `useEffect` + `fetch` + `useState` for data loading in page components.
- Mutations must invalidate related query keys on success.

### V. Dual-Phase Compliance Evaluation
- Every control evaluation produces two phases: **ISMS Policy** (documentation) and **Operational Evidence** (implementation proof).
- Combined status: `conforming` (both found), `partial` (policy only), `informal` (evidence only), `gap` (neither).
- API evaluation failures are tagged `[EVALUATION_ERROR]`, never silently marked as non-compliant.
- The engine MUST respect the 5-minute Vercel execution limit — batch processing with `Promise.all`.

### VI. Security & Compliance First
- LGPD, HIPAA, ISO 27001, SOC 2 compliance is not optional — it's the product.
- All API routes validate input with Zod schemas before processing.
- Admin operations use `createAdminClient()` — never expose service role keys to the client.
- Row Level Security (RLS) is enforced on all Supabase tables.
- STRIDE threat modeling is conducted for every new module.

### VII. Glass Morphism Design System
- All UI components use the established glass-card design system: `glass-card`, `border-border-glass`, `bg-white/5`.
- Color tokens: `text-primary`, `text-secondary`, `text-muted`, `text-text-primary`.
- Status colors: emerald (conforming/success), amber (partial/warning), red (gap/danger), blue (informal/info).
- Dark-first design — all components must be readable on dark backgrounds.
- Badges use the `Badge` component with variants: `success`, `danger`, `warning`, `info`, `neutral`.

### VIII. Minimize External API Usage & Never Fabricate Evaluations (NON-NEGOTIABLE)
- The RAG document corpus is the single source of truth for the current control/feature situation. Every analysis flow (GRC assessment, threat modeling, and any future control-status flow) MUST persist its evaluation and reuse it until the source documentation changes or the user explicitly forces re-evaluation — never re-derive a status from scratch just because a page was reloaded.
- "Source documentation changed" is detected via a cheap DB-only fingerprint (see `src/lib/assessment/corpus-fingerprint.ts`: `getCorpusFingerprint()` for document corpus, `getDeltaFingerprint()` for accumulated product-version feature deltas) — never by re-calling the external API to check.
- Every on-demand re-evaluation path MUST expose an explicit override (`forceReevaluate` / `force_reevaluate`) rather than silently ignoring the cache.
- Evaluations MUST come from the Standard GRC Engine API (or its documented resiliency fallback gated by `GRC_FALLBACK_DISABLED`). Inventing a fixed/hardcoded result when an external call fails is forbidden — the correct response is a structured gap/error (e.g. `GRC_ENGINE_UNAVAILABLE`) that says the gap must be resolved via the external API, never a fabricated 200 response.
- Transient evaluation failures (`[EVALUATION_ERROR]`) MUST NOT be persisted to a cache as if they were the current state.
- Coverage gaps (e.g. zero extracted product-version deltas) MUST be surfaced explicitly to the user (`limitations`/warning fields), not silently omitted.
- Pattern reference: `src/lib/assessment/engine.ts` (`control_evaluation_cache`), `src/app/api/threat-modeling/route.ts` (`delta_fingerprint` reuse + `GRC_ENGINE_UNAVAILABLE`).

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js (App Router) | 15.x |
| Styling | Vanilla CSS (glass morphism) | — |
| Auth | Supabase Auth | v2 |
| Database | Supabase (PostgreSQL) | — |
| State | TanStack React Query | ^5.101 |
| Validation | Zod | ^3.x |
| AI/ML Backend | FastAPI (Python) | ^0.115 |
| RAG | pgvector + hybrid search | — |
| GRC Engine | SCF + NIST mappings | — |
| Deployment (FE) | Vercel | — |
| Deployment (BE) | Railway / Docker | — |
| Icons | Lucide React | — |

## Development Workflow

### Branch Strategy
- `main` — production, protected
- `develop` — integration branch
- `feature/*` — feature branches from develop
- `fix/*` — bug fix branches

### Quality Gates
1. **TypeScript**: `tsc --noEmit` must pass with 0 new errors (pre-existing Supabase `'never'` type issues are tracked separately).
2. **Zod Validation**: All API route inputs validated with Zod schemas.
3. **React Query**: No raw `fetch` in page components — use hooks.
4. **Component Size**: Pages > 500 lines must be decomposed into extracted components.
5. **Threat Modeling**: STRIDE analysis required for modules handling sensitive data.

### Code Review Checklist
- [ ] Types are properly defined (no `any` in public interfaces)
- [ ] Supabase queries use correct table names (verified against schema)
- [ ] Framework IDs resolve through `framework-registry.ts`
- [ ] Evidence batch uses `buildEvidenceBatch()` from `persistence.ts`
- [ ] UI follows card-based stepper pattern for multi-step flows
- [ ] Dark mode compatible (no hardcoded light colors)
- [ ] New/changed analysis flows reuse persisted evaluations via a fingerprint check instead of always calling external APIs, expose a `forceReevaluate` override, and never fabricate a result on external-API failure (Principle VIII)

## Governance

- This constitution supersedes all ad-hoc practices.
- Amendments require documented rationale, team review, and a migration plan for affected code.
- All pull requests must verify compliance with these principles.
- Complexity must be justified — prefer composition over configuration.
- Use `.specify/memory/` for persistent project context.

**Version**: 1.1.0 | **Ratified**: 2026-06-29 | **Last Amended**: 2026-07-02

### Amendment Log

- **1.1.0** (2026-07-02): Added Principle VIII (Minimize External API Usage & Never Fabricate Evaluations), extracted from the analysis-flow caching feature (`specs/001-analysis-flow-caching/`). Removed the threat-modeling mock-fallback (`createMockThreatModel`) that violated this principle.
