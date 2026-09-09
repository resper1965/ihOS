# UI Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard name what the product actually does — group the navigation by the question a user arrives holding, give the observed axis and the defensible coverage engine pages of their own, and stop two screens from showing numbers that cannot be defended.

**Architecture:** The navigation becomes a grouped data structure and is tested as one. A new endpoint exposes `projectFrameworkFromCrosswalk`, which already exists and already refuses to invent a zero, so the Frameworks page can read it instead of withdrawn scorecard snapshots. A new `/posture` page follows the codebase's Server Component pattern and calls `src/lib/posture/read.ts` directly. Two dormant routes are removed and one card stops conflating two quantities.

**Tech Stack:** TypeScript, Next.js App Router (Server Components), Supabase JS, TanStack Query, Zod, Tailwind with CSS custom properties, lucide-react icons, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-ui-information-architecture-design.md`

## Global Constraints

- **Branch:** `docs/ui-information-architecture` (already checked out; spec at commits `7825436` and `758bf82`). Do not commit to `main`.
- **No visual redesign.** The palette (`--color-primary: #3DC2C2`, `--color-brand-gray: #58595b`), the Lato face, the frosted-glass surfaces and the light/dark pair are untouched. Use existing token classes (`text-primary`, `text-text-secondary`, `bg-bg-card`, `border-border-glass`); never introduce a raw hex or an off-palette Tailwind colour such as `text-emerald-400`.
- **No route path changes.** Only labels, grouping and order change, so every existing bookmark and deep link keeps working.
- **A number must be able to cite its rule.** Where a figure comes from the projection, show `policyVersion` and `policyOwner` beside it. Never render a `0` where the source returned `null` — `null` means "nothing to divide by" and a zero would read as "assessed at zero".
- **The projection is never called without an explicit `scfVersionId`.** `scf_control_mappings` spans two catalogue versions and an unversioned read mixes the fabricated crosswalk into its own correction. Get the version from `getCachedScfVersionId()` in `@/lib/standard-api/sync/catalog`.
- **Code and comments in English.**
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Environment:** the `W:\` mount's `npx`/vitest is broken (dangling symlinks, missing native binding). Run suites through `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && ..."`, which is the same underlying filesystem. `npm run typecheck` is NOT clean repo-wide — it carries 198 pre-existing Supabase generated-type errors. Judge your work by "no new errors in the files I touched": run it and grep for your files; zero hits is a pass. Never fix unrelated pre-existing errors.
- Test commands: `npm run test:unit -- --testTimeout=60000` for the suite (648 tests across 78 files before this work), `npx vitest run <file> -t "<name>"` for one test.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/dashboard/navigation.ts` (create) | The navigation as data: groups, items, and the active-route resolver. Extracted from `layout.tsx` so it can be tested without rendering React. |
| `src/app/(dashboard)/layout.tsx` (modify) | Renders the groups. Keeps all existing behaviour — collapse, admin link, mobile toggle. |
| `src/app/api/compliance/coverage/route.ts` (create) | Exposes the projection, one row per registry framework, with per-framework error isolation. |
| `src/app/(dashboard)/compliance/page.tsx` (modify) | Swaps `getFrameworkScores()` for the coverage endpoint; drops the ROI widget. |
| `src/app/(dashboard)/posture/page.tsx` (create) | Server Component rendering posture for the controls that have evidence. |
| `src/app/api/dashboard/stats/route.ts` (modify) | Deletes the `avgConfidence` fallback. |

**Why navigation moves to its own file.** `layout.tsx` is 342 lines of client component holding the sidebar, the header, the user menu and the mobile toggle. The navigation is the only part of it this work changes, and a data structure in its own module can be asserted against directly — no render, no jsdom. The render stays in `layout.tsx`.

---

### Task 1: The navigation, as testable data

**Files:**
- Create: `src/lib/dashboard/navigation.ts`
- Modify: `src/app/(dashboard)/layout.tsx:34-51` (the `NAV_ITEMS` const) and `:131-153` (the render)
- Test: `tests/unit/dashboard/navigation.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `export interface NavItem { label: string; href: string; icon: LucideIcon }`
  - `export interface NavGroup { heading: string | null; items: NavItem[] }`
  - `export const NAV_GROUPS: NavGroup[]`
  - `export const NAV_ITEMS: NavItem[]` — the flattened list, kept because the active-route resolver needs every href
  - `export function isNavItemActive(href: string, pathname: string, allItems: readonly NavItem[]): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/dashboard/navigation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NAV_GROUPS, NAV_ITEMS, isNavItemActive } from '@/lib/dashboard/navigation';

describe('the navigation is a well-formed structure', () => {
  it('gives every item exactly one group', () => {
    const flattened = NAV_GROUPS.flatMap((g) => g.items);
    expect(flattened).toHaveLength(NAV_ITEMS.length);
    const hrefs = flattened.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('has no empty group', () => {
    for (const group of NAV_GROUPS) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it('points every item at a route that exists', () => {
    // The test that catches a rename breaking a link. A nav entry is a promise
    // that a page is there; nothing else in the build checks it.
    const appDir = join(process.cwd(), 'src', 'app', '(dashboard)');
    for (const item of NAV_ITEMS) {
      const segment = item.href === '/' ? '' : item.href;
      const candidate = join(appDir, segment, 'page.tsx');
      expect(existsSync(candidate), `${item.label} -> ${item.href} has no page.tsx`).toBe(true);
    }
  });
});

describe('active-route resolution prefers the longest match', () => {
  it('marks the deepest matching item and not its parent', () => {
    // /compliance/scrms must light Partner Requirements and leave Frameworks dark.
    expect(isNavItemActive('/compliance/scrms', '/compliance/scrms', NAV_ITEMS)).toBe(true);
    expect(isNavItemActive('/compliance', '/compliance/scrms', NAV_ITEMS)).toBe(false);
  });

  it('marks a parent when nothing deeper matches', () => {
    expect(isNavItemActive('/compliance', '/compliance', NAV_ITEMS)).toBe(true);
  });

  it('never lights the root for a nested path', () => {
    expect(isNavItemActive('/', '/documents', NAV_ITEMS)).toBe(false);
    expect(isNavItemActive('/', '/', NAV_ITEMS)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npx vitest run tests/unit/dashboard/navigation.test.ts"`

