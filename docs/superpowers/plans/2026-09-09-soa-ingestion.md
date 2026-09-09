# Structured SoA Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read the Statement of Applicability as rows — one per control, with its applicability and the justification a person wrote — instead of chunking it into prose that never arrived.

**Architecture:** A table `soa_entries` keyed `(document_id, annex_code)`. A pure parser turns one worksheet's rows into typed entries, binding columns by header name because the letters move between SoA documents. An operator script reads document 392 from storage, selects its three control sheets, parses them, and writes; two guards make its hardcoded document id fail loudly rather than go stale. A coverage report then joins the result to the sibling crosswalk and names the gaps.

**Tech Stack:** Supabase (Postgres + Storage), TypeScript 5 strict, SheetJS (`xlsx`, already a dependency and already used in `src/lib/chat/parser.ts`), tsx for operator scripts, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-soa-ingestion-design.md`
**Parent spec:** `docs/superpowers/specs/2026-09-09-the-dynamic-design.md`

## Global Constraints

- **Run commands as:** `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && <command>")`. The repo lives on a WSL path; `npm`/`npx` from Windows resolves the wrong `node_modules`. Note that a `cd /c/` in a compound command leaves later commands in the wrong directory — run each in its own invocation.
- **The typecheck baseline is 199 errors** (`npx tsc --noEmit 2>&1 | grep -c 'error TS'`). Pre-existing. No task may raise it.
- **supabase-js caps an unbounded `select()` at 1,000 rows.** `.limit(N)` does NOT lift it. Every full-table read pages with `.range(from, from + 999)` and a **total** ordering — a non-unique sort column leaves ties unordered and pagination can still repeat or skip. This has produced four wrong measurements in this project.
- **Columns are bound by header name, never by letter.** Document 392 has seven columns with the code in B; document 507 has eight, with an extra *ID* column pushing the code to C. Same headers, different positions.
- **A row that cannot be parsed fails the import loudly.** Never defaulted, never skipped. The one thing worse than a missing control is a control silently assumed applicable.
- **Migrations are applied by a person**, not by an agent. Every migration gets a `docs/sql/` mirror named `APPLY_ME`, carrying a one-line header naming the migration it mirrors.
- **Commit trailer:** every commit ends with `Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>`.

## Measured facts this plan relies on

All measured 2026-09-09 against the live database and the actual file.

Source: `compliance_documents` id **392**, *Statement of Applicability ISO27001 e 27701_IONIC Health (2026)*, 92,473 bytes. Its `filepath` column holds the path inside the `compliance_documents` storage bucket.

Its six sheet names, verbatim — **note the double space in the first control sheet**:

```
Mandatory Requirements - 27001
ABR-2021
Controls (Annex A) -  27001      <- two spaces after the dash
Mandatory Requirements 27701
Controls (Annex A) - 27701
Controls (Annex B) - 27701
```

| control sheet | code shape | rows | Applicable | Not Applicable |
|---|---|---|---|---|
| `Controls (Annex A) -  27001` | `A.5.1` | 93 | 90 | 3 |
| `Controls (Annex A) - 27701` | `A.7.2.1` | 31 | 29 | 2 |
| `Controls (Annex B) - 27701` | `B.8.2.1` | 18 | 8 | 10 |

**142 rows total, 127 applicable. Zero missing a justification, zero missing an applicability.**

Headers on every control sheet: `Annex | Number | Title | Description | Applicability | Justification | Notes`. The header is not on row 1 — find it by content, not by position.

The two *Mandatory Requirements* sheets carry the same `Applicability` and `Justification` headers. **Header shape alone therefore cannot select the control sheets** — selection must be by name.

Against the sibling crosswalk `annex_control_mappings`: the 93 and the 31 match its imported id sets exactly, both directions, zero orphans either way. It holds no `B.` codes, so of the 127 applicable controls **119 reach SCF and 8 do not**.

---

### Task 1: The table

**Files:**
- Create: `supabase/migrations/20260909000003_soa_entries.sql`
- Create: `docs/sql/2026-09-09d_APPLY_ME_soa_entries.sql`
- Test: `tests/unit/soa/table-shape.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.soa_entries` with columns `document_id, annex_code, annex_group, title, description, applicable, justification, notes, standard, annex, source_sheet, source_row, source_sha256, imported_at`. Tasks 3 and 4 write and read it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/soa/table-shape.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260909000003_soa_entries.sql'),
  'utf8',
);

/** The body of a named CHECK constraint, so an assertion cannot pass on an unrelated one. */
function constraintBody(name: string): string {
  const m = sql.match(new RegExp(`ADD CONSTRAINT ${name} CHECK \\(([\\s\\S]*?)\\);`));
  expect(m, `constraint ${name} must exist`).toBeTruthy();
  return m![1];
}

