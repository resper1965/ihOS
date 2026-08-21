# Operational Evidence via Confirmed Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the compliance posture accurate as well as honest, by feeding the posture engine the 628 LLM-confirmed operational evidence tags that already sit in the database and are currently ignored.

**Architecture:** Add a second provenance source alongside retrieval. `document_chunks.scf_controls[]` holds control codes the two-stage tagger classified as `implements` — a stricter assertion than the prose similarity the engine uses today. Fetch every tagged chunk in one paginated read, invert it into a control→chunks index in memory, and emit provenance rows with `method: 'llm_confirmed'`. The existing `buildEvidenceLinks` merges the two sources for free: it already dedups on `(control, chunk)` keeping the higher score, and the role still derives from the document's `doc_type`. Also fix the four cron routes whose HTTP method mismatch is why 61% of operational chunks carry no tags.

**Tech Stack:** TypeScript 5 (strict), Next.js 16.2.7 App Router, Supabase Postgres, Vitest 4, tsx.

**Spec:** `docs/superpowers/specs/2026-08-21-operational-evidence-design.md`

## Global Constraints

- **Node MUST be 20.20.2 from nvm.** Prefix every command with
  `export PATH=/home/resper/.nvm/versions/node/v20.20.2/bin:/usr/bin:/bin`. The system node at
  `/usr/bin/node` is v18.19.1 and **vitest 4 cannot start on it** — `rolldown` imports
  `styleText` from `node:util`, added in Node 20.12. The symptom is a startup `SyntaxError`, not
  a test failure, so a run that "produced no failures" on the wrong node produced nothing. The
  shell PATH in this environment is also broken, so `/usr/bin:/bin` must stay on it for `git`.
- `src/scripts/backfill-posture.ts` already polyfills `globalThis.WebSocket` from `ws`. Do not
  remove it: `supabase-js` builds a RealtimeClient inside `createClient()` even though
  `admin.ts` passes `realtime: { enabled: false }`, and that constructor throws on Node 20.
- TypeScript 5 strict. `@/` → `src/` for cross-directory imports; relative paths for
  same-directory siblings.
- **`tsc --noEmit` must add no new errors for files you touch.** The repo carries 202
  pre-existing errors (hence `typescript.ignoreBuildErrors` in `next.config.ts`), so a clean
  whole-repo run is not the bar. Verify with `npx tsc --noEmit 2>&1 | grep -E "posture|cron"`.
  **Mandatory** — vitest transpiles without type-checking, so green tests do not prove the code
  compiles. An earlier increment shipped a strict-mode error that 11 passing tests never caught.
- Tests live at `tests/unit/posture/<name>.test.ts`, open with a `// tests/unit/...` path
  comment, and import `describe`/`it`/`expect` from `vitest` even though `globals: true`.
- Run one file with `npx vitest run <path>`.
- Baseline: a clean checkout of `main` runs 409 tests across 42 files. The main working tree
  carries ~879 lines of unrelated uncommitted work and runs 413; **do not commit any of it.**
- Verdict states are exactly `conforming` | `partial` | `informal` | `gap`. Evidence roles are
  exactly `policy` | `operational`. A chunk holds at most one role per control.
- Scores are normalised 0..1 before meeting any threshold. `MIN_EVIDENCE_SCORE` is 0.65 and
  **must not change in this increment** — the spec parks that decision deliberately.
