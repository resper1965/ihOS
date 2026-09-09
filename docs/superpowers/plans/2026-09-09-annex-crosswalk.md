# Annex A Crosswalk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Annex A → SCF mappings out of a bare, unversioned legacy table into a first-class one that records edition, provenance, relationship and human signature — and delete the script that can fabricate over the source.

**Architecture:** A new table `annex_control_mappings`, keyed `(edition, annex_code, control_code)`. A pure classifier decides an id's edition from the id itself and refuses anything it does not recognise. An operator script reads the legacy table, classifies, and writes the new one; every row lands `probable`, with a null relationship and a provenance that says the origin is unknown, because it is. Nothing repoints the legacy table's nine consumers and nothing drops it.

**Tech Stack:** Supabase (Postgres), TypeScript 5 strict, tsx for operator scripts, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-annex-crosswalk-design.md`
**Parent spec:** `docs/superpowers/specs/2026-09-09-the-dynamic-design.md`

## Global Constraints

- **Run commands as:** `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && <command>")`. The repo lives on a WSL path; `npm`/`npx` from Windows resolves the wrong `node_modules`.
- **The typecheck baseline is 199 errors** (`npx tsc --noEmit 2>&1 | grep -c 'error TS'`). Pre-existing. No task may raise it.
- **supabase-js caps an unbounded `select()` at 1,000 rows.** `.limit(N)` does NOT lift it — it silently returns 1,000. Every full-table read pages with `.range(from, from + 999)` until a short page. This has already produced three wrong measurements in this project.
- **Nothing enters as `exact`.** Every imported row is `confidence = 'probable'`, `relationship_type = NULL`, `provenance = 'undocumented_pre_2026-06-05'`. A relationship or an `exact` is set only when a person signs the row.
- **An id whose edition cannot be determined fails the import loudly.** It is never given a default edition. This is how `A.12.4.1` is excluded, and it is the same discipline `classifyMapping` already applies to unknown relationship types.
- **Migrations are applied by a person**, not by an agent. Every migration gets a `docs/sql/` mirror named `APPLY_ME`. Never run DDL against the database.
- **Commit trailer:** every commit ends with `Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>`, matching the repo's history.

## Measured facts this plan relies on

All measured 2026-09-09 against the live database:

| | |
|---|---|
| Annex A rows in `scf_framework_mappings` | 2,689 |
| distinct Annex A ids | 125 (116 under `iso27001`, 124 under `iso27701`, overlapping by 115) |
| ids classifying as `iso27001:2022` | 93 — exactly the ISO 27001:2022 Annex A control count |
| ids classifying as `iso27701:2019` | 31 — all `A.7.2.x`–`A.7.5.x` |
| ids classifying as neither | **1** — `A.12.4.1` |
| distinct `(edition, annex_code, control_code)` triples | **2,228** |
| distinct SCF control codes reached | 407, all 407 present in the current catalogue |

2,689 raw rows collapse to 2,228 because the same Annex A id is filed under both
`iso27001` and `iso27701`; the new key makes those one row rather than two.

---

### Task 1: The table

**Files:**
- Create: `supabase/migrations/20260909000002_annex_control_mappings.sql`
- Create: `docs/sql/2026-09-09c_APPLY_ME_annex_crosswalk.sql`
- Test: `tests/unit/annex/table-shape.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.annex_control_mappings` with columns `edition`, `annex_code`, `control_code`, `relationship_type`, `provenance`, `confidence`, `decided_by`, `decided_at`, `rationale`, `imported_at`. Tasks 3 and 4 read and write it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/annex/table-shape.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260909000002_annex_control_mappings.sql'),
  'utf8',
);