describe('the SoA is stored as declarations, not as prose', () => {
  it('keys on (document_id, annex_code) so a new SoA lands beside the old one', () => {
    // A Statement of Applicability is a dated declaration. The previous one is
    // evidence of what was declared then, so nothing is updated in place.
    expect(sql).toMatch(/PRIMARY KEY \(document_id, annex_code\)/i);
  });

  it('stores applicability as a boolean, because there is no third state', () => {
    expect(sql).toMatch(/applicable\s+boolean\s+not null/i);
  });

  it('refuses a declaration with no justification', () => {
    // A control declared applicable or not applicable without a reason is not a
    // declaration. Measured: 142 of 142 rows in the source carry one.
    expect(sql).toMatch(/justification\s+text\s+not null/i);
  });

  it('constrains standard and annex to the values that exist', () => {
    const std = constraintBody('soa_entries_standard_known');
    expect(std).toContain("'iso27001:2022'");
    expect(std).toContain("'iso27701:2019'");
    const annex = constraintBody('soa_entries_annex_known');
    expect(annex).toContain("'A'");
    expect(annex).toContain("'B'");
  });

  it('keeps the sheet and row a value came from', () => {
    // Traceability to the cell a person typed in is what makes an answer
    // defensible to an auditor rather than merely produced.
    expect(sql).toMatch(/source_sheet\s+text\s+not null/i);
    expect(sql).toMatch(/source_row\s+integer\s+not null/i);
  });

  it('records the hash of the file each row came from', () => {
    // The guard compares this against the file in storage, so a SoA edited in
    // place fails the next import loudly rather than importing over itself.
    expect(sql).toMatch(/source_sha256\s+text\s+not null/i);
  });

  it('enables row level security, like every other table in this spine', () => {
    expect(sql).toMatch(/ALTER TABLE public\.soa_entries\s+ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/CREATE POLICY .* ON public\.soa_entries/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/soa/table-shape.test.ts")`

Expected: FAIL — `ENOENT`, the migration does not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260909000003_soa_entries.sql`:

```sql
-- Migration 20260909000003: the Statement of Applicability, as rows.
--
-- The SoA is the most authoritative artefact the ISMS produces and nothing read
-- it. It was chunked into prose for retrieval, and even that failed silently:
-- measured 2026-09-09, 22 xlsx documents record 834 chunks between them and hold
-- none. So the declared axis of the product's posture has been invisible to
-- every assessment ever run.
--
-- One row per control: whether it applies, and the justification a person wrote.
-- Composed with annex_control_mappings, these produce posture at SCF level with
-- no retrieval at all.

CREATE TABLE IF NOT EXISTS public.soa_entries (
  document_id   bigint  NOT NULL REFERENCES public.compliance_documents(id) ON DELETE CASCADE,
  annex_code    text    NOT NULL,

  annex_group   text    NOT NULL,
  title         text    NOT NULL,
  description   text    NULL,

  applicable    boolean NOT NULL,
  justification text    NOT NULL,
  notes         text    NULL,

  standard      text    NOT NULL,
  annex         text    NOT NULL,

  source_sheet  text    NOT NULL,
  source_row    integer NOT NULL,
  -- The sha256 of the file this row was read from. The guard in
  -- src/lib/soa/source.ts compares it against the file in storage, so a SoA
  -- edited in place fails the next import loudly instead of importing over
  -- itself. Same value on every row of one import; denormalised on purpose so
  -- the guard needs no second table.
  source_sha256 text    NOT NULL,
  imported_at   timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (document_id, annex_code)
);

-- document_id is in the key on purpose. A Statement of Applicability is a dated
-- declaration; the previous one is evidence of what was declared then. A new SoA
-- imports alongside rather than over.

-- applicable is a boolean because there is no third state, and justification is
-- NOT NULL because a declaration without a reason is not one. Measured in the
-- source: 142 of 142 rows carry both, so neither constraint costs anything today
-- and both prevent a silent gap later.

ALTER TABLE public.soa_entries
  DROP CONSTRAINT IF EXISTS soa_entries_standard_known;
ALTER TABLE public.soa_entries
  ADD CONSTRAINT soa_entries_standard_known CHECK (
    standard IN ('iso27001:2022', 'iso27701:2019')
  );

ALTER TABLE public.soa_entries
  DROP CONSTRAINT IF EXISTS soa_entries_annex_known;
ALTER TABLE public.soa_entries
  ADD CONSTRAINT soa_entries_annex_known CHECK (
    annex IN ('A', 'B')
  );

CREATE INDEX IF NOT EXISTS soa_entries_applicable_idx
  ON public.soa_entries (document_id, applicable);
CREATE INDEX IF NOT EXISTS soa_entries_standard_idx
  ON public.soa_entries (standard, annex);

COMMENT ON TABLE public.soa_entries IS
  'One row per control the Ionic ISMS declares, from the Statement of '
  'Applicability: whether it applies and why. The declared axis of posture, '
  'read together with the practised axis (evidence documents) and the observed '
  'axis (runtime_control_signals). Never derived -- every row is a person''s '
  'written decision, traceable to a sheet and a row number.';

COMMENT ON COLUMN public.soa_entries.annex_code IS
  'The control identifier as the SoA writes it: A.5.1 for ISO 27001:2022 Annex '
  'A, A.7.2.1 for ISO 27701 Annex A, B.8.2.1 for ISO 27701 Annex B. Joins to '
  'annex_control_mappings.annex_code for the A ones; the crosswalk holds no B '
  'codes, which is a known and reported gap.';

ALTER TABLE public.soa_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS soa_entries_read ON public.soa_entries;
CREATE POLICY soa_entries_read ON public.soa_entries
  FOR SELECT TO authenticated USING (true);
```

Copy the same statements to `docs/sql/2026-09-09d_APPLY_ME_soa_entries.sql`, preceded by one header line:

```sql
-- Mirrors: supabase/migrations/20260909000003_soa_entries.sql
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/soa/table-shape.test.ts")`

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260909000003_soa_entries.sql docs/sql/2026-09-09d_APPLY_ME_soa_entries.sql tests/unit/soa/table-shape.test.ts
git commit -m "$(cat <<'EOF'
feat(db): 20260909000003 -- the Statement of Applicability, as rows

The SoA is the most authoritative artefact the ISMS produces and nothing read
it. It was chunked into prose for retrieval and even that failed silently, so
the declared axis of posture has been invisible to every assessment ever run.

One row per control: whether it applies, and the justification a person wrote.
applicable is a boolean because there is no third state; justification is NOT
NULL because a declaration without a reason is not one. Measured in the source:
142 of 142 rows carry both, so neither constraint costs anything today.

document_id is in the primary key so a new SoA lands beside the old one rather
than over it. A Statement of Applicability is a dated declaration and the
previous one is evidence of what was declared then.

source_sheet and source_row are kept so any row traces back to the cell a person
typed it in -- which is what makes an answer defensible rather than produced.
EOF
)"
```

---

### Task 2: The row parser

The judgement of this plan, isolated into a pure function over already-read rows so it can be tested without a file, a network or a database.

**Files:**
- Create: `src/lib/soa/parse.ts`
- Test: `tests/unit/soa/parse.test.ts`

**Interfaces:**
- Consumes: `editionOf` from `@/lib/annex/edition` (built by the sibling project), signature `editionOf(annexCode: string): 'iso27001:2022' | 'iso27701:2019' | null`.
- Produces:
  ```typescript
  export interface SoaSheetSpec {
    sheetName: string;
    standard: 'iso27001:2022' | 'iso27701:2019';
    annex: 'A' | 'B';
  }
  export interface SoaEntry {
    annexCode: string;
    annexGroup: string;
    title: string;
    description: string | null;
    applicable: boolean;
    justification: string;
    notes: string | null;
    standard: 'iso27001:2022' | 'iso27701:2019';
    annex: 'A' | 'B';
    sourceSheet: string;
    sourceRow: number;
  }
  export const CONTROL_SHEETS: SoaSheetSpec[];
  export function parseSoaSheet(rows: unknown[][], spec: SoaSheetSpec): SoaEntry[];
  ```
  Task 3 calls `parseSoaSheet` once per entry in `CONTROL_SHEETS`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/soa/parse.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSoaSheet, CONTROL_SHEETS, type SoaSheetSpec } from '@/lib/soa/parse';

const A27001: SoaSheetSpec = {
  sheetName: 'Controls (Annex A) -  27001',
  standard: 'iso27001:2022',
  annex: 'A',
};
const A27701: SoaSheetSpec = {
  sheetName: 'Controls (Annex A) - 27701',
  standard: 'iso27701:2019',
  annex: 'A',
};
const B27701: SoaSheetSpec = {
  sheetName: 'Controls (Annex B) - 27701',
  standard: 'iso27701:2019',
  annex: 'B',
};

/** A sheet as SheetJS returns it with header:1 — a title row, a header row, then data. */
function sheet(dataRows: unknown[][]): unknown[][] {
  return [
    ['Statement of Applicability'],
    ['Annex', 'Number', 'Title', 'Description', 'Applicability', 'Justification', 'Notes'],
    ...dataRows,
  ];
}

describe('parsing one SoA control sheet', () => {
  it('reads a row into a typed declaration', () => {
    const out = parseSoaSheet(
      sheet([
        ['Annex A.5: Organizational Controls', 'A.5.1', 'Information Security Policies',
         'The information security policy...', 'Applicable', 'Policies are defined.', 'n/a'],
      ]),
      A27001,
    );
    expect(out).toEqual([{
      annexCode: 'A.5.1',
      annexGroup: 'Annex A.5: Organizational Controls',
      title: 'Information Security Policies',
      description: 'The information security policy...',
      applicable: true,
      justification: 'Policies are defined.',
      notes: 'n/a',
      standard: 'iso27001:2022',
      annex: 'A',
      sourceSheet: 'Controls (Annex A) -  27001',
      sourceRow: 3,
    }]);
  });

  it('reads Not Applicable as false, keeping its justification', () => {
    // A control declared not applicable is a decision with a reason, not an
    // absence. Three of the 93 in the real sheet are exactly this.
    const out = parseSoaSheet(
      sheet([['Annex A.8', 'A.8.34', 'Protection during audit', 'desc',
              'Not Applicable', 'No audit tooling touches production.', '']]),
      A27001,
    );
    expect(out[0].applicable).toBe(false);
    expect(out[0].justification).toBe('No audit tooling touches production.');
  });

  it('binds columns by header name, not by position', () => {
    // Document 392 has seven columns with the code in B; document 507 has eight,
    // an extra ID column pushing it to C. Same headers, different letters.
    const withExtraIdColumn: unknown[][] = [
      ['Statement of Applicability'],
      ['Annex', 'ID', 'Number', 'Title', 'Description', 'Applicability', 'Justification', 'Notes'],
      ['Annex A.5', '1', 'A.5.1', 'Policies', 'desc', 'Applicable', 'because', ''],
    ];
    const out = parseSoaSheet(withExtraIdColumn, A27001);
    expect(out[0].annexCode).toBe('A.5.1');
    expect(out[0].title).toBe('Policies');
  });

  it('finds the header row by content, wherever it sits', () => {
    const out = parseSoaSheet(
      [
        ['IONIC Health'],
        [],
        ['Annex', 'Number', 'Title', 'Description', 'Applicability', 'Justification', 'Notes'],
        ['g', 'A.5.1', 't', 'd', 'Applicable', 'j', ''],
      ],
      A27001,
    );
    expect(out).toHaveLength(1);
    expect(out[0].sourceRow).toBe(4);
  });

  it('throws when the header carries no Applicability column', () => {
    // A silently skipped sheet is how 18 Annex B controls would disappear.
    expect(() =>
      parseSoaSheet([['Annex', 'Number', 'Title'], ['g', 'A.5.1', 't']], A27001),
    ).toThrow(/header/i);
  });

  it('throws on an applicability value it does not recognise', () => {
    expect(() =>
      parseSoaSheet(sheet([['g', 'A.5.1', 't', 'd', 'Partially', 'j', '']]), A27001),
    ).toThrow(/A\.5\.1/);
  });

  it('throws on a row with no justification', () => {
    expect(() =>
      parseSoaSheet(sheet([['g', 'A.5.1', 't', 'd', 'Applicable', '', '']]), A27001),
    ).toThrow(/A\.5\.1/);
  });

  it('cross-checks an Annex A code against the sibling classifier', () => {
    // The sheet says which standard it holds; editionOf says which standard the
    // id belongs to. When they disagree, a control is filed in the wrong sheet
    // and the import must stop rather than record it under the wrong standard.
    expect(() =>
      parseSoaSheet(sheet([['g', 'A.7.2.1', 't', 'd', 'Applicable', 'j', '']]), A27001),
    ).toThrow(/A\.7\.2\.1/);

    // The same id in its own sheet is fine.
    const ok = parseSoaSheet(sheet([['g', 'A.7.2.1', 't', 'd', 'Applicable', 'j', '']]), A27701);
    expect(ok[0].standard).toBe('iso27701:2019');
  });

  it('accepts B codes only on the Annex B sheet', () => {
    const ok = parseSoaSheet(sheet([['g', 'B.8.2.1', 't', 'd', 'Applicable', 'j', '']]), B27701);
    expect(ok[0].annexCode).toBe('B.8.2.1');
    expect(ok[0].annex).toBe('B');

    expect(() =>
      parseSoaSheet(sheet([['g', 'B.8.2.1', 't', 'd', 'Applicable', 'j', '']]), A27001),
    ).toThrow(/B\.8\.2\.1/);
  });

  it('skips rows whose code cell is not a control id', () => {
    // Real sheets carry section banners and trailing blanks between control rows.
    const out = parseSoaSheet(
      sheet([
        ['Annex A.5: Organizational Controls', '', '', '', '', '', ''],
        ['g', 'A.5.1', 't', 'd', 'Applicable', 'j', ''],
        [],
      ]),
      A27001,
    );
    expect(out).toHaveLength(1);
  });

  it('names the three control sheets, with the double space the file really has', () => {
    expect(CONTROL_SHEETS.map((s) => s.sheetName)).toEqual([
      'Controls (Annex A) -  27001',
      'Controls (Annex A) - 27701',
      'Controls (Annex B) - 27701',
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/soa/parse.test.ts")`

Expected: FAIL — cannot resolve `@/lib/soa/parse`.

- [ ] **Step 3: Write the parser**

Create `src/lib/soa/parse.ts`:

```typescript
// Turning one Statement of Applicability worksheet into typed declarations.
//
// Every decision this file makes is a refusal to guess. A row it cannot read
// stops the import; the one thing worse than a missing control is a control
// silently assumed applicable.

import { editionOf } from '@/lib/annex/edition';

export type SoaStandard = 'iso27001:2022' | 'iso27701:2019';

export interface SoaSheetSpec {
  sheetName: string;
  standard: SoaStandard;
  annex: 'A' | 'B';
}

export interface SoaEntry {
  annexCode: string;
  annexGroup: string;
  title: string;
  description: string | null;
  applicable: boolean;
  justification: string;
  notes: string | null;
  standard: SoaStandard;
  annex: 'A' | 'B';
  sourceSheet: string;
  sourceRow: number;
}

/**
 * The three sheets that hold controls, by name.
 *
 * Selection is by NAME and not by header shape, because the two "Mandatory
 * Requirements" sheets carry the same Applicability and Justification headers
 * and are deliberately out of scope.
 *
 * The first name really does contain two spaces after the dash. Comparison
 * normalises whitespace so a later tidy-up of the file does not break the
 * import, but the literal is written as it is so a reader sees the truth.
 */
export const CONTROL_SHEETS: SoaSheetSpec[] = [
  { sheetName: 'Controls (Annex A) -  27001', standard: 'iso27001:2022', annex: 'A' },
  { sheetName: 'Controls (Annex A) - 27701', standard: 'iso27701:2019', annex: 'A' },
  { sheetName: 'Controls (Annex B) - 27701', standard: 'iso27701:2019', annex: 'B' },
];

/** Whitespace-insensitive sheet-name comparison. */
export function sameSheetName(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  return norm(a) === norm(b);
}

const HEADERS = {
  group: 'annex',
  code: 'number',
  title: 'title',
  description: 'description',
  applicable: 'applicability',
  justification: 'justification',
  notes: 'notes',
} as const;

function cell(row: unknown[], index: number | undefined): string {
  if (index === undefined) return '';
  const v = row[index];
  return v === null || v === undefined ? '' : String(v).trim();
}

/** A control id: A.5.1, A.7.2.1 or B.8.2.1. Anything else is not a control row. */
const CONTROL_ID = /^[AB]\.\d+(\.\d+){1,2}$/;

export function parseSoaSheet(rows: unknown[][], spec: SoaSheetSpec): SoaEntry[] {
  // Find the header by content. It is not on row 1 in the real file, and its
  // position differs between SoA documents.
  let headerIndex = -1;
  let columns: Record<string, number> = {};

  for (let i = 0; i < rows.length; i++) {
    const map: Record<string, number> = {};
    (rows[i] ?? []).forEach((v, j) => {
      const key = String(v ?? '').trim().toLowerCase();
      if (key) map[key] = j;
    });
    if (map[HEADERS.applicable] !== undefined && map[HEADERS.justification] !== undefined) {
      headerIndex = i;
      columns = map;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error(
      `sheet "${spec.sheetName}": no header row carrying both ` +
        `"${HEADERS.applicable}" and "${HEADERS.justification}". Refusing to guess ` +
        `the layout — a silently skipped sheet is how controls disappear.`,
    );
  }

  const out: SoaEntry[] = [];

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const annexCode = cell(row, columns[HEADERS.code]);

    // Section banners and blank separators are real and expected.
    if (!CONTROL_ID.test(annexCode)) continue;

    const sourceRow = i + 1; // 1-based, as a spreadsheet shows it

    // The sheet declares its standard; the id declares its own. When they
    // disagree, a control is filed in the wrong sheet.
    if (spec.annex === 'A') {
      const fromId = editionOf(annexCode);
      if (fromId === null) {
        throw new Error(
          `${spec.sheetName} row ${sourceRow}: "${annexCode}" is not an Annex A id ` +
            `of either edition.`,
        );
      }
      if (fromId !== spec.standard) {
        throw new Error(
          `${spec.sheetName} row ${sourceRow}: "${annexCode}" belongs to ${fromId}, ` +
            `but this sheet holds ${spec.standard}.`,
        );
      }
    } else if (!annexCode.startsWith('B.')) {
      throw new Error(
        `${spec.sheetName} row ${sourceRow}: "${annexCode}" is not an Annex B id.`,
      );
    }

    const rawApplicable = cell(row, columns[HEADERS.applicable]);
    let applicable: boolean;
    if (/^applicable$/i.test(rawApplicable)) applicable = true;
    else if (/^not applicable$/i.test(rawApplicable)) applicable = false;
    else {
      throw new Error(
        `${spec.sheetName} row ${sourceRow} (${annexCode}): applicability ` +
          `"${rawApplicable}" is neither Applicable nor Not Applicable.`,
      );
    }

    const justification = cell(row, columns[HEADERS.justification]);
    if (!justification) {
      throw new Error(
        `${spec.sheetName} row ${sourceRow} (${annexCode}): no justification. ` +
          `A declaration without a reason is not a declaration.`,
      );
    }

    const description = cell(row, columns[HEADERS.description]);
    const notes = cell(row, columns[HEADERS.notes]);

    out.push({
      annexCode,
      annexGroup: cell(row, columns[HEADERS.group]),
      title: cell(row, columns[HEADERS.title]),
      description: description || null,
      applicable,
      justification,
      notes: notes || null,
      standard: spec.standard,
      annex: spec.annex,
      sourceSheet: spec.sheetName,
      sourceRow,
    });
  }

  return out;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/soa/parse.test.ts")`

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/soa/parse.ts tests/unit/soa/parse.test.ts
git commit -m "$(cat <<'EOF'
feat(soa): parse one Statement of Applicability sheet into declarations

Columns bind by header name, never by letter: document 392 has seven columns
with the code in B, document 507 has eight with an extra ID column pushing it to
C. Same headers, different positions -- found by writing a reader against one
and watching it return zero rows from the other.

Sheet selection is by name rather than by header shape, because the two
Mandatory Requirements sheets carry the same Applicability and Justification
headers and are deliberately out of scope. The first control sheet's name really
does contain two spaces after the dash; comparison normalises whitespace so a
tidy-up of the file cannot break the import.

Every unreadable row throws with the control id in the message: an unrecognised
applicability, a missing justification, an Annex A id whose edition disagrees
with the sheet it sits in. The one thing worse than a missing control is a
control silently assumed applicable.
EOF
)"
```

---

### Task 3: The import, and two guards on a hardcoded id

**Files:**
- Create: `scripts/import-soa.ts`
- Test: `tests/unit/soa/source-guards.test.ts`

**Interfaces:**
- Consumes: `parseSoaSheet`, `CONTROL_SHEETS`, `sameSheetName`, `SoaEntry` from `@/lib/soa/parse` (Task 2); the table from Task 1.
- Produces: rows in `soa_entries`. Task 4 reads them.

- [ ] **Step 1: Write the failing test**

The guards are the testable judgement here; the download and the upsert are plumbing. Create `tests/unit/soa/source-guards.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { checkSoaSource, SOA_DOCUMENT_ID } from '@/lib/soa/source';

describe('the hardcoded SoA document fails loudly rather than going stale', () => {
  it('names document 392', () => {
    // The product owner chose a hardcoded id on 2026-09-09, over a marker a
    // person maintains and an automatic newest-year rule. The cost -- a 2027 SoA
    // going unnoticed -- was raised and accepted, so the guards below make it
    // loud instead of silent.
    expect(SOA_DOCUMENT_ID).toBe(392);
  });

  it('passes when the document is present and nothing newer exists', () => {
    expect(
      checkSoaSource(
        { id: 392, year: 2026, sha256: 'abc' },
        [{ id: 494, year: 2025 }, { id: 507, year: 2025 }],
        'abc',
      ),
    ).toEqual([]);
  });

  it('fails when the file changed under the constant', () => {
    const problems = checkSoaSource(
      { id: 392, year: 2026, sha256: 'abc' },
      [],
      'def',
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/hash/i);
  });

  it('fails when a later-year SoA exists, and does not adopt it', () => {
    const problems = checkSoaSource(
      { id: 392, year: 2026, sha256: 'abc' },
      [{ id: 700, year: 2027 }],
      'abc',
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/700/);
    expect(problems[0]).toMatch(/2027/);
  });

  it('accepts a first import, when no hash has been recorded yet', () => {
    expect(checkSoaSource({ id: 392, year: 2026, sha256: null }, [], 'abc')).toEqual([]);
  });

  it('reports both problems at once rather than stopping at the first', () => {
    const problems = checkSoaSource(
      { id: 392, year: 2026, sha256: 'abc' },
      [{ id: 700, year: 2027 }],
      'def',
    );
    expect(problems).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/soa/source-guards.test.ts")`

Expected: FAIL — cannot resolve `@/lib/soa/source`.

- [ ] **Step 3: Write the guards**

Create `src/lib/soa/source.ts`:

```typescript
// Which Statement of Applicability counts, and how that stops being true.
//
// The product owner chose a hardcoded document id on 2026-09-09, over a marker a
// person maintains and an automatic newest-year rule. Five documents in the
// system call themselves a SoA, all published, all version 1.0, none marked
// superseded; only 392 covers both standards and all three annexes.
//
// The cost was raised and accepted: a 2027 SoA would not be picked up. So the
// hardcode is made loud. Neither guard adopts a replacement -- changing the
// constant stays a human act, which is the property the owner chose.

export const SOA_DOCUMENT_ID = 392;

export interface SoaSourceRow {
  id: number;
  year: number | null;
  /** Hash recorded at the last import; null before the first one. */
  sha256: string | null;
}

export interface OtherSoaRow {
  id: number;
  year: number | null;
}

/**
 * Returns every reason the configured source can no longer be trusted.
 * Empty means proceed. All problems are returned, not just the first — an
 * operator fixing one at a time learns about the next one a run later.
 */
export function checkSoaSource(
  configured: SoaSourceRow,
  otherSoaDocuments: OtherSoaRow[],
  currentSha256: string,
): string[] {
  const problems: string[] = [];

  if (configured.sha256 !== null && configured.sha256 !== currentSha256) {
    problems.push(
      `document ${configured.id} changed under the constant: recorded hash ` +
        `${configured.sha256}, file now hashes to ${currentSha256}. Re-import ` +
        `deliberately, or restore the file.`,
    );
  }

  const configuredYear = configured.year ?? 0;
  for (const other of otherSoaDocuments) {
    if ((other.year ?? 0) > configuredYear) {
      problems.push(
        `document ${other.id} is a SoA for year ${other.year}, later than the ` +
          `configured document ${configured.id} (${configured.year}). It is NOT ` +
          `adopted automatically — a person decides which SoA counts.`,
      );
    }
  }

  return problems;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run tests/unit/soa/source-guards.test.ts")`

Expected: PASS, 6 tests.

- [ ] **Step 5: Write the import script**

Create `scripts/import-soa.ts`:

```typescript
// Operator script: read the Statement of Applicability into soa_entries.
//
//   npx tsx scripts/import-soa.ts --dry-run
//   npx tsx scripts/import-soa.ts
//
// Downloads the configured SoA from the compliance_documents bucket, parses its
// three control sheets, and writes one row per control. The two guards in
// src/lib/soa/source.ts stop the run when the file changed or a later SoA
// appeared; neither picks a replacement.

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

import { createHash } from 'node:crypto';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 200;

async function main() {
  const XLSX = await import('xlsx');
  const { parseSoaSheet, CONTROL_SHEETS, sameSheetName } = await import('../src/lib/soa/parse');
  const { checkSoaSource, SOA_DOCUMENT_ID } = await import('../src/lib/soa/source');
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const db = createAdminClient() as never as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: unknown) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
        neq: (col: string, v: unknown) => PromiseLike<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
      };
      upsert: (rows: Array<Record<string, unknown>>, o: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
    };
    storage: {
      from: (b: string) => { download: (p: string) => Promise<{ data: Blob | null; error: { message: string } | null }> };
    };
  };

  const { data: doc, error: docError } = await db
    .from('compliance_documents')
    .select('id, year, filepath, title')
    .eq('id', SOA_DOCUMENT_ID)
    .maybeSingle();
  if (docError) throw new Error(`compliance_documents: ${docError.message}`);
  if (!doc) throw new Error(`document ${SOA_DOCUMENT_ID} does not exist. A person must choose another SoA and change the constant.`);

  console.log(`source: [${doc.id}] ${String(doc.title)}`);

  const { data: blob, error: dlError } = await db.storage
    .from('compliance_documents')
    .download(String(doc.filepath));
  if (dlError || !blob) throw new Error(`download failed: ${dlError?.message ?? 'no data'}`);
  const buffer = Buffer.from(await blob.arrayBuffer());
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  console.log(`file: ${buffer.length} bytes, sha256 ${sha256.slice(0, 16)}…`);

  const { data: others, error: othersError } = await db
    .from('compliance_documents')
    .select('id, year, doc_type')
    .neq('id', SOA_DOCUMENT_ID);
  if (othersError) throw new Error(`compliance_documents: ${othersError.message}`);
  const otherSoa = (others ?? [])
    .filter((r) => String(r.doc_type) === 'soa')
    .map((r) => ({ id: Number(r.id), year: r.year === null ? null : Number(r.year) }));

  // The recorded hash lives on the rows this script wrote last time.
  // One row is enough: every row of an import carries the same hash. NOT
  // .maybeSingle() — that errors when more than one row matches, and after the
  // first import there are 142.
  const { data: prior } = await db
    .from('soa_entries')
    .select('source_sha256')
    .eq('document_id', SOA_DOCUMENT_ID)
    .order('annex_code')
    .range(0, 0);
  const recorded = (prior ?? [])[0]?.source_sha256 as string | undefined ?? null;

  const problems = checkSoaSource(
    { id: Number(doc.id), year: doc.year === null ? null : Number(doc.year), sha256: recorded },
    otherSoa,
    sha256,
  );
  if (problems.length > 0) {
    console.error('\nREFUSING TO IMPORT:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const wb = XLSX.read(buffer, { type: 'buffer' });
  console.log(`sheets: ${wb.SheetNames.join(' | ')}\n`);

  const entries = [];
  for (const spec of CONTROL_SHEETS) {
    const actual = wb.SheetNames.find((n) => sameSheetName(n, spec.sheetName));
    if (!actual) {
      throw new Error(
        `sheet "${spec.sheetName}" is missing from the workbook. Refusing to ` +
          `import a partial SoA — a skipped sheet is a set of controls that ` +
          `silently do not exist.`,
      );
    }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[actual], {
      header: 1,
      blankrows: true,
      defval: '',
    }) as unknown[][];
    const parsed = parseSoaSheet(rows, spec);
    console.log(`${spec.sheetName}: ${parsed.length} controls, ${parsed.filter((e) => e.applicable).length} applicable`);
    entries.push(...parsed);
  }

  console.log(`\ntotal: ${entries.length} controls, ${entries.filter((e) => e.applicable).length} applicable`);

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  const rows = entries.map((e) => ({
    document_id: SOA_DOCUMENT_ID,
    annex_code: e.annexCode,
    annex_group: e.annexGroup,
    title: e.title,
    description: e.description,
    applicable: e.applicable,
    justification: e.justification,
    notes: e.notes,
    standard: e.standard,
    annex: e.annex,
    source_sheet: e.sourceSheet,
    source_row: e.sourceRow,
    source_sha256: sha256,
  }));

  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db
      .from('soa_entries')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'document_id,annex_code' });
    if (error) throw new Error(`upsert soa_entries: ${error.message}`);
    console.log(`  wrote ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log('\ndone.');
}

main();
```

- [ ] **Step 6: Run the suite and the dry run**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run && npx tsc --noEmit 2>&1 | grep -c 'error TS'")`

Expected: tests PASS; error count 199 or lower.

Then: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx tsx scripts/import-soa.ts --dry-run")`

Expected, measured 2026-09-09:

```
Controls (Annex A) -  27001: 93 controls, 90 applicable
Controls (Annex A) - 27701: 31 controls, 29 applicable
Controls (Annex B) - 27701: 18 controls, 8 applicable

total: 142 controls, 127 applicable
```

If any of those six numbers differs, **stop and report it** rather than adjusting the parser to match. Either the file changed or the parser is wrong, and both need a person.

- [ ] **Step 7: Ask the user to apply the migration, then run the import for real**

The table does not exist until a person applies `docs/sql/2026-09-09d_APPLY_ME_soa_entries.sql`. Give them that path, wait, then run without `--dry-run` and report the written count.

- [ ] **Step 8: Commit**

```bash
git add scripts/import-soa.ts src/lib/soa/source.ts tests/unit/soa/source-guards.test.ts supabase/migrations/20260909000003_soa_entries.sql docs/sql/2026-09-09d_APPLY_ME_soa_entries.sql tests/unit/soa/table-shape.test.ts
git commit -m "$(cat <<'EOF'
feat(soa): import the Statement of Applicability, with guards on a hardcoded id

142 controls across three annex sheets, 127 applicable, each carrying the
justification a person wrote.

Which SoA counts was the owner's decision: document 392, hardcoded, over a
human-maintained marker and an automatic newest-year rule. Five documents call
themselves a SoA and only this one covers both standards and all three annexes.
The cost -- a 2027 SoA going unnoticed -- was raised and accepted, so the
hardcode is loud: the import refuses when the file's hash moved under the
constant, and refuses when a later-year SoA exists. Neither guard adopts a
replacement. Changing the constant stays a human act.

Both problems are reported together rather than one per run, because an operator
fixing them one at a time learns about the second a day later.

A missing sheet throws rather than importing a partial SoA. A skipped sheet is a
set of controls that silently do not exist.
EOF
)"
```

---

### Task 4: The coverage report

The spec's §3 requires the Annex B gap to be *visible*. This is what makes it so, and it is also the only end-to-end proof the import is right.

**Files:**
- Create: `scripts/soa-coverage.ts`
- Create: `docs/measurements/2026-09-09-soa-coverage.md` (written by running it)

**Interfaces:**
- Consumes: `soa_entries` (Task 3) and `annex_control_mappings` (built by the sibling project, columns `edition, annex_code, control_code, confidence`).
- Produces: a markdown measurement a person reads.

- [ ] **Step 1: Write the script**

No failing-test step: the deliverable is a measurement. Create `scripts/soa-coverage.ts`:

```typescript
// What the SoA declares, and how much of it reaches the SCF spine.
//
//   npx tsx scripts/soa-coverage.ts > docs/measurements/2026-09-09-soa-coverage.md
//
// The gap this exists to show: the proprietary crosswalk holds no Annex B
// codes, so applicable Annex B controls have no path to the spine. An applicable
// control with no mapping must read as UNMAPPED, never as absent from a
// denominator — that is the difference between "we do not claim this" and "we
// cannot say".

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

const PAGE = 1000;

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { SOA_DOCUMENT_ID } = await import('../src/lib/soa/source');
  const db = createAdminClient() as never as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: unknown) => {
          order: (c: string) => { range: (a: number, b: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }> };
        };
        order: (c: string) => {
          order: (c: string) => {
            order: (c: string) => { range: (a: number, b: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }> };
          };
        };
      };
    };
  };

  // Paged with .range() and a total ordering. annex_code is unique within one
  // document, so it alone totally orders soa_entries.
  const soa: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('soa_entries')
      .select('annex_code, applicable, standard, annex, title')
      .eq('document_id', SOA_DOCUMENT_ID)
      .order('annex_code')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`soa_entries: ${error.message}`);
    const rows = data ?? [];
    soa.push(...rows);
    if (rows.length < PAGE) break;
  }

  // The crosswalk's key is (edition, annex_code, control_code) — all three
  // order it totally.
  const mapped = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('annex_control_mappings')
      .select('annex_code, control_code, edition')
      .order('annex_code')
      .order('control_code')
      .order('edition')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`annex_control_mappings: ${error.message}`);
    const rows = data ?? [];
    for (const r of rows) {
      const k = String(r.annex_code);
      mapped.set(k, (mapped.get(k) ?? 0) + 1);
    }
    if (rows.length < PAGE) break;
  }

  const applicable = soa.filter((r) => r.applicable === true);
  const unmapped = applicable.filter((r) => !mapped.has(String(r.annex_code)));
  const links = applicable.reduce((a, r) => a + (mapped.get(String(r.annex_code)) ?? 0), 0);

  console.log('# Cobertura da SoA sobre a espinha SCF\n');
  console.log(`Documento: ${SOA_DOCUMENT_ID}  `);
  console.log(`Medido em: ${new Date().toISOString().slice(0, 10)}\n`);
  console.log('Um controle **aplicável sem mapeamento** e um controle **não aplicável** são');
  console.log('coisas diferentes. O primeiro é uma lacuna de cobertura: nós reivindicamos o');
  console.log('controle e não sabemos dizer a que ele corresponde no SCF. O segundo é uma');
  console.log('decisão registrada. Nenhum dos dois pode sumir de um denominador em silêncio.\n');

  console.log('## Por norma e anexo\n');
  console.log('| norma | anexo | controles | aplicáveis | aplicáveis sem mapeamento |');
  console.log('|---|---|---|---|---|');
  const groups = [...new Set(soa.map((r) => `${r.standard}|${r.annex}`))].sort();
  for (const g of groups) {
    const [std, ann] = g.split('|');
    const rows = soa.filter((r) => r.standard === std && r.annex === ann);
    const ap = rows.filter((r) => r.applicable === true);
    const un = ap.filter((r) => !mapped.has(String(r.annex_code)));
    console.log(`| ${std} | ${ann} | ${rows.length} | ${ap.length} | ${un.length} |`);
  }

  console.log(`\n## Total\n`);
  console.log(`| | |`);
  console.log(`|---|---|`);
  console.log(`| controles declarados | ${soa.length} |`);
  console.log(`| aplicáveis | ${applicable.length} |`);
  console.log(`| aplicáveis que alcançam o SCF | ${applicable.length - unmapped.length} |`);
  console.log(`| **aplicáveis SEM mapeamento** | **${unmapped.length}** |`);
  console.log(`| ligações SCF no total | ${links} |`);

  if (unmapped.length > 0) {
    console.log(`\n## Aplicáveis sem mapeamento\n`);
    console.log('Cada um destes é reivindicado pela Ionic e não tem caminho até a espinha.\n');
    console.log('| código | título |');
    console.log('|---|---|');
    for (const r of unmapped) console.log(`| \`${r.annex_code}\` | ${String(r.title).slice(0, 70)} |`);
  }
}

main();
```

- [ ] **Step 2: Run it and save the measurement**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && mkdir -p docs/measurements && npx tsx scripts/soa-coverage.ts > docs/measurements/2026-09-09-soa-coverage.md")`

Then read the file. Expected, measured 2026-09-09:

- 142 controles declarados, 127 aplicáveis
- 119 alcançam o SCF, **8 sem mapeamento** — todos do Anexo B do 27701
- 1,740 ligações a partir dos 90 aplicáveis do Anexo A do 27001

If the unmapped count is not 8, or any unmapped control is not a `B.` code, **stop and report it**: the two id sets were measured as identical, so a mismatch means one of the two imports is wrong.

- [ ] **Step 3: Run the full suite and the typecheck**

Run: `(cd /c/ && wsl.exe -d Ubuntu -- bash -lc "cd /home/resper/ihOS && npx vitest run && npx tsc --noEmit 2>&1 | grep -c 'error TS'")`

Expected: tests PASS; error count 199 or lower.

- [ ] **Step 4: Commit**

```bash
git add scripts/soa-coverage.ts docs/measurements/2026-09-09-soa-coverage.md
git commit -m "$(cat <<'EOF'
feat(soa): report what the SoA declares and how much of it reaches the spine

The design named the Annex B gap before anyone could be surprised by it; this is
what makes it visible. Of 127 applicable controls, 119 reach an SCF control
through the proprietary crosswalk and 8 do not -- the applicable half of ISO
27701 Annex B, for which the crosswalk holds no codes at all.

An applicable control with no mapping and a control declared not applicable are
different things, and the report keeps them apart. The first is a coverage gap:
we claim the control and cannot say what it corresponds to. The second is a
recorded decision. Neither may vanish from a denominator in silence.
EOF
)"
```

---

## Self-Review

**Spec coverage.** §1 what it builds → Tasks 1 and 3. §2 the source and its contents → Task 3's sheet selection and Step 6's expected numbers; the header-not-on-row-1 and moving-columns facts → Task 2's parser and its tests. §3 the Annex B gap → Task 4. §4 which SoA counts → Task 3's `SOA_DOCUMENT_ID` and both guards, tested in `source-guards.test.ts`. §5 the table → Task 1, including `source_sheet`/`source_row` traceability. §6 reading not chunking → Task 2 is pure over rows and Task 3 touches no chunk table; sheet selection by name with a loud failure on a missing sheet or header. §7 the ingestion defect → out of scope by design, and no task touches it. §8 exclusions → no task composes posture, reads the Mandatory Requirements sheets, or extends the crosswalk to Annex B. §9 failure modes → the hash guard (Task 3), header binding (Task 2), and the unmapped-not-absent rule (Task 4's report and its preamble). §10 success criterion → Task 4 Step 2.

**Placeholder scan.** None. An earlier draft introduced `source_sha256` in Task 3 and asked the implementer to go back and amend Task 1's migration, justified as "the column's reason only becomes visible once the guard exists". That was rationalisation: a plan that sends an implementer backwards through a completed, committed task is a plan with its decomposition in the wrong place. The column now lives in Task 1 with its reason in the comment.

**One defect this review caught.** Task 3's script read the recorded hash with `.maybeSingle()`, which errors when more than one row matches — and after the first import 142 rows match. It now reads one row with `.range(0, 0)` under a total order, with a comment saying why.

**Type consistency.** `SoaStandard` is defined in Task 2 and used by `SoaEntry` and `SoaSheetSpec` there; Task 3 maps `SoaEntry` fields to the column names Task 1 creates, one for one. `editionOf(annexCode): 'iso27001:2022' | 'iso27701:2019' | null` comes from the sibling project and is called only in Task 2, where its `null` is treated as a hard failure for Annex A sheets. `checkSoaSource(configured, otherSoaDocuments, currentSha256): string[]` and `SOA_DOCUMENT_ID` are defined in Task 3 and used in Tasks 3 and 4.

**One dependency worth naming.** This plan assumes `src/lib/annex/edition.ts` and the table `annex_control_mappings` exist — both were built and merged on 2026-09-09 by the sibling project. Task 2 imports the first; Task 4 reads the second. Neither is created here.