- No estimation anywhere. Absent evidence is `gap`.
- Commit with Conventional Commits plus the trailer:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/app/api/cron/{sync-knowledge-base,run-assessment,run-threat-model,recalibrate-scrms}/route.ts` | Add a `GET` export delegating to the existing `POST`. Nothing else changes. |
| `src/lib/posture/tag-evidence.ts` | Pure: database rows → tagged chunks → control index → provenance rows. No IO. |
| `src/scripts/backfill-posture.ts` | Modify: fetch tagged chunks, merge tag provenance with retrieval provenance, report the delta. |
| `tests/unit/posture/tag-evidence.test.ts` | Tests for the pure module. |
| `tests/unit/posture/cron-methods.test.ts` | Asserts every cron route exports `GET`, by reading the route files as text. |

Rationale: all logic stays in a pure, IO-free module so it is tested without a database, matching
how `verdict.ts`, `evidence-role.ts` and `bind-evidence.ts` are already built. The script keeps
all IO.

---

### Task 1: Make the cron routes invocable

**Files:**
- Modify: `src/app/api/cron/sync-knowledge-base/route.ts`
- Modify: `src/app/api/cron/run-assessment/route.ts`
- Modify: `src/app/api/cron/run-threat-model/route.ts`
- Modify: `src/app/api/cron/recalibrate-scrms/route.ts`
- Test: `tests/unit/posture/cron-methods.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks import. This task exists because
  `/api/cron/sync-knowledge-base` is the only thing that tags previously-untagged chunks, and it
  has never run.

**Why all four in one task:** it is the same one-line change in four files, which is a batch, not
four tasks. A reviewer would accept or reject all four together.

**Background you need.** `vercel.json` schedules six cron paths. Vercel Cron invokes them with
**GET**. These four export `POST` only, so they have been returning 405 on every schedule;
`defectdojo-sync` and `agentic-triggers` export `GET` and do run. Each of these four parses its
request body inside its own `try` block (`run-assessment:31`, `run-threat-model:37`,
`recalibrate-scrms:29`; `sync-knowledge-base` parses no body), so a bodyless GET falls back to
its default object rather than throwing.

Keep `POST` as well as adding `GET` — the audit endpoint pattern in this repo is invoked
programmatically with POST, and removing it could break a caller this plan cannot see.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/posture/cron-methods.test.ts`:

```ts
// tests/unit/posture/cron-methods.test.ts
// Vercel Cron invokes scheduled paths with GET. A route that exports POST only
// returns 405 on every schedule, silently, forever.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SCHEDULED = [
  'sync-knowledge-base',
  'run-assessment',
  'defectdojo-sync',
  'run-threat-model',
  'recalibrate-scrms',
  'agentic-triggers',
];

function routeSource(name: string): string {
  const path = resolve(process.cwd(), 'src/app/api/cron', name, 'route.ts');
  expect(existsSync(path), `missing route file for ${name}`).toBe(true);
  return readFileSync(path, 'utf8');
}