describe('the Annex A crosswalk is a first-class table', () => {
  it('keys on (edition, annex_code, control_code), never on an id alone', () => {
    // Edition is part of the key because the data holds two: A.7.5 is an ISO
    // 27001:2022 physical control and A.7.5.3 is an ISO 27701 PII control.
    // Keying on the code alone would collide them.
    expect(sql).toMatch(/PRIMARY KEY \(edition, annex_code, control_code\)/i);
  });

  it('constrains edition to the two that exist, so a third fails loudly', () => {
    expect(sql).toMatch(/edition\s+text\s+not null/i);
    expect(sql).toContain("'iso27001:2022'");
    expect(sql).toContain("'iso27701:2019'");
  });

  it('allows a null relationship, because the source cannot state one', () => {
    // The legacy table holds only a triple of codes. NULL means "unrecorded",
    // which contributionOf() already distinguishes from 'intersects'.
    expect(sql).toMatch(/relationship_type\s+text\s+null/i);
  });

  it('records provenance and confidence on every row', () => {
    expect(sql).toMatch(/provenance\s+text\s+not null/i);
    expect(sql).toMatch(/confidence\s+text\s+not null/i);
    expect(sql).toContain("'probable'");
    expect(sql).toContain("'exact'");
  });

  it('refuses an exact row that nobody signed', () => {
    // An exact mapping with no decided_by is the shape of a guess wearing a
    // signature. The CHECK makes it unstorable.
    expect(sql).toMatch(/CHECK\s*\(/i);
    expect(sql).toMatch(/decided_by/);
  });

  it('enables row level security, like every other spine table', () => {
    expect(sql).toMatch(/ALTER TABLE public\.annex_control_mappings\s+ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY .* ON public\.annex_control_mappings/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/annex/table-shape.test.ts")`

Expected: FAIL — `ENOENT`, the migration does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260909000002_annex_control_mappings.sql`:

```sql
-- Migration 20260909000002: the Annex A crosswalk, as an asset rather than a
-- leftover.
--
-- ISO Annex A does not exist in the vendor's catalogue. Measured 2026-09-09:
-- general-iso-27001-2022 holds 148 requirement codes and every one is a
-- management clause (4.1 through 10.2); the STRM bundle carries no A.x.y code
-- in any of its 183 focal documents. The vendor does not publish it and there
-- is nothing to import from.
--
-- So the mapping in scf_framework_mappings -- 2,689 rows over 125 Annex A ids,
-- reaching 407 SCF controls -- is Ionic's own. This table gives it what the
-- legacy one cannot hold: which edition an id belongs to, where the row came
-- from, how the control relates to the requirement, and who decided.
--
-- The legacy table is NOT dropped here and its nine consumers are NOT
-- repointed. That is a separate project.

CREATE TABLE IF NOT EXISTS public.annex_control_mappings (
  edition           text NOT NULL
    CHECK (edition IN ('iso27001:2022', 'iso27701:2019')),
  annex_code        text NOT NULL,
  control_code      text NOT NULL,

  -- NULL means the relationship is unrecorded, which is the honest state for
  -- every imported row: the legacy table holds three codes and nothing else.
  -- Distinct from 'no_relation', which is a positive claim of non-relation.
  relationship_type text NULL
    CHECK (relationship_type IS NULL
           OR relationship_type IN ('equal', 'subset', 'intersects', 'superset', 'no_relation')),

  provenance        text NOT NULL,
  confidence        text NOT NULL
    CHECK (confidence IN ('exact', 'probable', 'rejected')),

  decided_by        text NULL,
  decided_at        timestamptz NULL,
  rationale         text NULL,
  imported_at       timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (edition, annex_code, control_code)
);

-- Edition is in the key, not inferred at read time, because the two vocabularies
-- overlap in shape: A.7.5 is an ISO 27001:2022 physical control and A.7.5.3 is
-- an ISO 27701 PII control. A key on the code alone would collide them.

-- An exact mapping is a human decision. Storing one with no signature is how a
-- guess acquires authority, so it is unstorable.
ALTER TABLE public.annex_control_mappings
  DROP CONSTRAINT IF EXISTS annex_control_mappings_exact_is_signed;
ALTER TABLE public.annex_control_mappings
  ADD CONSTRAINT annex_control_mappings_exact_is_signed CHECK (
    confidence <> 'exact'
    OR (decided_by IS NOT NULL AND decided_at IS NOT NULL AND rationale IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS annex_control_mappings_control_idx
  ON public.annex_control_mappings (control_code);
CREATE INDEX IF NOT EXISTS annex_control_mappings_confidence_idx
  ON public.annex_control_mappings (confidence);

COMMENT ON TABLE public.annex_control_mappings IS
  'ISO Annex A control to SCF control, owned by Ionic. The vendor publishes no '
  'Annex A crosswalk -- measured 2026-09-09, its ISO 27001 mapping is management '
  'clauses only and its STRM bundle carries no A.x.y code -- so this has no '
  'upstream and is not a stopgap. Rows imported from the legacy '
  'scf_framework_mappings carry provenance undocumented_pre_2026-06-05 and '
  'confidence probable; only a person turns one exact.';

COMMENT ON COLUMN public.annex_control_mappings.provenance IS
  'Where the row came from. undocumented_pre_2026-06-05 means the legacy import '
  'of that date, whose own source is not recorded anywhere and could not be '
  'recovered. It is a true statement, not a placeholder.';

ALTER TABLE public.annex_control_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS annex_control_mappings_read ON public.annex_control_mappings;
CREATE POLICY annex_control_mappings_read ON public.annex_control_mappings
  FOR SELECT TO authenticated USING (true);
```

Copy the same statements to `docs/sql/2026-09-09c_APPLY_ME_annex_crosswalk.sql`, with a one-line header naming the migration it mirrors. That mirror exists because this deployment applies migrations by hand.

- [ ] **Step 4: Run the test and watch it pass**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/annex/table-shape.test.ts")`

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260909000002_annex_control_mappings.sql docs/sql/2026-09-09c_APPLY_ME_annex_crosswalk.sql tests/unit/annex/table-shape.test.ts
git commit -m "$(cat <<'EOF'
feat(db): 20260909000002 -- the Annex A crosswalk as an asset

ISO Annex A is not in the vendor's catalogue. Measured 2026-09-09:
general-iso-27001-2022 holds 148 requirement codes, all management clauses, and
the STRM bundle carries no A.x.y code in any of its 183 focal documents. There
is nothing upstream to import from, so the 2,689 rows sitting in the legacy
table are Ionic's own asset rather than a stopgap.

This table gives them what a triple of codes cannot hold: which edition an id
belongs to, where the row came from, how the control relates to the requirement,
and who decided. Edition is in the primary key because the vocabularies overlap
in shape -- A.7.5 is an ISO 27001:2022 physical control and A.7.5.3 is an ISO
27701 PII control, and a key on the code alone would collide them.

A CHECK makes an exact mapping with no signature unstorable, because that is
precisely how a guess acquires authority.

The legacy table is not dropped and its nine consumers are not repointed.
EOF
)"
```

---

### Task 2: The edition classifier

The one piece of judgement in this plan, isolated into a pure function so it can be tested exhaustively and so nothing else has to guess.

**Files:**
- Create: `src/lib/annex/edition.ts`
- Test: `tests/unit/annex/edition.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```typescript
  export type AnnexEdition = 'iso27001:2022' | 'iso27701:2019';
  export function editionOf(annexCode: string): AnnexEdition | null;
  ```
  Task 3 calls it and treats `null` as "exclude and report", never as a default.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/annex/edition.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { editionOf } from '@/lib/annex/edition';

describe('an Annex A id says which edition it belongs to', () => {
  it('reads two-segment ids as ISO 27001:2022 Annex A', () => {
    for (const code of ['A.5.1', 'A.5.37', 'A.6.8', 'A.7.14', 'A.8.34', 'A.8.24']) {
      expect(editionOf(code), code).toBe('iso27001:2022');
    }
  });

  it('reads A.7.x.y as ISO 27701:2019, not as a 27001 control', () => {
    // This is the distinction the whole classifier exists for. A.7.5 is an ISO
    // 27001:2022 physical control; A.7.5.3 is an ISO 27701 PII control. They
    // differ only by a segment.
    for (const code of ['A.7.2.1', 'A.7.3.10', 'A.7.4.9', 'A.7.5.4']) {
      expect(editionOf(code), code).toBe('iso27701:2019');
    }
    expect(editionOf('A.7.5')).toBe('iso27001:2022');
  });

  it('returns null for the 2013-edition leftover rather than guessing', () => {
    // A.12.4.1 is the only id in the legacy data belonging to neither edition:
    // ISO 27001:2022 Annex A stops at A.8, and ISO 27701's annex is A.7.x.y
    // only. Defaulting it to either edition would file a 2013 control as a
    // current one.
    expect(editionOf('A.12.4.1')).toBeNull();
  });

  it('returns null for three-segment ids outside A.7', () => {
    expect(editionOf('A.9.2.1')).toBeNull();
    expect(editionOf('A.18.1.3')).toBeNull();
  });

  it('returns null for anything that is not an Annex A id at all', () => {
    for (const code of ['5.1', '6.1.2(d)(3)', 'SI-10', '', 'A.', 'A.x.y']) {
      expect(editionOf(code), code).toBeNull();
    }
  });

  it('does not accept a four-segment A.7 id', () => {
    // The 27701 annex is exactly three segments deep. A fourth means something
    // this classifier has never seen, and inventing a home for it is the
    // failure mode this function exists to prevent.
    expect(editionOf('A.7.2.1.1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/annex/edition.test.ts")`

Expected: FAIL — cannot resolve `@/lib/annex/edition`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/annex/edition.ts`:

```typescript
// Which standard an Annex A id belongs to, decided from the id alone.
//
// Two vocabularies live in the legacy crosswalk and they overlap in shape:
//
//   A.7.5    ISO 27001:2022 Annex A, physical controls
//   A.7.5.3  ISO 27701:2019 Annex A, PII controller controls
//
// They differ by one segment, which is why this is a function with tests rather
// than a regex written inline at the call site. An earlier reading of this data
// classified by counting segments and concluded that all 23 three-segment ids
// under `iso27001` were stale 2013 residue. Listing them showed 22 were ISO
// 27701 controls filed under the wrong framework code and exactly one -- 
// A.12.4.1 -- was a 2013 leftover. That reading would have deleted 22 live
// mappings.
//
// Returning null is a real answer and the caller must treat it as one: an id
// this function does not recognise is excluded and reported, never given a
// default edition.

export type AnnexEdition = 'iso27001:2022' | 'iso27701:2019';

/** ISO 27701:2019 Annex A — exactly three segments, all under A.7. */
const ISO_27701_ANNEX = /^A\.7\.\d+\.\d+$/;

/** ISO 27001:2022 Annex A — exactly two segments, themes A.5 through A.8. */
const ISO_27001_2022_ANNEX = /^A\.[5-8]\.\d+$/;

export function editionOf(annexCode: string): AnnexEdition | null {
  if (ISO_27701_ANNEX.test(annexCode)) return 'iso27701:2019';
  if (ISO_27001_2022_ANNEX.test(annexCode)) return 'iso27001:2022';
  return null;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/annex/edition.test.ts")`

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/annex/edition.ts tests/unit/annex/edition.test.ts
git commit -m "$(cat <<'EOF'
feat(annex): an id says which edition it belongs to, and null is an answer

Two vocabularies share the legacy crosswalk and overlap in shape: A.7.5 is an
ISO 27001:2022 physical control, A.7.5.3 is an ISO 27701 PII control. One
segment apart.

An earlier reading classified by counting segments and called all 23
three-segment ids under iso27001 stale 2013 residue. Listing them showed 22 were
ISO 27701 controls filed under the wrong framework code and exactly one --
A.12.4.1 -- was a 2013 leftover. Shipping that reading would have deleted 22
live mappings, which is why this is a tested function rather than a regex at a
call site.

Null is a real return value: an unrecognised id is excluded and reported, never
given a default edition.
EOF
)"
```

---

### Task 3: The import, and the end of the fabrication tool

**Files:**
- Create: `scripts/import-annex-crosswalk.ts`
- Delete: `scripts/seed-mappings.js`
- Test: `tests/unit/annex/no-fabricator.test.ts`

**Interfaces:**
- Consumes: `editionOf` from `@/lib/annex/edition` (Task 2); the table from Task 1.
- Produces: rows in `annex_control_mappings`. Task 4 verifies them.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/annex/no-fabricator.test.ts`, in the shape of `tests/unit/spine/no-duplicate-catalogue.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

describe('the tool that manufactured the quarantined mappings is gone', () => {
  it('scripts/seed-mappings.js no longer exists', () => {
    // It read iso27001 and iso27701 and cloned them into other frameworks by
    // prefixing the requirement id (LGPD-A.8.24). Those clones are the 25,589
    // rows quarantined by migration 20260825000002. One invocation re-creates
    // them. Git history keeps it readable; the working tree must not.
    expect(existsSync(resolve(process.cwd(), 'scripts/seed-mappings.js'))).toBe(false);
  });

  it('no script clones one framework_code into another', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(ts|js|cjs)$/.test(entry)) continue;
        const code = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^[ \t]*\/\/.*$/gm, '');
        // A literal framework_code assignment next to a template-string id is
        // the fabrication shape: `framework_code: 'X', target_control_id: \`Y-${...}\``
        if (/framework_code:\s*'[^']+'/.test(code) && /target_control_id:\s*`/.test(code)) {
          offenders.push(full);
        }
      }
    };
    walk(resolve(process.cwd(), 'scripts'));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/annex/no-fabricator.test.ts")`

Expected: FAIL on both cases — `scripts/seed-mappings.js` is still present and still matches the fabrication shape.

- [ ] **Step 3: Write the import script**

Create `scripts/import-annex-crosswalk.ts`:

```typescript
// Operator script: import the Annex A crosswalk out of the legacy table.
//
//   npx tsx scripts/import-annex-crosswalk.ts --dry-run
//   npx tsx scripts/import-annex-crosswalk.ts
//
// Reads scf_framework_mappings, keeps only Annex A ids, classifies each one's
// edition from the id itself, and writes annex_control_mappings. Every row
// lands probable, with a null relationship and a provenance that says its
// origin is unrecorded -- because it is: all 10,074 legacy rows share one
// synced_at of 2026-06-05, from an import that is not in this repository.
//
// The legacy table is NOT modified and NOT dropped.

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

const DRY_RUN = process.argv.includes('--dry-run');
const PROVENANCE = 'undocumented_pre_2026-06-05';
const PAGE = 1000;
const BATCH = 500;

interface LegacyRow {
  target_control_id: string;
  scf_control_code: string | null;
}

async function main() {
  const { editionOf } = await import('../src/lib/annex/edition');
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const db = createAdminClient() as never as {
    from: (t: string) => {
      select: (c: string) => {
        range: (a: number, b: number) => Promise<{
          data: LegacyRow[] | null;
          error: { message: string } | null;
        }>;
      };
      upsert: (
        rows: Array<Record<string, unknown>>,
        opts: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>;
    };
  };

  // Paged with .range(): supabase-js caps an unbounded select at 1,000 rows and
  // .limit() does not lift it. The legacy table holds 10,074.
  const legacy: LegacyRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('scf_framework_mappings')
      .select('target_control_id, scf_control_code')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read scf_framework_mappings: ${error.message}`);
    const rows = data ?? [];
    legacy.push(...rows);
    if (rows.length < PAGE) break;
  }
  console.log(`legacy rows read: ${legacy.length}`);

  // Keyed by the primary key so an id filed under both framework codes becomes
  // one row rather than two -- 2,689 raw Annex A rows collapse to 2,228.
  const byKey = new Map<string, Record<string, unknown>>();
  const unclassified = new Map<string, number>();
  let notAnnex = 0;
  let noControl = 0;

  for (const row of legacy) {
    const annexCode = row.target_control_id;
    if (!annexCode?.startsWith('A.')) { notAnnex++; continue; }

    const edition = editionOf(annexCode);
    if (edition === null) {
      unclassified.set(annexCode, (unclassified.get(annexCode) ?? 0) + 1);
      continue;
    }

    const controlCode = row.scf_control_code;
    if (!controlCode) { noControl++; continue; }

    byKey.set(`${edition}|${annexCode}|${controlCode}`, {
      edition,
      annex_code: annexCode,
      control_code: controlCode,
      relationship_type: null,
      provenance: PROVENANCE,
      confidence: 'probable',
      decided_by: null,
      decided_at: null,
      rationale: null,
    });
  }

  const rows = [...byKey.values()];
  const byEdition: Record<string, Set<string>> = {};
  for (const r of rows) {
    const e = String(r.edition);
    (byEdition[e] ??= new Set()).add(String(r.annex_code));
  }

  console.log(`\nto import: ${rows.length} rows`);
  for (const [e, ids] of Object.entries(byEdition)) {
    console.log(`  ${e}: ${ids.size} distinct annex ids`);
  }
  console.log(`skipped, not an Annex A id: ${notAnnex}`);
  console.log(`skipped, no SCF control code: ${noControl}`);

  if (unclassified.size > 0) {
    console.log(`\nEXCLUDED -- edition could not be determined from the id:`);
    for (const [id, n] of unclassified) console.log(`  ${id}  (${n} legacy rows)`);
    console.log(
      'These are reported rather than defaulted. An id whose edition is unknown ' +
        'is not filed under a guess.',
    );
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await db
      .from('annex_control_mappings')
      .upsert(batch, { onConflict: 'edition,annex_code,control_code' });
    if (error) throw new Error(`upsert annex_control_mappings: ${error.message}`);
    console.log(`  wrote ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log('\ndone.');
}

main();
```

- [ ] **Step 4: Delete the fabrication tool**

```bash
git rm scripts/seed-mappings.js
```

- [ ] **Step 5: Run the tests**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run && npx tsc --noEmit 2>&1 | grep -c 'error TS'")`

Expected: tests PASS; error count 199 or lower.

- [ ] **Step 6: Run the dry run and check the numbers**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx tsx scripts/import-annex-crosswalk.ts --dry-run")`

Expected, measured 2026-09-09:

```
legacy rows read: 10074
to import: 2228 rows
  iso27001:2022: 93 distinct annex ids
  iso27701:2019: 31 distinct annex ids
EXCLUDED -- edition could not be determined from the id:
  A.12.4.1  (n legacy rows)
```

If `to import` is not 2,228, or a second id appears in the excluded list, **stop and report it** rather than proceeding. Either the legacy data changed or the classifier is wrong, and both need a person before anything is written.

- [ ] **Step 7: Ask the user to apply the migration, then run the import for real**

The table does not exist until a person applies
`docs/sql/2026-09-09c_APPLY_ME_annex_crosswalk.sql`. Give them that path, wait,
then run without `--dry-run` and report the written count.

- [ ] **Step 8: Commit**

```bash
git add scripts/import-annex-crosswalk.ts tests/unit/annex/no-fabricator.test.ts
git commit -m "$(cat <<'EOF'
feat(annex): import the crosswalk, and delete the tool that could fabricate over it

The import reads the legacy table, keeps Annex A ids, classifies each one's
edition from the id, and writes annex_control_mappings. 2,689 raw Annex A rows
collapse to 2,228 because the same id is filed under both iso27001 and
iso27701; the new key makes those one row.

Every row lands probable, relationship NULL, provenance
undocumented_pre_2026-06-05. That last one is a measurement, not a shrug: all
10,074 legacy rows share one synced_at of 2026-06-05, from an import that is not
in this repository and could not be traced further.

A.12.4.1 is excluded and named in the output. An id whose edition cannot be
determined is reported, never filed under a guess.

scripts/seed-mappings.js goes with it. It read iso27001 and iso27701 and cloned
them into other frameworks by prefixing the requirement id, producing the 25,589
rows quarantined by 20260825000002 -- and one invocation would produce them
again. A test now asserts both that it is gone and that no other script has its
shape. Git history keeps it readable.
EOF
)"
```

---

### Task 4: The reader, and the invariant that guards it

Without this the table is unaddressable and the import is unverified in the way that matters.

**Files:**
- Create: `src/lib/annex/read.ts`
- Modify: `src/lib/spine/invariants.ts`
- Test: `tests/unit/annex/read.test.ts`, `tests/unit/annex/invariant.test.ts`

**Interfaces:**
- Consumes: the table from Task 1, populated by Task 3; `AnnexEdition` from Task 2.
- Produces:
  ```typescript
  export interface AnnexLink {
    controlCode: string;
    edition: AnnexEdition;
    confidence: 'exact' | 'probable' | 'rejected';
    relationshipType: string | null;
  }
  export async function scfControlsForAnnex(
    annexCode: string,
    client: AnnexReader,
  ): Promise<AnnexLink[]>;

  export interface AnnexInvariantFailure { annexCode: string; reason: string }
  export async function checkAnnexMappingsResolve(
    client: unknown,
    scfVersionId: string,
  ): Promise<AnnexInvariantFailure[]>;
  ```
  Child C consumes `scfControlsForAnnex`.

- [ ] **Step 1: Write the failing test for the reader**

Create `tests/unit/annex/read.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { scfControlsForAnnex } from '@/lib/annex/read';

function clientReturning(rows: Array<Record<string, unknown>>) {
  const calls: Array<[string, string]> = [];
  const client = {
    from: () => ({
      select: () => ({
        eq: (col: string, v: string) => {
          calls.push([col, v]);
          return { then: (r: (x: { data: unknown[]; error: null }) => unknown) => r({ data: rows, error: null }) };
        },
      }),
    }),
  };
  return { client, calls };
}

describe('reading the Annex A crosswalk', () => {
  it('returns every SCF control an Annex control maps to, with its confidence', () => {
    const { client } = clientReturning([
      { control_code: 'GOV-01', edition: 'iso27001:2022', confidence: 'probable', relationship_type: null },
      { control_code: 'GOV-02', edition: 'iso27001:2022', confidence: 'exact', relationship_type: 'subset' },
    ]);
    return expect(scfControlsForAnnex('A.5.1', client as never)).resolves.toEqual([
      { controlCode: 'GOV-01', edition: 'iso27001:2022', confidence: 'probable', relationshipType: null },
      { controlCode: 'GOV-02', edition: 'iso27001:2022', confidence: 'exact', relationshipType: 'subset' },
    ]);
  });

  it('filters by the annex code, and says so', async () => {
    const { client, calls } = clientReturning([]);
    await scfControlsForAnnex('A.8.24', client as never);
    expect(calls).toContainEqual(['annex_code', 'A.8.24']);
  });

  it('returns an empty list for an unmapped control rather than throwing', async () => {
    // A control the crosswalk does not cover is a real state -- the SoA may
    // apply something none of the 124 ids reaches. The caller reports it as
    // unmapped; it is not an error here.
    const { client } = clientReturning([]);
    await expect(scfControlsForAnnex('A.5.99', client as never)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/annex/read.test.ts")`

Expected: FAIL — cannot resolve `@/lib/annex/read`.

- [ ] **Step 3: Write the reader**

Create `src/lib/annex/read.ts`:

```typescript
// Reading the Ionic-owned Annex A crosswalk.
//
// This is the half of the interlingua the vendor does not sell. Child C
// composes it with the Statement of Applicability to produce posture at SCF
// level without any retrieval.

import type { AnnexEdition } from '@/lib/annex/edition';

export interface AnnexLink {
  controlCode: string;
  edition: AnnexEdition;
  /** probable = imported, unsigned. exact = a person decided. */
  confidence: 'exact' | 'probable' | 'rejected';
  /** NULL means unrecorded, which is every imported row. */
  relationshipType: string | null;
}

export interface AnnexReader {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): PromiseLike<{
        data: Array<Record<string, unknown>> | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export async function scfControlsForAnnex(
  annexCode: string,
  client: AnnexReader,
): Promise<AnnexLink[]> {
  const { data, error } = await client
    .from('annex_control_mappings')
    .select('control_code, edition, confidence, relationship_type')
    .eq('annex_code', annexCode);

  if (error) throw new Error(`annex_control_mappings: ${error.message}`);

  return (data ?? [])
    .filter((r) => r.confidence !== 'rejected')
    .map((r) => ({
      controlCode: String(r.control_code),
      edition: r.edition as AnnexEdition,
      confidence: r.confidence as AnnexLink['confidence'],
      relationshipType: r.relationship_type === null ? null : String(r.relationship_type),
    }));
}
```

- [ ] **Step 4: Write the failing test for the invariant**

Create `tests/unit/annex/invariant.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { checkAnnexMappingsResolve } from '@/lib/spine/invariants';

/**
 * `annexRows` are what the crosswalk holds; `catalogue` is the set of SCF
 * control codes the current version knows.
 */
function client(annexRows: Array<{ annex_code: string; control_code: string }>, catalogue: string[]) {
  return {
    from: (table: string) => ({
      select: (_c: string, _o?: unknown) => {
        if (table === 'annex_control_mappings') {
          return {
            range: async () => ({ data: annexRows, error: null }),
          };
        }
        return {
          eq: () => ({
            range: async () => ({ data: catalogue.map((c) => ({ control_code: c })), error: null }),
          }),
        };
      },
    }),
  };
}

describe('every Annex mapping points at a control that exists', () => {
  it('passes when all mapped controls are in the catalogue', async () => {
    const failures = await checkAnnexMappingsResolve(
      client([{ annex_code: 'A.5.1', control_code: 'GOV-01' }], ['GOV-01', 'GOV-02']),
      'v1',
    );
    expect(failures).toEqual([]);
  });

  it('fails an Annex control mapped to a control the catalogue does not have', async () => {
    // A vendor version bump can retire a control code. The mapping would then
    // point at nothing and the projection would silently lose coverage -- the
    // same silence that let eight curated identities break for eleven days.
    const failures = await checkAnnexMappingsResolve(
      client([{ annex_code: 'A.5.1', control_code: 'GONE-99' }], ['GOV-01']),
      'v1',
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].annexCode).toBe('A.5.1');
    expect(failures[0].reason).toMatch(/GONE-99/);
  });
});
```

- [ ] **Step 5: Run both and watch them fail**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/annex/")`

Expected: the reader tests PASS after Step 3; the invariant test FAILS — `checkAnnexMappingsResolve` is not exported.

- [ ] **Step 6: Add the invariant**

Append to `src/lib/spine/invariants.ts`:

```typescript
export interface AnnexInvariantFailure {
  annexCode: string;
  reason: string;
}

/**
 * Every Annex A mapping must point at an SCF control the current catalogue
 * still has.
 *
 * A vendor version bump can retire a control code. When that happens the
 * mapping points at nothing, and a projection over it loses coverage without
 * saying so — the same silence that let all eight curated framework identities
 * break unnoticed for eleven days on 2026-09-08.
 */
export async function checkAnnexMappingsResolve(
  client: unknown,
  scfVersionId: string,
): Promise<AnnexInvariantFailure[]> {
  const PAGE = 1000;
  const db = client as {
    from: (t: string) => {
      select: (c: string, o?: unknown) => {
        range?: (a: number, b: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
        eq?: (col: string, v: string) => {
          range: (a: number, b: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
        };
      };
    };
  };

  const catalogue = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const q = db.from('scf_controls_cache').select('control_code');
    const { data, error } = await q.eq!('scf_version_id', scfVersionId).range(from, from + PAGE - 1);
    if (error) throw new Error(`scf_controls_cache: ${error.message}`);
    const rows = data ?? [];
    for (const r of rows) catalogue.add(String(r.control_code));
    if (rows.length < PAGE) break;
  }

  const failures: AnnexInvariantFailure[] = [];
  for (let from = 0; ; from += PAGE) {
    const q = db.from('annex_control_mappings').select('annex_code, control_code');
    const { data, error } = await q.range!(from, from + PAGE - 1);
    if (error) throw new Error(`annex_control_mappings: ${error.message}`);
    const rows = data ?? [];
    for (const r of rows) {
      const control = String(r.control_code);
      if (!catalogue.has(control)) {
        failures.push({
          annexCode: String(r.annex_code),
          reason: `maps to ${control}, which is not in catalogue version ${scfVersionId}`,
        });
      }
    }
    if (rows.length < PAGE) break;
  }

  return failures;
}
```

Then add it to the daily cron in `src/app/api/cron/spine-invariants/route.ts`: call it alongside `checkOfferedFrameworksResolve`, merge both failure lists into the response, and return 500 if either is non-empty. Keep the existing `CRON_SECRET` gate exactly as it is.

- [ ] **Step 7: Run everything**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run && npx tsc --noEmit 2>&1 | grep -c 'error TS'")`

Expected: tests PASS; error count 199 or lower.

- [ ] **Step 8: Verify against the real data**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx tsx scripts/run-scf-sync.ts verify")`

Then read `annex_control_mappings` directly and confirm 2,228 rows across 124
distinct annex codes. Measured on 2026-09-09, all 407 SCF codes the crosswalk
reaches exist in the current catalogue, so the invariant must report zero
failures. Any failure here is real and must be reported, not explained away.

- [ ] **Step 9: Commit**

```bash
git add src/lib/annex/read.ts src/lib/spine/invariants.ts src/app/api/cron/spine-invariants/route.ts tests/unit/annex/read.test.ts tests/unit/annex/invariant.test.ts
git commit -m "$(cat <<'EOF'
feat(annex): read the crosswalk, and assert daily that it still points somewhere

scfControlsForAnnex is what child C composes with the Statement of
Applicability to produce posture at SCF level without retrieval. Rejected rows
are filtered; confidence travels with every link, so a consumer can never
mistake an imported row for a signed one.

The invariant asserts every mapping reaches a control the current catalogue
still has. A vendor version bump can retire a code, and a mapping pointing at
nothing loses coverage silently -- which is exactly how eight curated framework
identities broke unnoticed for eleven days. It joins the existing daily cron and
returns 500 with the rest.
EOF
)"
```

---

## Self-Review

**Spec coverage.** §1 what it builds → Tasks 1 and 3. §2 why it must be Ionic's own → recorded in the migration comment, Task 1 Step 3. §3 the data → Task 2's classifier and Task 3's counts, with `A.12.4.1` excluded by Task 2 and reported by Task 3 Step 6. §4 the table → Task 1. §5 confidence and provenance → Task 1's CHECK and Task 3's constants. §5's signing queue → **deliberately not built**: without child A there is no applicable set, so a queue function would have no caller and no input. Recorded here rather than silently dropped. §6 relationship type null → Task 1's nullable column, Task 3's constant. §7 retiring the fabricator → Task 3 Steps 4 and 8, with a test that also catches a replacement of the same shape. §8 what it does not do → no task repoints or drops the legacy table. §9 failure modes → the exact-is-signed CHECK (Task 1), the classifier's null (Task 2), the invariant (Task 4). §10 success criterion → Task 4 Step 8.

**Placeholder scan.** None. Task 3 Step 6's expected output shows `(n legacy rows)` for the excluded id because the per-id legacy row count was not measured; the count that matters — 2,228 imported — is exact, and the step says to stop if it differs.

**Type consistency.** `AnnexEdition` is defined in Task 2 and imported by Task 4's `AnnexLink`. `editionOf(annexCode: string): AnnexEdition | null` is defined in Task 2 and called in Task 3. `scfControlsForAnnex(annexCode, client)` and `checkAnnexMappingsResolve(client, scfVersionId)` are defined and used only in Task 4. Column names in the migration (`annex_code`, `control_code`, `relationship_type`, `provenance`, `confidence`) match the import's insert object and the reader's select.

**One deliberate gap.** Nothing consumes `scfControlsForAnnex` yet — child C does. Task 4 exists anyway because an unreadable table is an unverified import, and the invariant is what stops this asset rotting the way the curated identities did.
