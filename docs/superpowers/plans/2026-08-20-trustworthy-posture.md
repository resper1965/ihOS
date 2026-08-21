# Trustworthy Posture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the platform's undefendable "131 controls, 100% conforming" with a verdict that is derived from named, role-separated evidence and can be traced to a document and a paragraph.

**Architecture:** Three new tables under a new `src/lib/posture/` module. The verdict is never stored — it is a pure function counting evidence rows by role (`policy` vs `operational`), where the role is determined by the source document's type. Because a document type maps to exactly one role, no code path can count a policy as operational evidence. The honest 4-state logic already present in `src/lib/assessment/local-engine.ts:173-179` is promoted to be the only logic.

**Tech Stack:** TypeScript 5 (strict), Next.js 16.2.7 App Router, Supabase Postgres + pgvector, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-20-trustworthy-posture-design.md`

## Global Constraints

- **Node MUST be 20.20.2 from nvm.** Prefix every command with
  `export PATH=/home/resper/.nvm/versions/node/v20.20.2/bin:/usr/bin:/bin`. The system
  node at `/usr/bin/node` is v18.19.1 and **vitest 4 cannot start on it** — `rolldown`
  imports `styleText` from `node:util`, which landed in Node 20.12. The symptom is a
  startup `SyntaxError`, not a test failure, so a run that "produced no failures" on the
  wrong node produced nothing at all. `.nvmrc` pins 20.20.2. The shell PATH in this
  environment is also broken, so `/usr/bin:/bin` must stay on it for `git` and friends.
- Package manager: `npm`. Dependencies are already installed in this worktree.
- Baseline before this plan: `npm run test:unit` → 34 files, 341 tests, all passing. Any
  failure you see is yours.
- Tests: Vitest, `globals: true` (no importing `describe`/`it`/`expect` is required, but existing tests do import them — follow suit). Test files live at `tests/unit/<area>/<name>.test.ts` and open with a `// tests/unit/...` path comment.
- Path alias: `@/` → `src/`. Use it in all imports.
- Run a single test file with `npx vitest run <path>`; a single test with `npx vitest run <path> -t "<name>"`.
- `tests/setup.ts` sets `GRC_FALLBACK_DISABLED='true'` globally. Do not rely on any Standard API fallback in tests.
- Migration filenames must sort **after** `20260707*`. Use the `20260820NNNNNN_` prefix. Never rename an existing migration — file ordering in this repo is load-bearing (`0095_` before `009_`, `0129_` before `013_`).
- Verdict states are exactly `conforming` | `partial` | `informal` | `gap`. Only `conforming` is compliant.
- Evidence roles are exactly `policy` | `operational`. A chunk holds at most one role.
- **Scores are normalised to 0..1 before they meet any threshold.** The `similarity` column returned by `match_documents_hybrid` is *not* a cosine — `supabase/migrations/20260701000002_add_clarity_to_rpc.sql:104` aliases the reciprocal-rank-fusion `combined_score` as `similarity`, and it ranges roughly 0 to 0.033. Comparing a raw RRF score against a 0..1 threshold marks every control as a gap. Always pass retrieval scores through `normalizeRrf` first.
- No LLM call may produce a verdict. An LLM may only classify a chunk's relevance when writing provenance, and its justification must be persisted alongside.
- No estimation anywhere. Absent evidence is `gap`.
- Commit after every task with a Conventional Commits message.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/posture/types.ts` | Shared types: `Verdict`, `EvidenceRole`, `EvidenceLink`, `ProvenanceRow`. No logic. |
| `src/lib/posture/verdict.ts` | Pure verdict derivation and confidence. No IO. |
| `src/lib/posture/evidence-role.ts` | Pure `doc_type` → role classification, including legacy lowercase values. No IO. |
| `src/lib/posture/bind-evidence.ts` | Pure: provenance rows + doc types → evidence links. Enforces threshold, role, dedupe. No IO. |
| `src/lib/posture/provenance.ts` | IO: persist provenance rows in batches. |
| `src/lib/posture/read.ts` | IO: read evidence for a control and return verdict + evidence by role. |
| `src/scripts/backfill-posture.ts` | One-shot backfill over the existing corpus; prints the verdict distribution. |
| `src/app/api/posture/route.ts` | Read API, internal-role gated. |
| `supabase/migrations/20260820000001_posture_core.sql` | The three tables, constraints, indexes, RLS. |
| `tests/unit/posture/*.test.ts` | One test file per pure module, plus a migration-invariant test. |

Rationale for the split: every file that holds a rule is pure and IO-free, so the rules are tested without a database. All IO is confined to three thin files.

---

### Task 1: Verdict derivation

**Files:**
- Create: `src/lib/posture/types.ts`
- Create: `src/lib/posture/verdict.ts`
- Test: `tests/unit/posture/verdict.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type EvidenceRole = 'policy' | 'operational'`
  - `type Verdict = 'conforming' | 'partial' | 'informal' | 'gap'`
  - `interface EvidenceLink { scfControlCode: string; productVersionId: string | null; chunkId: number; documentId: number; role: EvidenceRole; score: number; snippet: string }`
  - `interface ProvenanceRow { documentId: number; chunkId: number; scfControlCode: string; method: 'vector' | 'llm_confirmed'; score: number; snippet: string; justification: string | null }`
  - `deriveVerdict(links: readonly EvidenceLink[]): Verdict`
  - `isCompliant(verdict: Verdict): boolean`
  - `verdictConfidence(links: readonly EvidenceLink[]): number`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/posture/verdict.test.ts`:

```ts
// tests/unit/posture/verdict.test.ts
// Pure verdict derivation — the 4-state logic, with no database.

import { describe, it, expect } from 'vitest';
import { deriveVerdict, isCompliant, verdictConfidence } from '@/lib/posture/verdict';
import type { EvidenceLink } from '@/lib/posture/types';

function link(role: EvidenceLink['role'], score = 0.8, chunkId = 1): EvidenceLink {
  return {
    scfControlCode: 'GOV-01',
    productVersionId: null,
    chunkId,
    documentId: 10,
    role,
    score,
    snippet: 'snippet',
  };
}

describe('deriveVerdict', () => {
  it('is conforming when both roles are present', () => {
    expect(deriveVerdict([link('policy'), link('operational', 0.8, 2)])).toBe('conforming');
  });

  it('is partial when only policy evidence is present', () => {
    expect(deriveVerdict([link('policy')])).toBe('partial');
  });

  it('is informal when only operational evidence is present', () => {
    expect(deriveVerdict([link('operational')])).toBe('informal');
  });

  it('is gap when there is no evidence at all', () => {
    expect(deriveVerdict([])).toBe('gap');
  });

  it('does not become conforming from many policy links alone', () => {
    const many = [link('policy', 0.9, 1), link('policy', 0.95, 2), link('policy', 0.99, 3)];
    expect(deriveVerdict(many)).toBe('partial');
  });
});

describe('isCompliant', () => {
  it('treats only conforming as compliant', () => {
    expect(isCompliant('conforming')).toBe(true);
    expect(isCompliant('partial')).toBe(false);
    expect(isCompliant('informal')).toBe(false);
    expect(isCompliant('gap')).toBe(false);
  });
});

describe('verdictConfidence', () => {
  it('is zero with no evidence', () => {
    expect(verdictConfidence([])).toBe(0);
  });

  it('averages the best score of each role, counting a missing role as zero', () => {
    // policy best 0.8, operational absent -> (0.8 + 0) / 2 = 0.4
    expect(verdictConfidence([link('policy', 0.8)])).toBe(40);
  });

  it('uses the best score per role, not the first', () => {
    const links = [link('policy', 0.4, 1), link('policy', 0.9, 2), link('operational', 0.5, 3)];
    // policy best 0.9, operational best 0.5 -> (0.9 + 0.5) / 2 = 0.7
    expect(verdictConfidence(links)).toBe(70);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/posture/verdict.test.ts`
Expected: FAIL — cannot resolve `@/lib/posture/verdict`.

- [ ] **Step 3: Write the types**

Create `src/lib/posture/types.ts`:

```ts
// src/lib/posture/types.ts
// Shared types for the posture module. No logic lives here.

/** Which side of the dual-phase test a piece of evidence can serve. */
export type EvidenceRole = 'policy' | 'operational';

