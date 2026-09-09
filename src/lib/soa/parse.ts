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