describe('cron routes', () => {
  it('every path scheduled in vercel.json has a route file', () => {
    const vercel = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { crons: Array<{ path: string }> };
    const scheduledPaths = vercel.crons.map((c) => c.path.replace('/api/cron/', ''));
    expect(scheduledPaths.sort()).toEqual([...SCHEDULED].sort());
  });

  it.each(SCHEDULED)('%s exports GET so Vercel Cron can invoke it', (name) => {
    expect(routeSource(name)).toMatch(/export\s+(async\s+)?function\s+GET\b/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/posture/cron-methods.test.ts`
Expected: FAIL — four of the six `exports GET` cases fail (`sync-knowledge-base`,
`run-assessment`, `run-threat-model`, `recalibrate-scrms`). The two `defectdojo-sync` and
`agentic-triggers` cases pass, and so does the `vercel.json` case.

- [ ] **Step 3: Add the GET export to all four routes**

In each of the four files, append this at the end of the file. Replace `<NAME>` with the route's
directory name so the comment is accurate, and keep the existing `POST` untouched:

```ts
/**
 * Vercel Cron invokes scheduled paths with GET, and vercel.json schedules this
 * route. Exporting POST alone returned 405 on every run. POST is kept because
 * this endpoint is also triggered programmatically.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}
```

If a file's `POST` signature names its parameter `req` rather than `request`, match it. If a
file does not already import `NextRequest`, add it to the existing `next/server` import rather
than writing a second import line.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/posture/cron-methods.test.ts`
Expected: PASS — 7 tests (1 for `vercel.json`, 6 for the routes).

- [ ] **Step 5: Confirm nothing else broke**

Run: `npx tsc --noEmit 2>&1 | grep -E "cron"`
Expected: no output.

Run: `npm run test:unit`
Expected: the full suite passes, 7 tests more than the baseline you measured before starting.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/sync-knowledge-base/route.ts \
        src/app/api/cron/run-assessment/route.ts \
        src/app/api/cron/run-threat-model/route.ts \
        src/app/api/cron/recalibrate-scrms/route.ts \
        tests/unit/posture/cron-methods.test.ts
git commit -m "fix(cron): export GET so Vercel can invoke the four dead schedules

Vercel Cron invokes scheduled paths with GET. These four exported POST only,
so every scheduled run has returned 405. sync-knowledge-base is the only
thing that tags previously-untagged chunks, which is why 61% of operational
chunks carry no SCF tags.

POST is kept; these endpoints are also triggered programmatically.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**Do not enable or trigger any of these jobs.** Making them invocable is this task; deciding to
run them is a separate, deliberate act — `run-assessment` writes assessments and
`recalibrate-scrms` shells out to a Python script whose default path is a developer's home
directory.

---

### Task 2: The tag index

**Files:**
- Create: `src/lib/posture/tag-evidence.ts`
- Test: `tests/unit/posture/tag-evidence.test.ts`

**Interfaces:**
- Consumes: `ProvenanceRow` from `@/lib/posture/types` — already on `main`:
  `{ documentId: number; chunkId: number; scfControlCode: string; method: 'vector' | 'llm_confirmed'; score: number; snippet: string; justification: string | null }`
- Produces:
  - `TAG_CONFIDENCE: 0.95`
  - `interface TaggedChunk { chunkId: number; documentId: number; snippet: string; controlCodes: string[] }`
  - `rowsToTaggedChunks(rows: readonly Record<string, unknown>[]): TaggedChunk[]`
  - `indexByControl(chunks: readonly TaggedChunk[]): Map<string, TaggedChunk[]>`
  - `tagProvenanceFor(index: ReadonlyMap<string, TaggedChunk[]>, controlCode: string): ProvenanceRow[]`

**Why `TAG_CONFIDENCE` is a constant and not a measurement.** A tag carries no similarity score
— the tagger's own scores were written to `document_control_provenance`, which does not exist in
this database. 0.95 sits above `MIN_EVIDENCE_SCORE` (0.65) by construction, encoding the claim
that an LLM-confirmed `implements` outranks a prose match. That is an assertion, not a
measurement, and the code must say so.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/posture/tag-evidence.test.ts`:

```ts
// tests/unit/posture/tag-evidence.test.ts
// document_chunks.scf_controls[] holds only codes the tagger classified as
// `implements` (src/lib/chat/scf-tagger.ts:146), so it is a stronger claim than
// prose similarity — and the posture engine ignored it entirely.

import { describe, it, expect } from 'vitest';
import {
  TAG_CONFIDENCE,
  rowsToTaggedChunks,
  indexByControl,
  tagProvenanceFor,
} from '@/lib/posture/tag-evidence';
import { MIN_EVIDENCE_SCORE } from '@/lib/posture/bind-evidence';

describe('TAG_CONFIDENCE', () => {
  it('clears the evidence floor, so a confirmed tag always becomes evidence', () => {
    expect(TAG_CONFIDENCE).toBeGreaterThan(MIN_EVIDENCE_SCORE);
    expect(TAG_CONFIDENCE).toBeLessThanOrEqual(1);
  });
});

describe('rowsToTaggedChunks', () => {
  it('maps database rows, coercing ids and truncating the snippet to 300 chars', () => {
    const long = 'x'.repeat(400);
    expect(
      rowsToTaggedChunks([
        { id: '7', document_id: '3', content: long, scf_controls: ['GOV-01', 'IAC-02'] },
      ]),
    ).toEqual([
      { chunkId: 7, documentId: 3, snippet: 'x'.repeat(300), controlCodes: ['GOV-01', 'IAC-02'] },
    ]);
  });

  it('drops rows whose scf_controls is empty, null or not an array', () => {
    const rows = [
      { id: 1, document_id: 1, content: 'a', scf_controls: [] },
      { id: 2, document_id: 1, content: 'a', scf_controls: null },
      { id: 3, document_id: 1, content: 'a' },
      { id: 4, document_id: 1, content: 'a', scf_controls: 'GOV-01' },
    ];
    expect(rowsToTaggedChunks(rows)).toEqual([]);
  });

  it('trims codes and drops empty ones without dropping the chunk', () => {
    expect(
      rowsToTaggedChunks([
        { id: 1, document_id: 2, content: 'c', scf_controls: [' GOV-01 ', '', 'IAC-02'] },
      ])[0].controlCodes,
    ).toEqual(['GOV-01', 'IAC-02']);
  });

  it('drops a chunk whose codes are all blank', () => {
    expect(
      rowsToTaggedChunks([{ id: 1, document_id: 2, content: 'c', scf_controls: ['', '  '] }]),
    ).toEqual([]);
  });

  it('tolerates a missing content field', () => {
    expect(
      rowsToTaggedChunks([{ id: 1, document_id: 2, scf_controls: ['GOV-01'] }])[0].snippet,
    ).toBe('');
  });
});

describe('indexByControl', () => {
  const chunks = rowsToTaggedChunks([
    { id: 1, document_id: 10, content: 'a', scf_controls: ['GOV-01', 'IAC-02'] },
    { id: 2, document_id: 11, content: 'b', scf_controls: ['GOV-01'] },
  ]);

  it('lists every chunk under each of its codes', () => {
    const index = indexByControl(chunks);
    expect(index.get('GOV-01')!.map((c) => c.chunkId)).toEqual([1, 2]);
    expect(index.get('IAC-02')!.map((c) => c.chunkId)).toEqual([1]);
  });

  it('has no entry for a code no chunk carries', () => {
    expect(indexByControl(chunks).has('ZZZ-99')).toBe(false);
  });

  it('returns an empty index for no chunks', () => {
    expect(indexByControl([]).size).toBe(0);
  });
});

describe('tagProvenanceFor', () => {
  const index = indexByControl(
    rowsToTaggedChunks([
      { id: 5, document_id: 50, content: 'evidence text', scf_controls: ['GOV-01'] },
    ]),
  );

  it('emits one provenance row per tagged chunk, marked llm_confirmed', () => {
    expect(tagProvenanceFor(index, 'GOV-01')).toEqual([
      {
        documentId: 50,
        chunkId: 5,
        scfControlCode: 'GOV-01',
        method: 'llm_confirmed',
        score: TAG_CONFIDENCE,
        snippet: 'evidence text',
        justification: 'SCF tag confirmed as `implements` by scf-tagger',
      },
    ]);
  });

  it('returns nothing for a control with no tagged chunks, rather than throwing', () => {
    expect(tagProvenanceFor(index, 'ZZZ-99')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/posture/tag-evidence.test.ts`
Expected: FAIL — cannot resolve `@/lib/posture/tag-evidence`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/posture/tag-evidence.ts`:

```ts
// src/lib/posture/tag-evidence.ts
// A second evidence source, alongside retrieval.
//
// `document_chunks.scf_controls[]` is not a topical hint. src/lib/chat/scf-tagger.ts
// runs cosine similarity against the SCF catalogue, then an LLM confirmation pass,
// and line 146 filters to `llm_status === 'implements'` before writing — with a
// prompt that says "Be strict. If in doubt, classify as 'mentions'." So each code
// in that array is a conservative, confirmed assertion that the chunk evidences
// the control being actively implemented.
//
// Retrieval scores a chunk against the control's *description*, which is written
// in policy language. An SBOM, a Sonar report or an audit log contains almost no
// prose resembling it, which is why operational chunks are retrieved at half the
// rate their corpus mass predicts. These tags find what that similarity cannot.

import type { ProvenanceRow } from './types';

/**
 * Score given to tag-derived provenance.
 *
 * This is an assertion, not a measurement. A tag carries no similarity score —
 * the tagger's own scores went to `document_control_provenance`, which does not
 * exist in this database. The value sits above MIN_EVIDENCE_SCORE (0.65) by
 * construction, encoding the claim that an LLM-confirmed `implements` outranks a
 * prose match. Consequence to keep in mind: tag-derived evidence cannot be
 * ranked against itself, because every row carries the same score.
 */
export const TAG_CONFIDENCE = 0.95;

const SNIPPET_LIMIT = 300;

export interface TaggedChunk {
  chunkId: number;
  documentId: number;
  snippet: string;
  controlCodes: string[];
}

export function rowsToTaggedChunks(
  rows: readonly Record<string, unknown>[],
): TaggedChunk[] {
  const out: TaggedChunk[] = [];
  for (const r of rows) {
    if (!Array.isArray(r.scf_controls)) continue;
    const controlCodes = r.scf_controls
      .map((c) => String(c).trim())
      .filter((c) => c.length > 0);
    if (controlCodes.length === 0) continue;
    out.push({
      chunkId: Number(r.id),
      documentId: Number(r.document_id),
      snippet: String(r.content ?? '').slice(0, SNIPPET_LIMIT),
      controlCodes,
    });
  }
  return out;
}

/** Inverts chunks-to-codes into codes-to-chunks, so one read serves every control. */
export function indexByControl(
  chunks: readonly TaggedChunk[],
): Map<string, TaggedChunk[]> {
  const index = new Map<string, TaggedChunk[]>();
  for (const chunk of chunks) {
    for (const code of chunk.controlCodes) {
      const bucket = index.get(code);
      if (bucket) bucket.push(chunk);
      else index.set(code, [chunk]);
    }
  }
  return index;
}

export function tagProvenanceFor(
  index: ReadonlyMap<string, TaggedChunk[]>,
  controlCode: string,
): ProvenanceRow[] {
  const chunks = index.get(controlCode);
  if (!chunks) return [];
  return chunks.map((c) => ({
    documentId: c.documentId,
    chunkId: c.chunkId,
    scfControlCode: controlCode,
    method: 'llm_confirmed' as const,
    score: TAG_CONFIDENCE,
    snippet: c.snippet,
    justification: 'SCF tag confirmed as `implements` by scf-tagger',
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/posture/tag-evidence.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "tag-evidence"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/posture/tag-evidence.ts tests/unit/posture/tag-evidence.test.ts
git commit -m "feat(posture): read LLM-confirmed SCF tags as an evidence source

document_chunks.scf_controls[] holds only codes scf-tagger classified as
`implements` after an LLM confirmation pass, which is a stronger claim than
the prose similarity the posture engine relied on. 628 tagged operational
chunks existed and contributed nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Merge tags into the backfill and report the delta

**Files:**
- Modify: `src/scripts/backfill-posture.ts`

**Interfaces:**
- Consumes: `rowsToTaggedChunks`, `indexByControl`, `tagProvenanceFor` (Task 2);
  `buildEvidenceLinks`, `normalizeRrf`, `roleForDocType` (already on `main`);
  `groupPosture`, `summarise` (already on `main`).
- Produces: no new exports. The deliverable is the printed comparison.

No unit test: this is an operator script whose logic lives in the already-tested pure modules.
`tsc` and the printed output are its verification.

**The query you need.** Verified against production on 2026-08-21:
`document_chunks?select=id,document_id,content,scf_controls&scf_controls=neq.{}` returns **1,541**
rows — the whole tagged set. One paginated read, no per-control queries, and the GIN index is
not needed under this shape.

- [ ] **Step 1: Add the tagged-chunk read**

In `src/scripts/backfill-posture.ts`, add the imports next to the existing posture imports:

```ts
import { indexByControl, rowsToTaggedChunks, tagProvenanceFor } from '../lib/posture/tag-evidence';
```

Then, immediately after the block that builds `docTypes` and reports roleless documents, insert:

```ts
  // 2b. Every chunk the tagger confirmed as evidencing a control. One paginated
  // read for the whole corpus (~1,541 rows), inverted in memory — 1,468 per-control
  // queries would be the same data at 1,468x the round trips.
  const taggedRows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('document_chunks')
      .select('id, document_id, content, scf_controls')
      .neq('scf_controls', '{}')
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(`document_chunks (tagged): ${error.message}`);
    taggedRows.push(...((data ?? []) as Array<Record<string, unknown>>));
    if (!data || data.length < 1000) break;
  }
  const tagIndex = indexByControl(rowsToTaggedChunks(taggedRows));
  console.log(`tagged chunks: ${taggedRows.length}, covering ${tagIndex.size} controls`);
```

- [ ] **Step 2: Merge tag provenance into the retrieval loop**

Inside the per-control loop, after the `for (const row of (data ?? []) ...)` block that pushes
retrieval provenance, add:

```ts
      // Tag-derived provenance for the same control. buildEvidenceLinks dedups on
      // (control, chunk) keeping the higher score, so a chunk found by both paths
      // collapses to one link and the role still comes from the document's doc_type.
      provenance.push(...tagProvenanceFor(tagIndex, control.control_code));
```

- [ ] **Step 3: Report the delta so the change is attributable**

Replace the block that prints `evidence links:` and its two role counts with:

```ts
  // 4. Bind to evidence, then report. Build once from retrieval alone and once
  // from both sources, so the tags' contribution is measured rather than asserted.
  const retrievalOnly = provenance.filter((p) => p.method === 'vector');
  const linksBefore = buildEvidenceLinks(retrievalOnly, docTypes, { productVersionId: null });
  const links = buildEvidenceLinks(provenance, docTypes, { productVersionId: null });

  const roleCount = (ls: typeof links, role: 'policy' | 'operational') =>
    ls.filter((l) => l.role === role).length;

  console.log(`\nevidence links: ${linksBefore.length} -> ${links.length}`);
  console.log(
    `  policy:      ${roleCount(linksBefore, 'policy')} -> ${roleCount(links, 'policy')}`,
  );
  console.log(
    `  operational: ${roleCount(linksBefore, 'operational')} -> ${roleCount(links, 'operational')}`,
  );
```

- [ ] **Step 4: Report both verdict distributions side by side**

Find the block that builds `postures` and prints the full-catalogue distribution. Replace it
with:

```ts
  const controlCodes = controlList.map((c) => c.control_code);
  const summaryBefore = summarise(groupPosture(controlCodes, linksBefore));
  const postures = groupPosture(controlCodes, links);
  const summary = summarise(postures);

  console.log('\nverdict distribution (full catalogue) — retrieval only -> with tags:');
  for (const state of ['conforming', 'partial', 'informal', 'gap'] as const) {
    console.log(
      `  ${state.padEnd(11)}${String(summaryBefore[state]).padStart(5)} -> ${summary[state]}`,
    );
  }
```

Leave everything after this — the `control_evaluation_cache` comparison, the `states < 2` guard
and its `return`, and the `--commit` writes — exactly as they are. The guard was fixed in a
previous increment and must keep working.

- [ ] **Step 5: Type-check and confirm no regression**

Run: `npx tsc --noEmit 2>&1 | grep -E "backfill-posture"`
Expected: no output.

Run: `npm run test:unit`
Expected: the full suite still passes with the counts from Tasks 1 and 2 added.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/backfill-posture.ts
git commit -m "feat(posture): merge confirmed-tag evidence into the backfill

Reads every tagged chunk once and inverts it in memory, then emits
llm_confirmed provenance alongside the vector provenance from retrieval.
buildEvidenceLinks already dedups on (control, chunk) keeping the higher
score, so the merge needs no new logic and the one-role-per-chunk guarantee
is untouched.

Reports both distributions side by side so the tags' contribution is
measured, not asserted.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Report what the numbers say — do not run the script**

**Do not execute the backfill**, with or without `--commit`. It reads the user's production
database and spends OpenAI budget on ~1,468 embeddings, so running it is the user's call, not
yours. In your report, state that the deliverable is unrun and name the two things the operator
should check when they do run it:

1. **`operational` links should rise materially.** 628 tagged operational chunks exist. If the
   count barely moves, the merge is not reaching them and something is wrong.
2. **`informal` must not grow faster than `conforming`** (spec §7.6). Tag evidence is
   operational-heavy, so a large `informal` jump would mean controls are gaining operational
   evidence while their policy evidence is still not being found — that would be evidence the
   retrieval imbalance is worse than measured, not that this change worked.

---

## What this plan deliberately does not do

- Does not change `MIN_EVIDENCE_SCORE`, or act on the finding that it behaves as an
  intersection test rather than a relevance dial. Its own decision.
- Does not touch `verdictConfidence`, which a previous review showed only restates the verdict
  and invites a "45% compliant" misreading that the SP-1 spec forbids.
- Does not address the `role`-vs-`doc_type` staleness hazard, or retire
  `document_control_provenance` and its three consumers.
- Does not add the `/api/posture` auth-gate test. **That remains a hard precondition before the
  route is wired to any caller** — it reads compliance data through a service-role client that
  bypasses RLS, and only code review has ever checked its gate.
- Does not schedule or trigger any cron job. Task 1 makes four of them invocable; deciding to
  let them run is separate.
- Does not repair the migration ledger (33 of 52 files unregistered) or regenerate
  `types.generated.ts`. Both are real and both are their own work.

## Self-review

**Spec coverage.** §4 DEC-1 → Tasks 2 and 3. DEC-2 → Task 2 Step 3 (`method: 'llm_confirmed'`).
DEC-3 → Task 3 Step 1 (one paginated read, inverted in memory). DEC-4 → Task 1. DEC-5 → the
"does not do" list above. §5 the merge → Task 3 Step 2. §5.1 scoring → Task 2's
`TAG_CONFIDENCE` and its comment. §7 criteria: 1→Task 1, 2→Task 2 (`indexByControl` empty case,
`tagProvenanceFor` missing-code case) and Task 3 Step 1, 3→Task 2 Step 3, 4→Task 3 Step 2 relies
on `buildEvidenceLinks`' existing dedup, which `tests/unit/posture/bind-evidence.test.ts`
already covers, 5→Task 3 Steps 3–4, 6→Task 3 Step 7.

**Gap found and closed.** Criterion 4 (a chunk found by both sources yields one link) had no
task asserting it, because the behaviour lives in `buildEvidenceLinks`, which is already tested.
Rather than duplicate that test, Task 3 Step 2's comment names the dependency explicitly so a
reviewer can check the claim instead of taking it on faith.

**Placeholder scan.** No TBDs. Every code step carries runnable code. Task 3 has no unit test,
stated with its reason. Task 1's edit is described per-file rather than pasted four times
because the four files differ only in a parameter name.

**Type consistency.** `ProvenanceRow`'s `method` union already includes `'llm_confirmed'` on
`main`, so Task 2 adds no type. `TaggedChunk` is defined once in Task 2 and used only there and
in Task 3. `rowsToTaggedChunks` / `indexByControl` / `tagProvenanceFor` keep the same signatures
in both tasks. `linksBefore` and `links` in Task 3 are both `EvidenceLink[]`, so `roleCount` and
`groupPosture` accept either.

**One thing a reviewer should push back on.** `TAG_CONFIDENCE = 0.95` gives every tag-derived
link an identical score, so tag evidence cannot be ranked internally and always outranks
retrieval evidence in the dedup. That is intentional and documented, but it is a design choice
with teeth: if the tagger is ever wrong about a chunk, no score can express doubt about it. The
honest fix is persisting the tagger's own similarity, which needs the provenance-table question
settled first.