/** The four states a control can be in. Only `conforming` is compliant. */
export type Verdict = 'conforming' | 'partial' | 'informal' | 'gap';

/** A chunk accepted as evidence for one control, in exactly one role. */
export interface EvidenceLink {
  scfControlCode: string;
  productVersionId: string | null;
  chunkId: number;
  documentId: number;
  role: EvidenceRole;
  /** Normalised relevance, 0..1. */
  score: number;
  snippet: string;
}

/** A recorded claim that a chunk is about a control, and how we know. */
export interface ProvenanceRow {
  documentId: number;
  chunkId: number;
  scfControlCode: string;
  method: 'vector' | 'llm_confirmed';
  /** Normalised relevance, 0..1. */
  score: number;
  snippet: string;
  justification: string | null;
}
```

- [ ] **Step 4: Write the minimal implementation**

Create `src/lib/posture/verdict.ts`:

```ts
// src/lib/posture/verdict.ts
// The verdict is derived, never stored. It counts evidence by role, so it can
// never drift from the evidence that justifies it.
//
// This is the 4-state logic from src/lib/assessment/local-engine.ts:173-179,
// promoted to be the only logic and made a total function over rows.

import type { EvidenceLink, EvidenceRole, Verdict } from './types';

function bestScore(links: readonly EvidenceLink[], role: EvidenceRole): number {
  let best = 0;
  for (const l of links) {
    if (l.role === role && l.score > best) best = l.score;
  }
  return best;
}

function hasRole(links: readonly EvidenceLink[], role: EvidenceRole): boolean {
  return links.some((l) => l.role === role);
}

export function deriveVerdict(links: readonly EvidenceLink[]): Verdict {
  const policy = hasRole(links, 'policy');
  const operational = hasRole(links, 'operational');

  if (policy && operational) return 'conforming';
  if (policy) return 'partial';
  if (operational) return 'informal';
  return 'gap';
}

export function isCompliant(verdict: Verdict): boolean {
  return verdict === 'conforming';
}

/**
 * Mean of the best score in each role, as 0..100. A missing role counts as
 * zero, so a policy-only control cannot report high confidence.
 */