Expected: FAIL — `@/lib/dashboard/navigation` does not resolve.

- [ ] **Step 3: Create the navigation module**

Create `src/lib/dashboard/navigation.ts`:

```ts
// src/lib/dashboard/navigation.ts
// The navigation as data, so it can be asserted without rendering React.
//
// Grouped by the question a user arrives holding, taken from the consumer table
// in docs/superpowers/specs/2026-09-09-the-dynamic-design.md. Nobody comes to
// work thinking "I want to look at a control"; they come thinking "a hospital
// asked us this".
//
// The COVER/ANSWER split is load-bearing, not decoration. COVER answers "how
// much of this framework do we even map" and needs only the crosswalk. ANSWER
// answers "and how much of it do we meet" and needs evidence verdicts. Those
// were one tangled percentage before.

import {
  LayoutDashboard, MessageSquare, Target, ClipboardCheck, FileText,
  BarChart3, ShieldCheck, Database, AlertTriangle, Flag, Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  /** null renders a divider instead of a heading. */
  heading: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: null,
    items: [{ label: 'Overview', href: '/', icon: LayoutDashboard }],
  },
  {
    heading: 'Answer',
    items: [
      // Renamed from "Audits & Checks": the database, the API and every
      // document call these assessments.
      { label: 'Assessments', href: '/assessments', icon: ClipboardCheck },
      { label: 'Partner Requirements', href: '/compliance/scrms', icon: Target },
      { label: 'Chat', href: '/chat', icon: MessageSquare },
    ],
  },
  {
    heading: 'Cover',
    items: [
      // Renamed from "Standards & Norms" for the same reason as Assessments.
      { label: 'Frameworks', href: '/compliance', icon: ShieldCheck },
      // Renamed from "Evidence Map", which showed no evidence — it is
      // control-to-requirement mapping, and the old name sent people to the
      // wrong page looking for evidence.
      { label: 'Control Crosswalk', href: '/compliance/mappings', icon: Database },
    ],
  },
  {
    heading: 'Observe',
    items: [
      { label: 'Posture', href: '/posture', icon: Activity },
      { label: 'Risk Analysis', href: '/threat-modeling', icon: AlertTriangle },
    ],
  },
  {
    // The utility drawer: reached when needed, not a question anyone arrives
    // with. A divider rather than a heading says that without naming it.
    heading: null,
    items: [
      { label: 'Documents', href: '/documents', icon: FileText },
      { label: 'Goals & Tasks', href: '/goals', icon: Flag },
      { label: 'Reports', href: '/reports', icon: BarChart3 },
    ],
  },
];

/** Every item, flattened. The active-route resolver needs all hrefs to compare. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * Whether `href` is the item the current `pathname` belongs to.
 *
 * Longest-prefix wins, so /compliance/scrms lights Partner Requirements and
 * leaves Frameworks dark. Moved here verbatim from layout.tsx so the rule can
 * be tested; the behaviour is unchanged.
 */
export function isNavItemActive(
  href: string,
  pathname: string,
  allItems: readonly NavItem[],
): boolean {
  const isExact = pathname === href;
  const isPrefix = href !== '/' && pathname.startsWith(href);
  const hasMoreSpecificMatch = allItems.some(
    (other) =>
      other.href !== href &&
      other.href !== '/' &&
      pathname.startsWith(other.href) &&
      other.href.length > href.length,
  );
  return (isExact || isPrefix) && !hasMoreSpecificMatch;
}
```

- [ ] **Step 4: Run the test — two cases still fail**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npx vitest run tests/unit/dashboard/navigation.test.ts"`

Expected: the structure and active-route tests PASS; `points every item at a route that exists` FAILS on `Posture -> /posture`, because Task 4 creates that page.

This failure is correct and expected. To keep the suite green between tasks, add `/posture` to the test's known-pending set for now by changing that one test's loop to skip it, with the reason written down:

