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