export function verdictConfidence(links: readonly EvidenceLink[]): number {
  if (links.length === 0) return 0;
  const policy = bestScore(links, 'policy');
  const operational = bestScore(links, 'operational');
  return Math.round(((policy + operational) / 2) * 100);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/posture/verdict.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/posture/types.ts src/lib/posture/verdict.ts tests/unit/posture/verdict.test.ts
git commit -m "feat(posture): derive verdict from role-separated evidence"
```

---

### Task 2: Evidence-role classification

**Files:**
- Create: `src/lib/posture/evidence-role.ts`
- Test: `tests/unit/posture/evidence-role.test.ts`

**Interfaces:**
- Consumes: `EvidenceRole` from `@/lib/posture/types` (Task 1).
- Produces:
  - `roleForDocType(docType: string | null | undefined): EvidenceRole | null`
  - `POLICY_DOC_TYPES: readonly string[]`
  - `OPERATIONAL_DOC_TYPES: readonly string[]`

Legacy lowercase `doc_type` values exist in this database — `src/lib/assessment/local-engine.ts:120` and `:153` both had to accept them. Classification is therefore case-insensitive.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/posture/evidence-role.test.ts`:

```ts
// tests/unit/posture/evidence-role.test.ts
// doc_type -> evidence role. Deliberately strict: only a record of something
// that happened is operational evidence.

import { describe, it, expect } from 'vitest';
import { roleForDocType } from '@/lib/posture/evidence-role';

describe('roleForDocType — policy side', () => {
  it('classifies stated intent as policy', () => {
    for (const t of ['POLICY', 'PROCEDURE', 'CONTRACT', 'CLOUD_ARCH_ORG', 'SAD', 'SRS_SDS']) {
      expect(roleForDocType(t)).toBe('policy');
    }
  });

  it('accepts legacy lowercase values', () => {
    for (const t of ['policy', 'procedure', 'manual', 'soa', 'matrix']) {
      expect(roleForDocType(t)).toBe('policy');
    }
  });
});

describe('roleForDocType — operational side', () => {
  it('classifies records of events as operational', () => {
    expect(roleForDocType('TEST_REPORT')).toBe('operational');
    expect(roleForDocType('EVIDENCE_RECORD')).toBe('operational');
  });

  it('accepts legacy lowercase values', () => {
    for (const t of ['evidence', 'audit_report', 'internal_audit']) {
      expect(roleForDocType(t)).toBe('operational');
    }
  });
});

describe('roleForDocType — fails closed', () => {
  it('gives UNCLASSIFIED no role', () => {
    expect(roleForDocType('UNCLASSIFIED')).toBeNull();
  });

  it('gives null, undefined and empty no role', () => {
    expect(roleForDocType(null)).toBeNull();
    expect(roleForDocType(undefined)).toBeNull();
    expect(roleForDocType('')).toBeNull();
  });

  it('gives an unrecognised type no role rather than guessing', () => {
    expect(roleForDocType('SOMETHING_NEW')).toBeNull();
  });
});

describe('roleForDocType — a type never holds both roles', () => {
  it('assigns exactly one role per known type', () => {
    const known = [
      'POLICY', 'PROCEDURE', 'CONTRACT', 'CLOUD_ARCH_ORG', 'SAD', 'SRS_SDS',
      'TEST_REPORT', 'EVIDENCE_RECORD',
    ];
    for (const t of known) {
      const role = roleForDocType(t);
      expect(role === 'policy' || role === 'operational').toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/posture/evidence-role.test.ts`
Expected: FAIL — cannot resolve `@/lib/posture/evidence-role`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/posture/evidence-role.ts`:

```ts
// src/lib/posture/evidence-role.ts
// A document's type decides which side of the dual-phase test it can serve.
// Because the mapping is a function, one chunk can never count as both a
// policy and an operational record for the same control.
//
// Strictness is the point: design and architecture documents state intent, so
// they are policy. Only a record of something that HAPPENED is operational.

import type { EvidenceRole } from './types';

export const POLICY_DOC_TYPES: readonly string[] = [
  // Current semantic taxonomy (migration 20260705000001)
  'POLICY',
  'PROCEDURE',
  'CONTRACT',
  'CLOUD_ARCH_ORG',
  'SAD',
  'SRS_SDS',
  // Legacy values still present in this database
  'MANUAL',
  'SOA',
  'MATRIX',
];

export const OPERATIONAL_DOC_TYPES: readonly string[] = [
  'TEST_REPORT',
  'EVIDENCE_RECORD',
  // Legacy values still present in this database
  'EVIDENCE',
  'AUDIT_REPORT',
  'INTERNAL_AUDIT',
];

/**
 * Returns the role this document type may serve, or null when it may serve
 * none. UNCLASSIFIED and unrecognised types return null — we do not guess.
 */
export function roleForDocType(docType: string | null | undefined): EvidenceRole | null {
  if (!docType) return null;
  const normalised = docType.trim().toUpperCase();
  if (POLICY_DOC_TYPES.includes(normalised)) return 'policy';
  if (OPERATIONAL_DOC_TYPES.includes(normalised)) return 'operational';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/posture/evidence-role.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/posture/evidence-role.ts tests/unit/posture/evidence-role.test.ts
git commit -m "feat(posture): classify doc_type into a single evidence role"
```

---

### Task 3: Evidence binding

**Files:**
- Create: `src/lib/posture/bind-evidence.ts`
- Test: `tests/unit/posture/bind-evidence.test.ts`

**Interfaces:**
- Consumes: `EvidenceLink`, `ProvenanceRow` from `@/lib/posture/types` (Task 1); `roleForDocType` from `@/lib/posture/evidence-role` (Task 2).
- Produces:
  - `RRF_CEILING: 0.033`
  - `MIN_EVIDENCE_SCORE: 0.65`
  - `normalizeRrf(raw: number): number`
  - `buildEvidenceLinks(provenance: readonly ProvenanceRow[], docTypeByDocumentId: ReadonlyMap<number, string | null>, opts: { minScore?: number; productVersionId: string | null }): EvidenceLink[]`

`normalizeRrf` lives here because it is the same concern: turning a raw retrieval number into a
score a threshold can be compared against. `ProvenanceRow.score` is always already normalised —
callers normalise on the way in, which is what Task 7 does.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/posture/bind-evidence.test.ts`:

```ts
// tests/unit/posture/bind-evidence.test.ts
// Provenance rows become evidence links only if they clear the score floor and
// their document type grants a role.

import { describe, it, expect } from 'vitest';
import {
  buildEvidenceLinks,
  normalizeRrf,
  MIN_EVIDENCE_SCORE,
  RRF_CEILING,
} from '@/lib/posture/bind-evidence';
import type { ProvenanceRow } from '@/lib/posture/types';

describe('normalizeRrf', () => {
  it('maps zero to zero', () => {
    expect(normalizeRrf(0)).toBe(0);
  });

  it('maps the RRF ceiling to one', () => {
    expect(normalizeRrf(RRF_CEILING)).toBe(1);
  });

  it('maps the midpoint to a half', () => {
    expect(normalizeRrf(RRF_CEILING / 2)).toBeCloseTo(0.5, 5);
  });

  it('clamps above the ceiling rather than exceeding one', () => {
    expect(normalizeRrf(RRF_CEILING * 3)).toBe(1);
  });

  it('clamps negatives to zero', () => {
    expect(normalizeRrf(-1)).toBe(0);
  });

  it('lifts a typical strong RRF score above the evidence floor', () => {
    // local-engine.ts:29 treated 0.025 as strong evidence.
    expect(normalizeRrf(0.025)).toBeGreaterThan(MIN_EVIDENCE_SCORE);
  });

  it('keeps a weak RRF score below the evidence floor', () => {
    expect(normalizeRrf(0.005)).toBeLessThan(MIN_EVIDENCE_SCORE);
  });
});

function prov(over: Partial<ProvenanceRow> = {}): ProvenanceRow {
  return {
    documentId: 1,
    chunkId: 100,
    scfControlCode: 'GOV-01',
    method: 'vector',
    score: 0.9,
    snippet: 'text',
    justification: null,
    ...over,
  };
}

const docTypes = new Map<number, string | null>([
  [1, 'POLICY'],
  [2, 'TEST_REPORT'],
  [3, 'UNCLASSIFIED'],
  [4, null],
]);

describe('buildEvidenceLinks', () => {
  it('turns a qualifying policy row into a policy link', () => {
    const links = buildEvidenceLinks([prov()], docTypes, { productVersionId: null });
    expect(links).toHaveLength(1);
    expect(links[0].role).toBe('policy');
    expect(links[0].chunkId).toBe(100);
    expect(links[0].productVersionId).toBeNull();
  });

  it('turns a qualifying test report into an operational link', () => {
    const links = buildEvidenceLinks(
      [prov({ documentId: 2, chunkId: 200 })],
      docTypes,
      { productVersionId: null },
    );
    expect(links[0].role).toBe('operational');
  });

  it('drops rows below the score floor', () => {
    const links = buildEvidenceLinks(
      [prov({ score: MIN_EVIDENCE_SCORE - 0.01 })],
      docTypes,
      { productVersionId: null },
    );
    expect(links).toEqual([]);
  });

  it('keeps a row exactly at the score floor', () => {
    const links = buildEvidenceLinks(
      [prov({ score: MIN_EVIDENCE_SCORE })],
      docTypes,
      { productVersionId: null },
    );
    expect(links).toHaveLength(1);
  });

  it('drops UNCLASSIFIED documents entirely', () => {
    const links = buildEvidenceLinks(
      [prov({ documentId: 3, chunkId: 300 })],
      docTypes,
      { productVersionId: null },
    );
    expect(links).toEqual([]);
  });

  it('drops documents with a null doc_type', () => {
    const links = buildEvidenceLinks(
      [prov({ documentId: 4, chunkId: 400 })],
      docTypes,
      { productVersionId: null },
    );
    expect(links).toEqual([]);
  });

  it('drops rows whose document is absent from the type map', () => {
    const links = buildEvidenceLinks(
      [prov({ documentId: 99, chunkId: 900 })],
      docTypes,
      { productVersionId: null },
    );
    expect(links).toEqual([]);
  });

  it('deduplicates the same chunk claimed twice for one control', () => {
    const links = buildEvidenceLinks(
      [prov({ score: 0.7 }), prov({ score: 0.95 })],
      docTypes,
      { productVersionId: null },
    );
    expect(links).toHaveLength(1);
    expect(links[0].score).toBe(0.95); // the stronger claim wins
  });

  it('keeps the same chunk for two different controls', () => {
    const links = buildEvidenceLinks(
      [prov({ scfControlCode: 'GOV-01' }), prov({ scfControlCode: 'GOV-02' })],
      docTypes,
      { productVersionId: null },
    );
    expect(links).toHaveLength(2);
  });

  it('stamps the product version onto every link', () => {
    const links = buildEvidenceLinks([prov()], docTypes, {
      productVersionId: '11111111-1111-1111-1111-111111111111',
    });
    expect(links[0].productVersionId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('never emits a chunk in two roles for one control', () => {
    const links = buildEvidenceLinks(
      [prov(), prov({ scfControlCode: 'GOV-01' })],
      docTypes,
      { productVersionId: null },
    );
    const seen = new Set(links.map((l) => `${l.scfControlCode}:${l.chunkId}`));
    expect(seen.size).toBe(links.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/posture/bind-evidence.test.ts`
Expected: FAIL — cannot resolve `@/lib/posture/bind-evidence`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/posture/bind-evidence.ts`:

```ts
// src/lib/posture/bind-evidence.ts
// Provenance says "this chunk is about this control". Binding decides whether
// that claim is strong enough to count, and in which role.
//
// The role comes from the document type, which is a function — so a chunk
// cannot be emitted in two roles for the same control. That is the structural
// fix for the old engine, where the two phases were two fields on one object
// and the second could be assigned a copy of the first.

import { roleForDocType } from './evidence-role';
import type { EvidenceLink, ProvenanceRow } from './types';

/**
 * Upper bound of the reciprocal-rank-fusion score returned by
 * match_documents_hybrid, which aliases `combined_score` as `similarity`
 * (see supabase/migrations/20260701000002_add_clarity_to_rpc.sql:104).
 * It is NOT a cosine similarity — see local-engine.ts:27-29.
 */
export const RRF_CEILING = 0.033;

/**
 * Minimum normalised relevance for a chunk to count as evidence. At the
 * ceiling above, 0.65 corresponds to a raw RRF of ~0.0215 — just under the
 * 0.025 the previous engine treated as strong evidence.
 */
export const MIN_EVIDENCE_SCORE = 0.65;

/** Maps a raw RRF score onto 0..1 so thresholds mean what they look like. */
export function normalizeRrf(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(1, raw / RRF_CEILING);
}

export function buildEvidenceLinks(
  provenance: readonly ProvenanceRow[],
  docTypeByDocumentId: ReadonlyMap<number, string | null>,
  opts: { minScore?: number; productVersionId: string | null },
): EvidenceLink[] {
  const minScore = opts.minScore ?? MIN_EVIDENCE_SCORE;
  // Keyed by control + chunk, so one chunk holds at most one role per control.
  const best = new Map<string, EvidenceLink>();

  for (const row of provenance) {
    if (row.score < minScore) continue;

    // A document absent from the map is unknown, not assumed. Fail closed.
    if (!docTypeByDocumentId.has(row.documentId)) continue;

    const role = roleForDocType(docTypeByDocumentId.get(row.documentId));
    if (role === null) continue;

    const key = `${row.scfControlCode}:${row.chunkId}`;
    const existing = best.get(key);
    if (existing && existing.score >= row.score) continue;

    best.set(key, {
      scfControlCode: row.scfControlCode,
      productVersionId: opts.productVersionId,
      chunkId: row.chunkId,
      documentId: row.documentId,
      role,
      score: row.score,
      snippet: row.snippet,
    });
  }

  return [...best.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/posture/bind-evidence.test.ts`
Expected: PASS — 18 tests (7 for `normalizeRrf`, 11 for `buildEvidenceLinks`).

- [ ] **Step 5: Run the whole posture suite**

Run: `npx vitest run tests/unit/posture`
Expected: PASS — 35 tests across three files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/posture/bind-evidence.ts tests/unit/posture/bind-evidence.test.ts
git commit -m "feat(posture): bind provenance to evidence with a single role per chunk"
```

---

### Task 4: The migration

**Files:**
- Create: `supabase/migrations/20260820000001_posture_core.sql`
- Test: `tests/unit/posture/migration-invariants.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: tables `control_inventory`, `evidence_provenance`, `control_evidence`.

The test asserts the invariants the spec requires are actually written into the DDL. It reads the
SQL as text, so it runs without a database.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/posture/migration-invariants.test.ts`:

```ts
// tests/unit/posture/migration-invariants.test.ts
// The spec's structural guarantees must live in the DDL, not in convention.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260820000001_posture_core.sql'),
  'utf8',
).toLowerCase();

describe('posture_core migration', () => {
  it('creates the three tables', () => {
    expect(sql).toContain('create table if not exists public.control_inventory');
    expect(sql).toContain('create table if not exists public.evidence_provenance');
    expect(sql).toContain('create table if not exists public.control_evidence');
  });

  it('constrains the evidence role to the two allowed values', () => {
    expect(sql).toMatch(/role\s+text\s+not null[\s\S]{0,80}check[\s\S]{0,40}'policy'[\s\S]{0,20}'operational'/);
  });

  it('makes one chunk-role pair unique per control and version', () => {
    expect(sql).toMatch(/unique\s*\(\s*scf_control_code\s*,\s*product_version_id\s*,\s*chunk_id\s*,\s*role\s*\)/);
  });

  it('makes a provenance claim unique per chunk and control', () => {
    expect(sql).toMatch(/unique\s*\(\s*chunk_id\s*,\s*scf_control_code\s*\)/);
  });

  it('constrains implementation_state to the four allowed values', () => {
    expect(sql).toMatch(/implementation_state[\s\S]{0,120}'not_applicable'/);
  });

  it('constrains the provenance method', () => {
    expect(sql).toMatch(/method[\s\S]{0,80}'vector'[\s\S]{0,30}'llm_confirmed'/);
  });

  it('enables row level security on all three tables', () => {
    const matches = sql.match(/enable row level security/g) ?? [];
    expect(matches.length).toBe(3);
  });

  it('enforces one role per chunk in both the null and non-null version cases', () => {
    // Two partial indexes, because a plain unique index over a nullable column
    // enforces nothing when that column is null — which is every backfilled row.
    expect(sql).toMatch(
      /unique index[\s\S]{0,80}control_evidence_one_role_per_chunk_global[\s\S]{0,120}where\s+product_version_id\s+is\s+null/,
    );
    expect(sql).toMatch(
      /unique index[\s\S]{0,80}control_evidence_one_role_per_chunk_versioned[\s\S]{0,140}where\s+product_version_id\s+is\s+not\s+null/,
    );
  });

  it('does not declare a verdict column anywhere — the verdict is derived', () => {
    // Matches a column declaration at the start of a line, so the DDL comments
    // are free to use the word.
    expect(sql).not.toMatch(/^\s*verdict\s+\w/m);
    expect(sql).not.toMatch(/^\s*combined_status\s+\w/m);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/posture/migration-invariants.test.ts`
Expected: FAIL — ENOENT, the migration file does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260820000001_posture_core.sql`:

```sql
-- 20260820000001_posture_core.sql
-- Trustworthy posture: our own control inventory, the document->control
-- provenance chain, and role-separated evidence.
--
-- There is deliberately NO verdict column. The verdict is derived by
-- src/lib/posture/verdict.ts from the rows in control_evidence, so it can
-- never drift from the evidence that justifies it.

-- ── Our own controls, independent of any framework ──────────────────────────
create table if not exists public.control_inventory (
  id                   uuid primary key default gen_random_uuid(),
  scf_control_code     varchar not null,
  product_version_id   uuid references public.product_versions(id) on delete cascade,
  implementation_state text not null default 'planned'
    check (implementation_state in ('implemented', 'partial', 'planned', 'not_applicable')),
  statement            text,
  owner                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (scf_control_code, product_version_id)
);

comment on table public.control_inventory is
  'What Ionic implements, per product version. Framework-independent: frameworks are applied as masks over this, never baked into it.';

-- ── What a chunk is about, and how we know ──────────────────────────────────
create table if not exists public.evidence_provenance (
  id               bigserial primary key,
  document_id      bigint not null references public.compliance_documents(id) on delete cascade,
  chunk_id         bigint not null references public.document_chunks(id) on delete cascade,
  scf_control_code varchar not null,
  method           text not null check (method in ('vector', 'llm_confirmed')),
  score            numeric(5,4) not null check (score >= 0 and score <= 1),
  snippet          text not null,
  justification    text,
  created_at       timestamptz not null default now(),
  unique (chunk_id, scf_control_code)
);

comment on table public.evidence_provenance is
  'The audit trail: document -> chunk -> SCF control, with the method and justification that produced the claim.';

-- ── What counts as evidence, and in which role ──────────────────────────────
create table if not exists public.control_evidence (
  id                 bigserial primary key,
  scf_control_code   varchar not null,
  product_version_id uuid references public.product_versions(id) on delete cascade,
  chunk_id           bigint not null references public.document_chunks(id) on delete cascade,
  document_id        bigint not null references public.compliance_documents(id) on delete cascade,
  role               text not null check (role in ('policy', 'operational')),
  score              numeric(5,4) not null check (score >= 0 and score <= 1),
  snippet            text not null,
  created_at         timestamptz not null default now(),
  unique (scf_control_code, product_version_id, chunk_id, role)
);

comment on table public.control_evidence is
  'Evidence accepted for a control, separated by role. The role is a function of the document type, so a policy can never be counted as operational evidence.';

-- A chunk may serve only one role for a given control and version. The unique
-- constraint above includes `role`, so on its own it permits both.
--
-- Two PARTIAL indexes, not one plain index: Postgres treats NULLs as distinct
-- in a unique index by default, and product_version_id is NULL for every row
-- the backfill writes — so a single index over the three columns would enforce
-- nothing at all in exactly the path that matters. Splitting on the null
-- predicate covers both cases without depending on PG15's NULLS NOT DISTINCT.
create unique index if not exists control_evidence_one_role_per_chunk_global
  on public.control_evidence (scf_control_code, chunk_id)
  where product_version_id is null;

create unique index if not exists control_evidence_one_role_per_chunk_versioned
  on public.control_evidence (scf_control_code, product_version_id, chunk_id)
  where product_version_id is not null;

create index if not exists control_inventory_version_idx
  on public.control_inventory (product_version_id);
create index if not exists evidence_provenance_control_idx
  on public.evidence_provenance (scf_control_code);
create index if not exists evidence_provenance_document_idx
  on public.evidence_provenance (document_id);
create index if not exists control_evidence_lookup_idx
  on public.control_evidence (scf_control_code, product_version_id, role);

-- ── Updated-at trigger, reusing the existing helper ─────────────────────────
drop trigger if exists set_control_inventory_updated_at on public.control_inventory;
create trigger set_control_inventory_updated_at
  before update on public.control_inventory
  for each row execute function public.set_updated_at();

-- ── RLS: internal roles read; only service_role writes ──────────────────────
alter table public.control_inventory   enable row level security;
alter table public.evidence_provenance enable row level security;
alter table public.control_evidence    enable row level security;

-- One EXECUTE per statement: PL/pgSQL's EXECUTE runs a single command, and
-- packing several into one string is unreliable.
do $$
declare t text;
begin
  foreach t in array array['control_inventory', 'evidence_provenance', 'control_evidence']
  loop
    execute format('drop policy if exists %1$s_select_internal on public.%1$s', t);
    execute format($f$
      create policy %1$s_select_internal on public.%1$s
        for select using (
          auth.role() = 'service_role'
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role in ('admin', 'ionic_user')
          )
        )
    $f$, t);
    execute format('drop policy if exists %1$s_write_service on public.%1$s', t);
    execute format($f$
      create policy %1$s_write_service on public.%1$s
        for all using (auth.role() = 'service_role')
        with check (auth.role() = 'service_role')
    $f$, t);
  end loop;
end $$;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/posture/migration-invariants.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Apply the migration**

Apply through whichever path this project uses — the Supabase SQL editor, or `npx supabase db push` if the CLI is linked. Then verify the tables exist by running, in the SQL editor:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('control_inventory', 'evidence_provenance', 'control_evidence')
order by table_name;
```

Expected: three rows.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260820000001_posture_core.sql tests/unit/posture/migration-invariants.test.ts
git commit -m "feat(posture): add control inventory, provenance and role-separated evidence"
```

---

### Task 5: Persistence

**Files:**
- Create: `src/lib/posture/persistence.ts`
- Test: `tests/unit/posture/persistence.test.ts`

**Interfaces:**
- Consumes: `EvidenceLink`, `ProvenanceRow` from `@/lib/posture/types` (Task 1).
- Produces:
  - `PERSIST_BATCH_SIZE: 200`
  - `toProvenanceRecords(rows: readonly ProvenanceRow[]): Array<Record<string, unknown>>`
  - `toEvidenceRecords(links: readonly EvidenceLink[]): Array<Record<string, unknown>>`
  - `persistProvenance(client: PostgrestLike, rows: readonly ProvenanceRow[]): Promise<number>`
  - `replaceEvidenceForScope(client: PostgrestLike, productVersionId: string | null, links: readonly EvidenceLink[]): Promise<number>`
  - `interface PostgrestLike` — see the code below; needs `upsert`, `insert`, and a `delete().eq()/.is()` chain.

**Why evidence is replaced rather than upserted.** Provenance upserts safely: its unique
key `(chunk_id, scf_control_code)` has no nullable column. Evidence cannot. Every row the
backfill writes has `product_version_id` NULL, and Postgres treats NULLs as distinct in a
conflict target, so `ON CONFLICT (scf_control_code, product_version_id, chunk_id, role)`
would never match an existing row — a second backfill run would insert duplicates rather
than update. Deleting the scope's rows and inserting fresh is idempotent by construction
and needs no conflict target at all.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/posture/persistence.test.ts`:

```ts
// tests/unit/posture/persistence.test.ts
// Row shaping is pure and tested directly; the writers are tested against a
// fake client so no database is needed.

import { describe, it, expect, vi } from 'vitest';
import {
  toProvenanceRecords,
  toEvidenceRecords,
  persistProvenance,
  replaceEvidenceForScope,
  PERSIST_BATCH_SIZE,
} from '@/lib/posture/persistence';
import type { EvidenceLink, ProvenanceRow } from '@/lib/posture/types';

function prov(i: number): ProvenanceRow {
  return {
    documentId: 1,
    chunkId: i,
    scfControlCode: 'GOV-01',
    method: 'vector',
    score: 0.9,
    snippet: 's',
    justification: null,
  };
}

function link(i: number): EvidenceLink {
  return {
    scfControlCode: 'GOV-01',
    productVersionId: null,
    chunkId: i,
    documentId: 1,
    role: 'policy',
    score: 0.9,
    snippet: 's',
  };
}

function fakeClient() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const is = vi.fn().mockResolvedValue({ error: null });
  const eq = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn(() => ({ is, eq }));
  const client = { from: vi.fn(() => ({ upsert, insert, delete: del })) };
  return { client, upsert, insert, del, is, eq };
}

describe('toProvenanceRecords', () => {
  it('maps camelCase fields onto snake_case columns', () => {
    expect(toProvenanceRecords([prov(7)])[0]).toEqual({
      document_id: 1,
      chunk_id: 7,
      scf_control_code: 'GOV-01',
      method: 'vector',
      score: 0.9,
      snippet: 's',
      justification: null,
    });
  });
});

describe('toEvidenceRecords', () => {
  it('maps camelCase fields onto snake_case columns', () => {
    expect(toEvidenceRecords([link(7)])[0]).toEqual({
      scf_control_code: 'GOV-01',
      product_version_id: null,
      chunk_id: 7,
      document_id: 1,
      role: 'policy',
      score: 0.9,
      snippet: 's',
    });
  });
});

describe('persistProvenance', () => {
  it('writes nothing and returns zero for an empty input', async () => {
    const { client, upsert } = fakeClient();
    await expect(persistProvenance(client, [])).resolves.toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('upserts on the provenance conflict target', async () => {
    const { client, upsert } = fakeClient();
    await persistProvenance(client, [prov(1)]);
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), {
      onConflict: 'chunk_id,scf_control_code',
    });
  });

  it('splits input into batches and returns the total written', async () => {
    const { client, upsert } = fakeClient();
    const rows = Array.from({ length: PERSIST_BATCH_SIZE + 5 }, (_, i) => prov(i));
    await expect(persistProvenance(client, rows)).resolves.toBe(PERSIST_BATCH_SIZE + 5);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('throws with the database message when a batch fails', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
    const client = { from: vi.fn(() => ({ upsert })) };
    await expect(persistProvenance(client, [prov(1)])).rejects.toThrow('boom');
  });
});

describe('replaceEvidenceForScope', () => {
  it('deletes the null-version scope with .is() before inserting', async () => {
    const { client, del, is, insert } = fakeClient();
    await replaceEvidenceForScope(client, null, [link(1)]);
    expect(del).toHaveBeenCalled();
    expect(is).toHaveBeenCalledWith('product_version_id', null);
    expect(insert).toHaveBeenCalled();
  });

  it('deletes a versioned scope with .eq() before inserting', async () => {
    const { client, eq, insert } = fakeClient();
    await replaceEvidenceForScope(client, 'ver-1', [link(1)]);
    expect(eq).toHaveBeenCalledWith('product_version_id', 'ver-1');
    expect(insert).toHaveBeenCalled();
  });

  it('clears the scope even when there is nothing to insert', async () => {
    const { client, del, insert } = fakeClient();
    await expect(replaceEvidenceForScope(client, null, [])).resolves.toBe(0);
    expect(del).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('batches inserts and returns the total written', async () => {
    const { client, insert } = fakeClient();
    const links = Array.from({ length: PERSIST_BATCH_SIZE + 3 }, (_, i) => link(i));
    await expect(replaceEvidenceForScope(client, null, links)).resolves.toBe(
      PERSIST_BATCH_SIZE + 3,
    );
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('throws with the database message when the delete fails', async () => {
    const is = vi.fn().mockResolvedValue({ error: { message: 'delete boom' } });
    const client = {
      from: vi.fn(() => ({ delete: vi.fn(() => ({ is, eq: vi.fn() })), insert: vi.fn(), upsert: vi.fn() })),
    };
    await expect(replaceEvidenceForScope(client, null, [link(1)])).rejects.toThrow('delete boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/posture/persistence.test.ts`
Expected: FAIL — cannot resolve `@/lib/posture/persistence`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/posture/persistence.ts`:

```ts
// src/lib/posture/persistence.ts
// The only file in the posture module that writes. Row shaping is exported
// separately so it can be tested without a client.

import type { EvidenceLink, ProvenanceRow } from './types';

export const PERSIST_BATCH_SIZE = 200;

type WriteResult = Promise<{ error: { message: string } | null }>;

/** The narrow slice of a Supabase client this module needs. */
export interface PostgrestLike {
  from(table: string): {
    upsert(values: unknown[], opts?: { onConflict?: string }): WriteResult;
    insert(values: unknown[]): WriteResult;
    delete(): {
      eq(column: string, value: string): WriteResult;
      is(column: string, value: null): WriteResult;
    };
  };
}

export function toProvenanceRecords(
  rows: readonly ProvenanceRow[],
): Array<Record<string, unknown>> {
  return rows.map((r) => ({
    document_id: r.documentId,
    chunk_id: r.chunkId,
    scf_control_code: r.scfControlCode,
    method: r.method,
    score: r.score,
    snippet: r.snippet,
    justification: r.justification,
  }));
}

export function toEvidenceRecords(
  links: readonly EvidenceLink[],
): Array<Record<string, unknown>> {
  return links.map((l) => ({
    scf_control_code: l.scfControlCode,
    product_version_id: l.productVersionId,
    chunk_id: l.chunkId,
    document_id: l.documentId,
    role: l.role,
    score: l.score,
    snippet: l.snippet,
  }));
}

async function upsertInBatches(
  client: PostgrestLike,
  table: string,
  records: Array<Record<string, unknown>>,
  onConflict: string,
): Promise<number> {
  let written = 0;
  for (let i = 0; i < records.length; i += PERSIST_BATCH_SIZE) {
    const batch = records.slice(i, i + PERSIST_BATCH_SIZE);
    const { error } = await client.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(error.message);
    written += batch.length;
  }
  return written;
}

export function persistProvenance(
  client: PostgrestLike,
  rows: readonly ProvenanceRow[],
): Promise<number> {
  return upsertInBatches(
    client,
    'evidence_provenance',
    toProvenanceRecords(rows),
    'chunk_id,scf_control_code',
  );
}

/**
 * Replaces all evidence for one scope: delete, then insert.
 *
 * Not an upsert. Every backfilled row has a NULL product_version_id, and
 * Postgres treats NULLs as distinct in a conflict target — so ON CONFLICT
 * would never match an existing row and a re-run would duplicate instead of
 * update. Delete-then-insert is idempotent without a conflict target, and it
 * also lets a chunk's role change between runs (which a role-keyed upsert
 * could not express).
 */
export async function replaceEvidenceForScope(
  client: PostgrestLike,
  productVersionId: string | null,
  links: readonly EvidenceLink[],
): Promise<number> {
  const scope = client.from('control_evidence').delete();
  const { error: deleteError } =
    productVersionId === null
      ? await scope.is('product_version_id', null)
      : await scope.eq('product_version_id', productVersionId);
  if (deleteError) throw new Error(deleteError.message);

  const records = toEvidenceRecords(links);
  let written = 0;
  for (let i = 0; i < records.length; i += PERSIST_BATCH_SIZE) {
    const batch = records.slice(i, i + PERSIST_BATCH_SIZE);
    const { error } = await client.from('control_evidence').insert(batch);
    if (error) throw new Error(error.message);
    written += batch.length;
  }
  return written;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/posture/persistence.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/posture/persistence.ts tests/unit/posture/persistence.test.ts
git commit -m "feat(posture): batch-upsert provenance and evidence"
```

---

### Task 6: Posture read

**Files:**
- Create: `src/lib/posture/read.ts`
- Test: `tests/unit/posture/read.test.ts`

**Interfaces:**
- Consumes: `deriveVerdict`, `verdictConfidence` from `@/lib/posture/verdict` (Task 1); `EvidenceLink`, `Verdict` from `@/lib/posture/types` (Task 1).
- Produces:
  - `interface ControlPosture { scfControlCode: string; verdict: Verdict; confidence: number; policy: EvidenceLink[]; operational: EvidenceLink[] }`
  - `rowsToLinks(rows: readonly Record<string, unknown>[]): EvidenceLink[]`
  - `groupPosture(controlCodes: readonly string[], links: readonly EvidenceLink[]): ControlPosture[]`
  - `summarise(postures: readonly ControlPosture[]): Record<Verdict, number>`

`groupPosture` takes the full control list so a control with no evidence still appears, as `gap`.
This is the guarantee that silence never reads as an answer.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/posture/read.test.ts`:

```ts
// tests/unit/posture/read.test.ts
// Grouping evidence into per-control posture. A control with no evidence must
// still appear, as a gap — silence must never read as an answer.

import { describe, it, expect } from 'vitest';
import { rowsToLinks, groupPosture, summarise } from '@/lib/posture/read';
import type { EvidenceLink } from '@/lib/posture/types';

function link(code: string, role: EvidenceLink['role'], chunkId: number, score = 0.9): EvidenceLink {
  return {
    scfControlCode: code,
    productVersionId: null,
    chunkId,
    documentId: 1,
    role,
    score,
    snippet: 's',
  };
}

describe('rowsToLinks', () => {
  it('maps database rows into links, coercing numerics', () => {
    const links = rowsToLinks([
      {
        scf_control_code: 'GOV-01',
        product_version_id: null,
        chunk_id: 5,
        document_id: 2,
        role: 'policy',
        score: '0.8700',
        snippet: 'text',
      },
    ]);
    expect(links).toEqual([
      {
        scfControlCode: 'GOV-01',
        productVersionId: null,
        chunkId: 5,
        documentId: 2,
        role: 'policy',
        score: 0.87,
        snippet: 'text',
      },
    ]);
  });
});

describe('groupPosture', () => {
  it('reports a control with both roles as conforming', () => {
    const out = groupPosture(['GOV-01'], [link('GOV-01', 'policy', 1), link('GOV-01', 'operational', 2)]);
    expect(out[0].verdict).toBe('conforming');
    expect(out[0].policy).toHaveLength(1);
    expect(out[0].operational).toHaveLength(1);
  });

  it('reports a control with no evidence as a gap rather than omitting it', () => {
    const out = groupPosture(['GOV-01', 'GOV-02'], [link('GOV-01', 'policy', 1)]);
    expect(out).toHaveLength(2);
    const gov02 = out.find((p) => p.scfControlCode === 'GOV-02')!;
    expect(gov02.verdict).toBe('gap');
    expect(gov02.confidence).toBe(0);
    expect(gov02.policy).toEqual([]);
  });

  it('ignores evidence for a control outside the requested list', () => {
    const out = groupPosture(['GOV-01'], [link('GOV-99', 'policy', 1)]);
    expect(out).toHaveLength(1);
    expect(out[0].verdict).toBe('gap');
  });

  it('sorts evidence within a role by descending score', () => {
    const out = groupPosture(
      ['GOV-01'],
      [link('GOV-01', 'policy', 1, 0.7), link('GOV-01', 'policy', 2, 0.95)],
    );
    expect(out[0].policy.map((l) => l.chunkId)).toEqual([2, 1]);
  });
});

describe('summarise', () => {
  it('counts every verdict state, including those with no members', () => {
    const postures = groupPosture(
      ['A', 'B', 'C'],
      [link('A', 'policy', 1), link('B', 'policy', 2), link('B', 'operational', 3)],
    );
    expect(summarise(postures)).toEqual({
      conforming: 1,
      partial: 1,
      informal: 0,
      gap: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/posture/read.test.ts`
Expected: FAIL — cannot resolve `@/lib/posture/read`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/posture/read.ts`:

```ts
// src/lib/posture/read.ts
// Turns evidence rows into per-control posture. Pure: the caller fetches the
// rows and the control list, this file decides what they mean.

import { deriveVerdict, verdictConfidence } from './verdict';
import type { EvidenceLink, Verdict } from './types';

export interface ControlPosture {
  scfControlCode: string;
  verdict: Verdict;
  confidence: number;
  policy: EvidenceLink[];
  operational: EvidenceLink[];
}

export function rowsToLinks(rows: readonly Record<string, unknown>[]): EvidenceLink[] {
  return rows.map((r) => ({
    scfControlCode: String(r.scf_control_code),
    productVersionId: r.product_version_id == null ? null : String(r.product_version_id),
    chunkId: Number(r.chunk_id),
    documentId: Number(r.document_id),
    role: r.role === 'operational' ? 'operational' : 'policy',
    score: Number(r.score),
    snippet: String(r.snippet ?? ''),
  }));
}

/**
 * Every requested control gets a row. A control with no evidence is reported
 * as `gap`, never omitted — an absent control must not read as a pass.
 */
export function groupPosture(
  controlCodes: readonly string[],
  links: readonly EvidenceLink[],
): ControlPosture[] {
  const byControl = new Map<string, EvidenceLink[]>();
  for (const code of controlCodes) byControl.set(code, []);
  for (const l of links) {
    const bucket = byControl.get(l.scfControlCode);
    if (bucket) bucket.push(l);
  }

  const byScoreDesc = (a: EvidenceLink, b: EvidenceLink) => b.score - a.score;

  return controlCodes.map((code) => {
    const own = byControl.get(code) ?? [];
    return {
      scfControlCode: code,
      verdict: deriveVerdict(own),
      confidence: verdictConfidence(own),
      policy: own.filter((l) => l.role === 'policy').sort(byScoreDesc),
      operational: own.filter((l) => l.role === 'operational').sort(byScoreDesc),
    };
  });
}

export function summarise(postures: readonly ControlPosture[]): Record<Verdict, number> {
  const out: Record<Verdict, number> = { conforming: 0, partial: 0, informal: 0, gap: 0 };
  for (const p of postures) out[p.verdict] += 1;
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/posture/read.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Run the full posture suite**

Run: `npx vitest run tests/unit/posture`
Expected: PASS — 61 tests across six files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/posture/read.ts tests/unit/posture/read.test.ts
git commit -m "feat(posture): group evidence into per-control posture"
```

---

### Task 7: Backfill over the existing corpus

**Files:**
- Create: `src/scripts/backfill-posture.ts`
- Modify: `package.json` — add the `backfill:posture` script

**Interfaces:**
- Consumes: `buildEvidenceLinks` and `normalizeRrf` (Task 3), `persistProvenance` / `replaceEvidenceForScope` (Task 5), `groupPosture` / `summarise` (Task 6), `createAdminClient`, `generateEmbeddings`.
- Produces: a printed verdict distribution. No new exports.

This task has no unit test — it is a one-shot operator script whose logic lives entirely in the
already-tested pure modules. Its verification is the run itself, which must satisfy spec success
criterion 5: **more than one verdict state present**.

Two conventions matter here, both taken from `src/scripts/bulk-reindex.ts`: scripts open with
`import 'dotenv/config'`, and they use **relative** imports rather than the `@/` alias, because they
run outside Next's bundler.

- [ ] **Step 1: Install the TypeScript runner**

`tsx` is not currently in `node_modules`, and there is no existing npm script that runs the files in
`src/scripts/`. Add it:

```bash
npm install --save-dev tsx
```

Verify: `npx tsx --version` prints a version.

- [ ] **Step 2: Write the script**

Create `src/scripts/backfill-posture.ts`:

```ts
// src/scripts/backfill-posture.ts
// One-shot: rebuild provenance and evidence for the existing corpus, then
// print the verdict distribution.
//
// Run with:  npm run backfill:posture
// Add --commit to write; without it the script only reports.

import 'dotenv/config';
import { createAdminClient } from '../lib/supabase/admin';
import { generateEmbeddings } from '../lib/chat/embeddings';
import { buildEvidenceLinks, normalizeRrf } from '../lib/posture/bind-evidence';
import { persistProvenance, replaceEvidenceForScope } from '../lib/posture/persistence';
import { groupPosture, summarise } from '../lib/posture/read';
import type { ProvenanceRow } from '../lib/posture/types';

const COMMIT = process.argv.includes('--commit');
const MATCH_THRESHOLD = 0.2;
const MATCH_COUNT = 8;

async function main() {
  const db = createAdminClient();

  // 1. The control set we are reporting on.
  const { data: controls, error: controlsError } = await db
    .from('scf_controls')
    .select('control_code, control_name, description')
    .order('control_code');
  if (controlsError) throw new Error(`scf_controls: ${controlsError.message}`);
  const controlList = controls ?? [];
  console.log(`controls: ${controlList.length}`);

  // 2. doc_type per document, so evidence roles can be resolved.
  const docTypes = new Map<number, string | null>();
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from('compliance_documents')
      .select('id, doc_type')
      .range(from, from + 999);
    if (error) throw new Error(`compliance_documents: ${error.message}`);
    for (const d of data ?? []) docTypes.set(Number(d.id), d.doc_type ?? null);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  console.log(`documents: ${docTypes.size}`);

  const unclassified = [...docTypes.values()].filter(
    (t) => !t || t.toUpperCase() === 'UNCLASSIFIED',
  ).length;
  console.log(`documents that can hold no evidence (UNCLASSIFIED or null): ${unclassified}`);

  // 3. Retrieve per control and record provenance.
  const provenance: ProvenanceRow[] = [];
  const BATCH = 20;
  for (let i = 0; i < controlList.length; i += BATCH) {
    const batch = controlList.slice(i, i + BATCH);
    const embeddings = await generateEmbeddings(
      batch.map((c) => `${c.control_name}. ${c.description ?? ''}`),
    );

    for (let j = 0; j < batch.length; j++) {
      const control = batch[j];
      const { data, error } = await db.rpc('match_documents_hybrid', {
        query_text: `${control.control_name}. ${control.description ?? ''}`,
        query_embedding: embeddings[j],
        match_threshold: MATCH_THRESHOLD,
        match_count: MATCH_COUNT,
        filter_framework: null,
        filter_version_id: null,
        filter_categories: null,
      } as never);
      if (error) {
        console.warn(`  ${control.control_code}: retrieval failed — ${error.message}`);
        continue;
      }

      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        provenance.push({
          documentId: Number(row.document_id),
          chunkId: Number(row.id),
          scfControlCode: control.control_code,
          method: 'vector',
          // The RPC's `similarity` column is the RRF combined_score (~0..0.033),
          // NOT a cosine. Normalise before it meets any threshold, or every
          // control lands in `gap`.
          score: normalizeRrf(Number(row.similarity ?? 0)),
          snippet: String(row.content ?? '').slice(0, 300),
          justification: null,
        });
      }
    }
    console.log(`retrieved ${Math.min(i + BATCH, controlList.length)}/${controlList.length}`);
  }
  console.log(`provenance claims: ${provenance.length}`);

  // 4. Bind to evidence, then report.
  const links = buildEvidenceLinks(provenance, docTypes, { productVersionId: null });
  console.log(`evidence links: ${links.length}`);
  console.log(`  policy:      ${links.filter((l) => l.role === 'policy').length}`);
  console.log(`  operational: ${links.filter((l) => l.role === 'operational').length}`);

  const postures = groupPosture(
    controlList.map((c) => c.control_code),
    links,
  );
  const summary = summarise(postures);
  console.log('\nverdict distribution:');
  for (const [state, count] of Object.entries(summary)) {
    console.log(`  ${state.padEnd(11)}${count}`);
  }

  const states = Object.values(summary).filter((n) => n > 0).length;
  console.log(`\ndistinct verdict states present: ${states}`);
  if (states < 2) {
    console.error('FAIL: expected more than one verdict state (spec success criterion 5).');
    process.exitCode = 1;
  }

  if (!COMMIT) {
    console.log('\nreport only — pass --commit to write.');
    return;
  }
  console.log(`\nprovenance written: ${await persistProvenance(db, provenance)}`);
  // Replaces the whole null-version scope, so re-runs are idempotent.
  console.log(`evidence written:   ${await replaceEvidenceForScope(db, null, links)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Add the npm script**

In `package.json`, inside `"scripts"`, after the `"test:e2e"` entry:

```json
    "backfill:posture": "tsx src/scripts/backfill-posture.ts"
```

- [ ] **Step 4: Run in report-only mode**

Run: `npm run backfill:posture`

Expected: it prints control and document counts, the count of documents that can hold no evidence,
the policy and operational link counts, and a verdict distribution with **at least two** non-zero
states. If every control still lands in one state, stop and investigate before writing — that would
mean the role classifier is not separating the corpus.

- [ ] **Step 5: Run for real**

Run: `npm run backfill:posture -- --commit`

Then verify in the SQL editor:

```sql
select role, count(*) from public.control_evidence group by role order by role;
select count(*) from public.evidence_provenance;
```

Expected: both roles present in `control_evidence`; `evidence_provenance` non-zero.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/backfill-posture.ts package.json package-lock.json
git commit -m "feat(posture): backfill provenance and evidence over the existing corpus"
```

---

### Task 8: Read API

**Files:**
- Create: `src/app/api/posture/route.ts`
- Test: `tests/unit/posture/route-contract.test.ts`

**Interfaces:**
- Consumes: `rowsToLinks`, `groupPosture`, `summarise` (Task 6); `createClient` from `@/lib/supabase/server`; `createAdminClient` from `@/lib/supabase/admin`.
- Produces: `GET /api/posture?controls=CODE,CODE&versionId=<uuid>` returning
  `{ summary: Record<Verdict, number>, controls: ControlPosture[] }`.
- Also produces, for the test: `parsePostureQuery(url: URL): { controlCodes: string[]; versionId: string | null }`.

The middleware does not gate `/api/*` — `src/middleware.ts` computes
`needsAuth = !isPublic && !isApi`. This handler must authenticate itself.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/posture/route-contract.test.ts`:

```ts
// tests/unit/posture/route-contract.test.ts
// Query parsing for the posture route. Kept pure so it is testable without
// Next's request plumbing.

import { describe, it, expect } from 'vitest';
import { parsePostureQuery } from '@/app/api/posture/route';

describe('parsePostureQuery', () => {
  it('splits a comma-separated control list', () => {
    const q = parsePostureQuery(new URL('https://x.test/api/posture?controls=GOV-01,GOV-02'));
    expect(q.controlCodes).toEqual(['GOV-01', 'GOV-02']);
  });

  it('trims whitespace and drops empty entries', () => {
    const q = parsePostureQuery(new URL('https://x.test/api/posture?controls=GOV-01, ,GOV-02,'));
    expect(q.controlCodes).toEqual(['GOV-01', 'GOV-02']);
  });

  it('returns an empty list when the parameter is absent', () => {
    const q = parsePostureQuery(new URL('https://x.test/api/posture'));
    expect(q.controlCodes).toEqual([]);
  });

  it('reads the version id when present', () => {
    const q = parsePostureQuery(
      new URL('https://x.test/api/posture?versionId=11111111-1111-1111-1111-111111111111'),
    );
    expect(q.versionId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('reports a null version id when absent', () => {
    expect(parsePostureQuery(new URL('https://x.test/api/posture')).versionId).toBeNull();
  });

  it('deduplicates repeated control codes', () => {
    const q = parsePostureQuery(new URL('https://x.test/api/posture?controls=GOV-01,GOV-01'));
    expect(q.controlCodes).toEqual(['GOV-01']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/posture/route-contract.test.ts`
Expected: FAIL — cannot resolve `@/app/api/posture/route`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/app/api/posture/route.ts`:

```ts
// src/app/api/posture/route.ts
// Reads posture with its evidence. Self-authenticating: src/middleware.ts
// deliberately exempts /api/* (needsAuth = !isPublic && !isApi), so there is
// no fallback protection behind this handler.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { groupPosture, rowsToLinks, summarise } from '@/lib/posture/read';

export const dynamic = 'force-dynamic';

const MAX_CONTROLS = 500;

export function parsePostureQuery(url: URL): {
  controlCodes: string[];
  versionId: string | null;
} {
  const raw = url.searchParams.get('controls') ?? '';
  const codes = raw
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return {
    controlCodes: [...new Set(codes)],
    versionId: url.searchParams.get('versionId'),
  };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin' && profile?.role !== 'ionic_user') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { controlCodes, versionId } = parsePostureQuery(new URL(request.url));
  if (controlCodes.length === 0) {
    return NextResponse.json({ error: 'controls is required' }, { status: 400 });
  }
  if (controlCodes.length > MAX_CONTROLS) {
    return NextResponse.json(
      { error: `at most ${MAX_CONTROLS} controls per request` },
      { status: 400 },
    );
  }

  const db = createAdminClient();
  let query = db
    .from('control_evidence')
    .select('scf_control_code, product_version_id, chunk_id, document_id, role, score, snippet')
    .in('scf_control_code', controlCodes);
  query = versionId
    ? query.eq('product_version_id', versionId)
    : query.is('product_version_id', null);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const postures = groupPosture(
    controlCodes,
    rowsToLinks((data ?? []) as Array<Record<string, unknown>>),
  );
  return NextResponse.json({ summary: summarise(postures), controls: postures });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/posture/route-contract.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Verify the whole suite and types**

Run: `npx vitest run tests/unit/posture && npx tsc --noEmit`
Expected: 67 posture tests pass. `tsc` reports no **new** errors — this repo has pre-existing ones,
and `next.config.ts` sets `typescript.ignoreBuildErrors`, so compare against a baseline on `main`
rather than expecting zero.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/posture/route.ts tests/unit/posture/route-contract.test.ts
git commit -m "feat(posture): expose posture with evidence over an internal-gated route"
```

---

## What this plan deliberately does not do

- Does not touch `evidence_evaluations`, `control_evaluation_cache`, or `assessments`. They stay
  readable so the current dashboard keeps working until SP-2 moves the read path.
- Does not remove `quick` mode. Removing it belongs with the write path, in SP-2. Until then the old
  number and the new one can be compared side by side, which is the point.
- Does not populate `control_inventory`. The table is created here because evidence and inventory
  are one schema change; filling it is the first task of SP-2, where framework projection needs it.
- Does not add LLM confirmation to provenance. The `method` column accepts `llm_confirmed` so the
  second pass can be added without a migration.
- Does not fix the four broken cron jobs, the unauthenticated `/api/chat`, or the tables without
  RLS. Those are in the risk register and are separate work.

## Self-review

**Spec coverage.** §4.1 → Task 4. §4.2 → Tasks 4, 5, 7. §4.3 → Tasks 3, 4, 5. §4.4 → Task 2.
§4.5 → Task 1. §5 in-scope read API → Tasks 6, 8. Backfill → Task 7. Success criteria 1→Task 1,
2→Tasks 2 and 3, 3→Tasks 2 and 3, 4→Task 6, 5→Task 7 step 3, 6→Tasks 3 and 4.

**Gaps found and closed.**

1. Success criterion 6 ("no code path can assign the same chunk to both roles") was covered in
   TypeScript by Task 3 but not in the database, since the table's unique constraint includes `role`
   and so permits both. Task 4 now adds the `control_evidence_one_role_per_chunk` unique index, and
   Task 4's test asserts it.

2. **A scale bug that would have failed the whole plan on first run.** The draft compared
   `match_documents_hybrid`'s `similarity` column against a 0..1 threshold. That column is not a
   cosine: `20260701000002_add_clarity_to_rpc.sql:104` aliases the reciprocal-rank-fusion
   `combined_score` as `similarity`, and it ranges roughly 0 to 0.033. A floor of 0.65 would have
   rejected every chunk and reported every control as `gap` — which would have looked like a
   plausible "honest" result and been entirely wrong. Task 3 now exports `normalizeRrf` with its own
   tests, Task 7 applies it, and the Global Constraints record the trap.

3. `tsx` was assumed present and is not installed; no existing npm script runs anything in
   `src/scripts/`. Task 7 Step 1 now installs it, and the script follows the
   `import 'dotenv/config'` + relative-import convention of `src/scripts/bulk-reindex.ts` rather
   than the `@/` alias, which does not resolve outside Next's bundler.

4. Task 4's test asserted `not.toContain('verdict')` while the migration's own comment explains that
   there is no verdict column — the test would have failed on its own documentation. It now matches a
   column declaration at line start instead.

5. **Found by the pre-flight scan, after the plan was first written** (recorded as rulings R1–R3
   in the SDD ledger). `product_version_id` is NULL on every row the backfill writes, and Postgres
   treats NULLs as distinct in unique constraints, indexes, and conflict targets alike. Three
   consequences, all in the path that matters most: the one-role index enforced nothing; the
   4-column unique constraint enforced nothing; and `ON CONFLICT` could never match an existing
   row, so a second backfill run would duplicate rather than update. Task 4 now uses two partial
   unique indexes split on the null predicate, Task 5 replaces the evidence upsert with
   delete-then-insert per scope, and Task 4's test asserts both indexes — the assertion the earlier
   self-review claimed existed but did not.

6. Two DDL assumptions were verified against the repository rather than assumed:
   `public.set_updated_at()` exists (`004_compliance_tables.sql:72`), and `user_role` is an enum of
   `admin | ionic_user | client_user` (`002_enums.sql:15`), so the RLS predicate's text literals are
   valid. The RLS loop was also rewritten to one `EXECUTE` per statement, since PL/pgSQL's `EXECUTE`
   runs a single command.

**Placeholder scan.** No TBDs. Every code step carries runnable code. Task 7 has no unit test, and
that is stated with its reason rather than left implicit.

**Type consistency.** `EvidenceLink` and `ProvenanceRow` are defined once in Task 1 and imported
everywhere after. `buildEvidenceLinks` keeps the same signature in Tasks 3 and 7. `rowsToLinks`,
`groupPosture` and `summarise` keep theirs in Tasks 6 and 8. `PostgrestLike` is defined in Task 5
and used only there. Column names in Task 5's mappers match the DDL in Task 4 exactly.