```ts
    for (const item of NAV_ITEMS) {
      // /posture is created in Task 4 of this plan. Remove this skip with that
      // task — a nav entry pointing at nothing is exactly what this test exists
      // to catch, so the skip must not outlive the task.
      if (item.href === '/posture') continue;
      const segment = item.href === '/' ? '' : item.href;
```

- [ ] **Step 5: Wire the render**

In `src/app/(dashboard)/layout.tsx`, delete the local `NAV_ITEMS` const at lines 34-51 and the now-unused lucide icon imports it needed, then import from the new module:

```ts
import { NAV_GROUPS, NAV_ITEMS, isNavItemActive } from '@/lib/dashboard/navigation';
```

Keep the icons `ChevronLeft`, `Menu`, `Settings`, `LogOut` and `Users` — the header, collapse control and admin link still use them.

Replace the `<nav>` body at lines 131-153 with:

```tsx
            {NAV_GROUPS.map((group, groupIndex) => (
              <div key={group.heading ?? `group-${groupIndex}`} className="space-y-1">
                {group.heading && sidebarOpen && (
                  <div
                    aria-hidden="true"
                    className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-text-muted"
                  >
                    {group.heading}
                  </div>
                )}
                {group.heading === null && groupIndex > 0 && (
                  <div className="my-2 border-t border-border-glass" />
                )}
                {group.items.map((item) => {
                  const isActive = isNavItemActive(item.href, pathname, NAV_ITEMS);
                  return (
                    <Link key={item.href} href={item.href}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 border ${
                        isActive
                          ? "bg-primary/10 text-primary border-primary/20 shadow-sm shadow-primary/5 font-semibold"
                          : "border-transparent text-text-secondary hover:bg-black/5 dark:hover:bg-white/5 hover:text-text-primary"
                      }`}>
                      <item.icon className={`h-5 w-5 shrink-0 stroke-[1.5] ${isActive ? "text-primary" : "text-text-muted group-hover:text-text-secondary"}`} />
                      {sidebarOpen && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
```

Three things this preserves deliberately: the link classes are copied byte-for-byte so nothing shifts visually; headings carry `aria-hidden` and are plain `div`s, so they are never focusable and never announced as interactive; and headings hide when `sidebarOpen` is false, matching how labels already behave in the collapsed rail.

- [ ] **Step 6: Verify the suite and the types**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npx vitest run tests/unit/dashboard/navigation.test.ts && npm run typecheck 2>&1 | grep -E 'dashboard/navigation|\(dashboard\)/layout' ; echo GREP_DONE"`

Expected: navigation tests PASS; nothing printed between the test output and `GREP_DONE`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/dashboard/navigation.ts src/app/\(dashboard\)/layout.tsx tests/unit/dashboard/navigation.test.ts
git commit -F - <<'MSG'
feat(nav): group the menu by the question the user arrives holding

Ten flat items, and not one of them said "control" -- the architecture went
control-first months ago and the menu still described a product organised by
standard. The groups come from the consumer table in the Dynamic spec: Answer,
Cover, Observe, and a divider for the drawer.

Three renames carry meaning. Evidence Map showed no evidence; it is
control-to-requirement mapping, and the name sent people to the wrong page.
Audits & Checks and Standards & Norms are called assessments and frameworks by
the database, the API and every other document.

The structure moves to src/lib/dashboard/navigation.ts so it can be asserted
without rendering React. One of those assertions is that every href has a
page.tsx behind it -- a nav entry is a promise that a page exists and nothing
else in the build was checking it.

No route path changes, so no bookmark breaks, and the link classes are copied
verbatim so nothing moves visually.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 2: `GET /api/compliance/coverage`

Exposes `projectFrameworkFromCrosswalk`, which reads the real crosswalk under a versioned, owned policy. It runs only inside an assessment today and nothing serves it over HTTP.

**Files:**
- Create: `src/app/api/compliance/coverage/route.ts`
- Test: `tests/api/compliance-coverage.test.ts`

**Interfaces:**
- Consumes: `projectFrameworkFromCrosswalk(localCode, evaluations, deps)` from `@/lib/assessment/projection`; `FRAMEWORK_REGISTRY` from `@/lib/assessment/framework-registry`; `getCachedScfVersionId()` from `@/lib/standard-api/sync/catalog`.
- Produces: `GET /api/compliance/coverage` returning

```ts
{
  scfVersionId: string;
  frameworks: Array<{
    localCode: string;          // e.g. 'iso27001'
    name: string;               // FRAMEWORK_REGISTRY display name
    status: 'projected' | 'undecided';
    requirementsTotal: number | null;
    requirementsUnrecorded: number | null;
    requirementsUnevaluated: number | null;
    score: number | null;
    reason: string | null;
    policyVersion: string | null;
    policyOwner: string | null;
    note: string | null;        // why an 'undecided' row has no numbers
  }>;
}
```

- [ ] **Step 1: Write the failing test**

Create `tests/api/compliance-coverage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const projectMock = vi.fn();
const versionMock = vi.fn();

vi.mock('@/lib/assessment/projection', () => ({
  projectFrameworkFromCrosswalk: (...args: unknown[]) => projectMock(...args),
}));
vi.mock('@/lib/standard-api/sync/catalog', () => ({
  getCachedScfVersionId: () => versionMock(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  }),
}));

const PROJECTION = {
  score: null,
  reason: 'nothing_assessable',
  requirementsTotal: 316,
  requirementsSatisfied: 0,
  requirementsPartial: 0,
  requirementsNeedingReview: 0,
  requirementsUnrecorded: 41,
  requirementsUnevaluated: 275,
  requirementsGap: 0,
  policyVersion: '2026-08-27.1',
  policyOwner: 'resper@ionic.health',
};

describe('GET /api/compliance/coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    versionMock.mockResolvedValue('826a1f05-f065-4feb-9f44-ced8019a6701');
  });

  it('returns totals with a null score, not a zero, when nothing is evaluated', async () => {
    // A null score means "nothing to divide by". A zero would read as
    // "assessed, and it came out at nothing" — a different claim entirely.
    projectMock.mockResolvedValue(PROJECTION);
    const { GET } = await import('@/app/api/compliance/coverage/route');
    const body = await (await GET()).json();

    const row = body.frameworks.find((f: { localCode: string }) => f.localCode === 'iso27001');
    expect(row.status).toBe('projected');
    expect(row.requirementsTotal).toBe(316);
    expect(row.requirementsUnrecorded).toBe(41);
    expect(row.score).toBeNull();
    expect(row.reason).toBe('nothing_assessable');
    expect(row.policyVersion).toBe('2026-08-27.1');
  });

  it('always passes an explicit scfVersionId', async () => {
    // scf_control_mappings spans two catalogue versions. An unversioned read
    // mixes the fabricated crosswalk into its own correction, which is why the
    // projection refuses to run without one.
    projectMock.mockResolvedValue(PROJECTION);
    const { GET } = await import('@/app/api/compliance/coverage/route');
    await GET();

    expect(projectMock).toHaveBeenCalled();
    for (const call of projectMock.mock.calls) {
      expect(call[2]?.scfVersionId).toBe('826a1f05-f065-4feb-9f44-ced8019a6701');
    }
  });

  it('reports an uncurated framework as undecided without taking the others down', async () => {
    // fedramp and IEC-62304 are offered with no curated identity, and the
    // projection throws for exactly that case. "Nobody has decided yet" is a
    // different answer from "covers nothing", and the page must be able to
    // tell them apart.
    projectMock.mockImplementation(async (code: string) => {
      if (code === 'fedramp' || code === 'IEC-62304') {
        throw new Error(`no curated vendor framework for "${code}"`);
      }
      return PROJECTION;
    });
    const { GET } = await import('@/app/api/compliance/coverage/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    const fedramp = body.frameworks.find((f: { localCode: string }) => f.localCode === 'fedramp');
    expect(fedramp.status).toBe('undecided');
    expect(fedramp.requirementsTotal).toBeNull();
    expect(fedramp.note).toMatch(/curated/i);

    const iso = body.frameworks.find((f: { localCode: string }) => f.localCode === 'iso27001');
    expect(iso.status).toBe('projected');
  });

  it('refuses an unauthenticated caller', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no session' } }) },
      }),
    }));
    vi.resetModules();
    const { GET } = await import('@/app/api/compliance/coverage/route');
    expect((await GET()).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npx vitest run tests/api/compliance-coverage.test.ts"`

Expected: FAIL — `@/app/api/compliance/coverage/route` does not resolve.

- [ ] **Step 3: Write the route**

Create `src/app/api/compliance/coverage/route.ts`:

```ts
// src/app/api/compliance/coverage/route.ts
// What each offered framework requires, and how much of it our crosswalk maps.
//
// This is the COVER question, and it is deliberately not the ANSWER question.
// Coverage needs only the crosswalk; conformance needs evidence verdicts, and
// those live in an assessment. Calling the projection with an empty evaluations
// list answers coverage completely: every requirement lands in Total,
// Unrecorded or Unevaluated, and `score` comes back null with reason
// `nothing_assessable`. That null is the correct answer, not a failure.
//
// Spec: docs/superpowers/specs/2026-09-09-ui-information-architecture-design.md §5

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { FRAMEWORK_REGISTRY } from '@/lib/assessment/framework-registry';
import { projectFrameworkFromCrosswalk } from '@/lib/assessment/projection';
import { getCachedScfVersionId } from '@/lib/standard-api/sync/catalog';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Named explicitly, never defaulted: scf_control_mappings holds every
  // catalogue version ever walked, and reading two at once would fold the
  // pre-STRM fabricated crosswalk back into the corrected one.
  const scfVersionId = await getCachedScfVersionId();

  const frameworks = await Promise.all(
    FRAMEWORK_REGISTRY.map(async (fw) => {
      try {
        const p = await projectFrameworkFromCrosswalk(fw.id, [], { scfVersionId });
        return {
          localCode: fw.id,
          name: fw.name,
          status: 'projected' as const,
          requirementsTotal: p.requirementsTotal,
          requirementsUnrecorded: p.requirementsUnrecorded,
          requirementsUnevaluated: p.requirementsUnevaluated,
          score: p.score,
          reason: p.reason,
          policyVersion: p.policyVersion,
          policyOwner: p.policyOwner,
          note: null,
        };
      } catch (err) {
        // The projection throws rather than returning zero when no person has
        // decided which vendor framework a local code means. Surfacing that as
        // its own state keeps "undecided" from being read as "covers nothing".
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('coverage: framework not projectable', {
          context: 'api/compliance/coverage',
          meta: { framework: fw.id, message },
        });
        return {
          localCode: fw.id,
          name: fw.name,
          status: 'undecided' as const,
          requirementsTotal: null,
          requirementsUnrecorded: null,
          requirementsUnevaluated: null,
          score: null,
          reason: null,
          policyVersion: null,
          policyOwner: null,
          note: message,
        };
      }
    }),
  );

  return NextResponse.json({ scfVersionId, frameworks });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npx vitest run tests/api/compliance-coverage.test.ts"`

Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run typecheck 2>&1 | grep 'compliance/coverage' ; echo GREP_DONE"`

Expected: nothing printed before `GREP_DONE`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/compliance/coverage/route.ts tests/api/compliance-coverage.test.ts
git commit -F - <<'MSG'
feat(compliance): serve the projection that already refuses to invent a zero

projectFrameworkFromCrosswalk reads the real crosswalk under a versioned, owned
policy, and it has only ever run inside an assessment. Nothing served it over
HTTP, so the page that should show coverage was reading withdrawn scorecard
snapshots instead.

Called with an empty evaluations list it answers coverage completely -- total,
vendor-unrecorded, and everything else unevaluated -- and returns a null score
with reason nothing_assessable. That null is the answer, not a failure, and the
route passes it through rather than flattening it to zero.

Two details are load-bearing. The scf_version_id is always explicit, because
scf_control_mappings spans two catalogue versions and an unversioned read folds
the fabricated crosswalk into its own correction. And a framework with no
curated identity comes back as its own "undecided" state instead of throwing:
nobody having decided is a different fact from covering nothing, and one
uncurated framework must not take the other nine down with it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 3: Point the Frameworks page at the projection

**Files:**
- Modify: `src/app/(dashboard)/compliance/page.tsx` — the data fetch at `:35-41`, the `quickStats` at `:44+`, the page title at `:78-79`, and the ROI widget

**Interfaces:**
- Consumes: `GET /api/compliance/coverage` from Task 2.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Read the page and locate the four edits**

Open `src/app/(dashboard)/compliance/page.tsx`. It is an async Server Component. Find: the `Promise.all` destructuring `[frameworkScores, evaluationSummary, topGaps, roiPath, domainBreakdown]`; the `quickStats` array that reads `frameworkScores.length`; the `PageTitleRegistrar` whose subtitle interpolates `frameworkScores.length`; and the JSX that renders `roiPath`.

Do not touch `evaluationSummary`, `topGaps` or `domainBreakdown`. All three read `evidence_evaluations` directly — real data about real evidence. An earlier draft of the spec proposed removing them on the belief that the whole page was snapshot-derived; tracing each source disproved it.

- [ ] **Step 2: Replace the withdrawn source**

Since this is a Server Component, call the same functions the route calls rather than fetching your own HTTP endpoint over the network. Remove `getFrameworkScores` from the import and the `Promise.all`, and add:

```tsx
import { FRAMEWORK_REGISTRY } from '@/lib/assessment/framework-registry';
import { projectFrameworkFromCrosswalk } from '@/lib/assessment/projection';
import { getCachedScfVersionId } from '@/lib/standard-api/sync/catalog';
```

```tsx
  const scfVersionId = await getCachedScfVersionId();
  const coverage = await Promise.all(
    FRAMEWORK_REGISTRY.map(async (fw) => {
      try {
        const p = await projectFrameworkFromCrosswalk(fw.id, [], { scfVersionId });
        return { localCode: fw.id, name: fw.name, undecided: false, ...p };
      } catch {
        // No curated identity: nobody has decided what this local code means on
        // the vendor's side. Reported as its own state, never as zero coverage.
        return { localCode: fw.id, name: fw.name, undecided: true } as const;
      }
    }),
  );
```

- [ ] **Step 3: Make the counts and the title tell the truth**

The `Monitored Frameworks` quick stat becomes the count of frameworks that actually project:

```tsx
      value: coverage.filter((c) => !c.undecided).length.toString(),
```

The page title's subtitle stops claiming `Real-time posture`:

```tsx
        subtitle={`Crosswalk coverage for ${coverage.filter((c) => !c.undecided).length} curated frameworks`}
```

And in the same registrar call, replace `text-emerald-400` with `text-primary` — the emerald is outside the token palette, and the design system's accent is `--color-primary`.

- [ ] **Step 4: Render the coverage rows**

Render one row per framework using existing token classes only. For a projected framework show `requirementsTotal`, `requirementsUnrecorded`, `requirementsUnevaluated`. For `undecided: true` show the name and the words "no curated identity — a person must decide which vendor framework this means", and no numbers at all.

Beneath the list, print the provenance:

```tsx
      <p className="text-xs text-text-muted">
        Curation policy {coverage.find((c) => !c.undecided)?.policyVersion ?? '—'},
        owned by {coverage.find((c) => !c.undecided)?.policyOwner ?? '—'}.
        Catalogue version {scfVersionId}.
      </p>
```

A figure that cannot cite the rule that produced it is the thing this project keeps removing; this line is why the page is allowed to show these numbers at all.

- [ ] **Step 5: Remove the ROI widget**

Delete `getRoiPath` from the import and the `Promise.all`, and delete the JSX that renders `roiPath`, leaving this comment where it stood:

```tsx
      {/* The ROI widget was removed on 2026-09-09. getRoiPath asks the vendor
          about ["ISO 27701", "HIPAA", "ISO 27001"] — hardcoded phrase-format
          names the vendor abandoned on 2026-09-08 (FINDINGS_2026-09-09.md B9),
          one of which we quarantined for matching three frameworks at once. It
          has almost certainly rendered nothing since. Repairing it means reading
          the codes from framework_identity_curation, which is vendor
          integration, not information architecture. See the design doc §5.3. */}
```

`getRoiPath` itself stays in `src/lib/data/compliance-data.ts` — `src/app/api/compliance/report/route.ts:183-184` still calls it.

- [ ] **Step 6: Verify**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- --testTimeout=60000 2>&1 | tail -5 && npm run typecheck 2>&1 | grep 'compliance/page' ; echo GREP_DONE"`

Expected: the suite passes; nothing printed before `GREP_DONE`.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/compliance/page.tsx
git commit -F - <<'MSG'
fix(compliance): the front door stops showing the numbers we withdrew

The page led with framework scores from intelligence_snapshots, served through a
Redis cache -- the generation withdrawn as unbacked in August, behind a cache
that may have meant the withdrawal never reached the screen. It now reads the
projection, and prints the policy version, the policy owner and the catalogue
version underneath, because a figure that cannot cite its rule is what this
project keeps removing.

Its three other widgets stay. Top gaps, the evaluation summary and the domain
breakdown all read evidence_evaluations directly and are sound; an earlier draft
proposed removing them on a misreading of where the page's data came from.

The ROI widget goes, and not because of its provenance. getRoiPath asks the
vendor about hardcoded phrase-format framework names that stopped resolving on
2026-09-08, one of them a label we quarantined for matching three frameworks at
once. It has been rendering nothing, silently. The helper stays for the report
route, which has the same bug where nobody can see it -- noted in the spec as
open work rather than fixed here.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 4: The `/posture` page

**Spec correction, discovered while planning.** The design document §6 called this "a thin page over `/api/posture`" that "computes nothing". That is wrong: `/api/posture` requires a `controls` query parameter and returns 400 without one (`src/app/api/posture/route.ts:38`), capped at 500 controls. Something has to decide which controls to ask about, and no endpoint supplies that list.

The page therefore follows the pattern `/compliance` already uses — an async Server Component calling the library directly, with no HTTP hop — and scopes itself to the controls that actually have evidence. The HTTP route is left exactly as it is.

**Files:**
- Create: `src/app/(dashboard)/posture/page.tsx`
- Modify: `tests/unit/dashboard/navigation.test.ts` (remove the `/posture` skip from Task 1)

**Interfaces:**
- Consumes: `groupPosture`, `rowsToLinks`, `summarise` from `@/lib/posture/read`; `ControlPosture` shape is `{ scfControlCode: string; verdict: 'conforming' | 'partial' | 'informal' | 'gap'; confidence: number; policy: EvidenceLink[]; operational: EvidenceLink[] }`; `summarise` returns `Record<Verdict, number>`.
- Produces: the `/posture` route that Task 1's navigation test requires.

- [ ] **Step 1: Remove the skip from the navigation test**

In `tests/unit/dashboard/navigation.test.ts`, delete these two lines and the comment above them:

```ts
      if (item.href === '/posture') continue;
```

- [ ] **Step 2: Run the navigation test to verify it fails**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npx vitest run tests/unit/dashboard/navigation.test.ts -t 'points every item'"`

Expected: FAIL with `Posture -> /posture has no page.tsx`.

- [ ] **Step 3: Write the page**

Create `src/app/(dashboard)/posture/page.tsx`:

```tsx
// src/app/(dashboard)/posture/page.tsx
// The observed axis, which until now existed only as one widget on Overview.
//
// A Server Component calling src/lib/posture/read.ts directly, matching the
// pattern /compliance uses. It does NOT call /api/posture: that route requires
// an explicit `controls` parameter and 400s without one, so a "thin page over
// the endpoint" would still have to decide which controls to ask about. The
// scope decided here is the controls that actually carry evidence — asking
// about controls with no evidence would report a wall of `gap` rows that say
// nothing about our posture and everything about the query.
//
// Spec: docs/superpowers/specs/2026-09-09-ui-information-architecture-design.md §6

import { createAdminClient } from '@/lib/supabase/admin';
import { groupPosture, rowsToLinks, summarise } from '@/lib/posture/read';
import { PageTitleRegistrar } from '@/components/dashboard/page-title-registrar';
import { Activity } from 'lucide-react';

export const dynamic = 'force-dynamic';

/** Matches MAX_CONTROLS in src/app/api/posture/route.ts, for the same reason. */
const MAX_CONTROLS = 500;
const EVIDENCE_PAGE_SIZE = 1000;

export default async function PosturePage() {
  const db = createAdminClient();

  // PostgREST caps a response at max-rows and gives no stable order between two
  // range() calls without .order(), so both reads below page explicitly and
  // order. A silently truncated page does not error — it drops rows, and
  // dropped evidence reads as a control downgrading for no reason tied to the
  // evidence itself.
  const evidenceRows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += EVIDENCE_PAGE_SIZE) {
    const { data, error } = await db
      .from('control_evidence')
      .select('scf_control_code, product_version_id, chunk_id, document_id, role, score, snippet')
      .order('scf_control_code')
      .order('chunk_id')
      .range(from, from + EVIDENCE_PAGE_SIZE - 1);
    if (error) {
      return (
        <div className="w-full space-y-8">
          <PageTitleRegistrar
            title="Posture"
            subtitle="Could not read evidence"
            icon={<Activity className="h-4 w-4 text-primary" />}
          />
          <p className="text-sm text-danger">control_evidence: {error.message}</p>
        </div>
      );
    }
    const page = (data ?? []) as Array<Record<string, unknown>>;
    evidenceRows.push(...page);
    if (page.length < EVIDENCE_PAGE_SIZE) break;
  }

  const controlCodes = [...new Set(evidenceRows.map((r) => String(r.scf_control_code)))]
    .sort()
    .slice(0, MAX_CONTROLS);

  const postures = groupPosture(controlCodes, rowsToLinks(evidenceRows));
  const summary = summarise(postures);

  return (
    <div className="w-full space-y-8">
      <PageTitleRegistrar
        title="Posture"
        subtitle={`${controlCodes.length} controls carrying evidence`}
        icon={<Activity className="h-4 w-4 text-primary" />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(['conforming', 'partial', 'informal', 'gap'] as const).map((verdict) => (
          <div
            key={verdict}
            className="rounded-2xl border border-border-glass bg-bg-card p-4"
          >
            <div className="text-2xl font-bold text-text-primary">{summary[verdict]}</div>
            <div className="text-xs uppercase tracking-wider text-text-muted">{verdict}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border-glass bg-bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-glass text-left text-xs uppercase tracking-wider text-text-muted">
              <th className="px-4 py-3">Control</th>
              <th className="px-4 py-3">Verdict</th>
              <th className="px-4 py-3">Policy evidence</th>
              <th className="px-4 py-3">Operational evidence</th>
            </tr>
          </thead>
          <tbody>
            {postures.map((p) => (
              <tr key={p.scfControlCode} className="border-b border-border-glass last:border-0">
                <td className="px-4 py-3 font-medium text-text-primary">{p.scfControlCode}</td>
                <td className="px-4 py-3 text-text-secondary">{p.verdict}</td>
                <td className="px-4 py-3 text-text-secondary">{p.policy.length}</td>
                <td className="px-4 py-3 text-text-secondary">{p.operational.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {controlCodes.length === MAX_CONTROLS && (
        <p className="text-xs text-text-muted">
          Showing the first {MAX_CONTROLS} controls by code. More carry evidence than are
          listed here.
        </p>
      )}
    </div>
  );
}
```

The cap notice is not decoration: a truncated list that does not say it is truncated is the same silent-loss pattern this codebase keeps removing.

- [ ] **Step 4: Run the navigation test to verify it passes**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npx vitest run tests/unit/dashboard/navigation.test.ts"`

Expected: PASS, all cases, with no skip remaining.

- [ ] **Step 5: Typecheck**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run typecheck 2>&1 | grep 'posture/page' ; echo GREP_DONE"`

Expected: nothing before `GREP_DONE`.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/posture/page.tsx tests/unit/dashboard/navigation.test.ts
git commit -F - <<'MSG'
feat(posture): the observed axis gets a page instead of a widget

/api/posture was fixed substantively in August and reached the interface only as
one card on Overview. The axis now has somewhere to live.

The design called this a thin page over that endpoint. It could not be: the
route requires an explicit `controls` parameter and 400s without one, so
something still had to decide which controls to ask about. The page is a Server
Component calling src/lib/posture/read.ts directly, the same pattern /compliance
uses, scoped to the controls that actually carry evidence -- asking about the
rest would render a wall of gap rows describing the query rather than the
posture. The HTTP route is untouched.

The evidence read pages with an explicit order, because PostgREST guarantees no
stable row order between two range() calls and dropped evidence reads as a
control downgrading for no reason tied to the evidence. And when the 500-control
cap truncates the list, the page says so: a truncated list that hides its own
truncation is the silent loss this codebase keeps removing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

### Task 5: The card that conflates two quantities, and two dormant routes

**Files:**
- Modify: `src/app/api/dashboard/stats/route.ts:71-80`
- Delete: `src/app/api/compliance/roi/route.ts`, `src/app/api/compliance/gaps/route.ts`
- Test: `tests/api/dashboard-stats.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Append to `tests/api/dashboard-stats.test.ts`, following the mocking style already in that file:

```ts
  it('shows a dash, not a confidence average, when no scorecard exists', async () => {
    // The bug: with no scorecard snapshot the card fell back to
    // evaluationSummary.avgConfidence — a confidence average rendered under a
    // compliance label. Two quantities, one name. The honest answer to "what is
    // our compliance score" when nothing has scored it is "—".
    const body = await fetchStatsWith({ scorecardSnapshot: null, avgConfidence: 73 });
    expect(body.score).toBe('—');
    expect(body.score).not.toContain('73');
  });
```

Read the file first and adapt `fetchStatsWith` to whatever helper or mock shape it already uses — do not invent a helper that is not there. The assertion is what matters: with no snapshot and a non-zero `avgConfidence`, `score` is `—`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npx vitest run tests/api/dashboard-stats.test.ts -t 'shows a dash'"`

Expected: FAIL — `score` is `'73%'`.

- [ ] **Step 3: Delete the fallback**

In `src/app/api/dashboard/stats/route.ts`, delete these two lines entirely:

```ts
  if (avgScore === "—" && evaluationSummary.avgConfidence > 0) {
    avgScore = `${evaluationSummary.avgConfidence}%`;
  }
```

Leave this comment where they were:

```ts
  // No fallback to avgConfidence. A confidence average is not a compliance
  // score, and rendering one under the other's label is the class of thing this
  // codebase spent a month removing from the backend. With nothing to report,
  // avgScore stays "—".
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npx vitest run tests/api/dashboard-stats.test.ts"`

Expected: PASS, including every test already in the file.

- [ ] **Step 5: Delete the two dormant routes**

```bash
git rm src/app/api/compliance/roi/route.ts src/app/api/compliance/gaps/route.ts
```

Do NOT touch `src/lib/data/compliance-data.ts`. `getTopGaps` and `getRoiPath` keep live callers in `src/app/api/compliance/report/route.ts:183-184` and `src/lib/context/posture-profile.ts:47`; `getTopGaps` also still serves the Frameworks page. Deleting them breaks report generation.

Do NOT delete `src/app/api/compliance/evaluations/route.ts`. It has no interface consumer either, but it was not audited, and removing unaudited code is how a working thing disappears.

- [ ] **Step 6: Run the full suite**

Run: `wsl.exe -d Ubuntu bash -lc "cd ~/ihOS && npm run test:unit -- --testTimeout=60000 2>&1 | tail -5"`

Expected: PASS. If a test referenced either deleted route, that is a real consumer this plan did not know about — stop and report rather than deleting the test.

- [ ] **Step 7: Commit**

```bash
git add -A src/app/api/dashboard/stats/route.ts tests/api/dashboard-stats.test.ts src/app/api/compliance
git commit -F - <<'MSG'
fix(dashboard): a confidence average is not a compliance score

With no scorecard snapshot, the Overview card fell back to
evaluationSummary.avgConfidence and rendered it under a compliance label. Two
different quantities wearing one name, on the product's front page, while the
backend spent a month removing exactly this -- 25,589 fabricated mappings
quarantined, a fabricated index retired by ADR, every figure made to cite the
rule that produced it. The fallback is deleted rather than made conditional, and
the card shows a dash.

Also removes /api/compliance/roi and /api/compliance/gaps. Not because their
data is bad -- getTopGaps reads evidence_evaluations and is sound -- but because
nothing reaches them and nothing has maintained them since before June. Their
helpers stay: report generation and the posture profile still call them.

/api/compliance/evaluations is left alone. It has no consumer either, but it was
not audited here, and deleting unaudited code is how a working thing disappears.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
```

---

## Self-Review

**Spec coverage.** §3 organising principle → Task 1's module comment. §4 navigation → Task 1. §5.1/§5.2 coverage endpoint → Task 2. §5.3 Frameworks page repoint, widgets kept, ROI hidden → Task 3. §6 `/posture` → Task 4 (with a stated correction). §6 stats card → Task 5. §7 deletions → Task 5. §8 tests: navigation cases 1-3 → Task 1; coverage cases 4-6 → Task 2; stats card → Task 5. §9 untouched surfaces → the Global Constraints block.

**Placeholder scan.** One step is deliberately not literal: Task 5 Step 1 says to adapt the test helper to whatever `tests/api/dashboard-stats.test.ts` already uses rather than quoting a helper that may not exist. The assertion itself is exact. Everything else carries its code.

**Type consistency.** `NavItem`/`NavGroup`/`NAV_GROUPS`/`NAV_ITEMS`/`isNavItemActive` are named identically in Tasks 1 and 4. The coverage row shape in Task 2's Interfaces matches the object the route builds and the fields Task 3 reads (`requirementsTotal`, `requirementsUnrecorded`, `requirementsUnevaluated`, `policyVersion`, `policyOwner`, `undecided`/`status`). Task 3 uses a local `undecided: boolean` rather than Task 2's `status` string because it calls the library directly rather than the endpoint; both are stated in their own task so neither implementer has to guess.

**One sequencing note.** Task 1 leaves the navigation test skipping `/posture`, and Task 4 removes that skip as its first step. The skip is written with the reason inline so it cannot be mistaken for permanent. If Task 4 is dropped, the skip must be deleted along with the `/posture` nav entry — a menu item pointing at nothing is the exact failure that test exists to catch.
