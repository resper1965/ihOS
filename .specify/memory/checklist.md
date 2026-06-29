# Quality Checklist: ihOS — Compliance Intelligence Platform

**Purpose**: Validate requirements completeness, consistency, and implementation readiness
**Created**: 2026-06-29
**Feature**: `.specify/memory/spec.md`

## Constitution Compliance

- [ ] CHK001 All multi-step workflows use card-based stepper pattern (Principle II)
- [ ] CHK002 No page component has raw `useEffect` + `fetch` for data loading (Principle IV)
- [ ] CHK003 All framework IDs resolve through `framework-registry.ts` (Principle III)
- [ ] CHK004 All evidence batch construction uses `persistence.ts` (Principle III)
- [ ] CHK005 All API routes validate input with Zod schemas (Principle VI)
- [ ] CHK006 All server-side elevated operations use `createAdminClient()` (Principle VI)
- [ ] CHK007 All UI components are dark-mode compatible (Principle VII)

## TypeScript & Build

- [ ] CHK008 `npx tsc --noEmit` produces 0 errors
- [ ] CHK009 Supabase types are regenerated from current schema
- [ ] CHK010 No `any` types in public interfaces (except Supabase JSON columns)
- [ ] CHK011 All React Query hooks have Zod schema validation

## Data Integrity

- [ ] CHK012 All Supabase queries reference correct table names (not `compliance_assessments` when meaning `assessments`)
- [ ] CHK013 All evidence evaluations link via `trace_id` (not orphaned)
- [ ] CHK014 RAG search returns real `chunk_id` values (not fake sequential IDs)
- [ ] CHK015 Assessment engine marks API failures as `[EVALUATION_ERROR]`

## Security

- [ ] CHK016 RLS enabled on all 30+ Supabase tables
- [ ] CHK017 Rate limiting configured in middleware (Upstash Redis)
- [ ] CHK018 User approval workflow enforced (pending → approved)
- [ ] CHK019 No service role keys exposed to client-side code
- [ ] CHK020 RBAC roles enforced on admin routes

## User Experience

- [ ] CHK021 All assessment detail pages show 4-step stepper
- [ ] CHK022 All threat model detail pages show 5-step stepper
- [ ] CHK023 Loading states shown during data fetching (skeleton/spinner)
- [ ] CHK024 Error states shown with retry actions
- [ ] CHK025 Onboarding wizard displays for new users

## Performance

- [ ] CHK026 Quick-mode assessment completes in <90 seconds
- [ ] CHK027 Deep-mode assessment completes within 5-minute Vercel limit
- [ ] CHK028 RAG search responds in <3 seconds
- [ ] CHK029 Assessment engine has MAX_PAGES=20 guard against infinite loops
- [ ] CHK030 Evidence batch processing uses `Promise.all` for parallelization

## Testing

- [ ] CHK031 Unit tests exist for framework-registry (aliases, fallbacks)
- [ ] CHK032 Unit tests exist for persistence (batch builder, Zod validation)
- [ ] CHK033 Unit tests exist for engine (status derivation, error marking)
- [ ] CHK034 E2E tests exist for assessment flow
- [ ] CHK035 E2E tests exist for threat modeling flow

## Documentation

- [ ] CHK036 Constitution is current in `.specify/memory/constitution.md`
- [ ] CHK037 Spec covers all 13 dashboard modules
- [ ] CHK038 Plan identifies all deferred work items
- [ ] CHK039 Tasks are organized by user story with dependencies
- [ ] CHK040 README has current architecture and setup instructions

## Notes

- Check items off as completed: `[x]`
- Constitution violations are BLOCKING — fix before proceeding
- Security items are CRITICAL — audit before deployment
- Performance items should be measured, not assumed
