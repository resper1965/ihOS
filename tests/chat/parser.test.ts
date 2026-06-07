// tests/chat/parser.test.ts
// Unit tests for the questionnaire file parser (XLSX/CSV/PDF)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// XLSX mock — must be set up before importing the parser
// ---------------------------------------------------------------------------

const mockSheetToJson = vi.fn();
const mockXLSXRead = vi.fn();

vi.mock('xlsx', () => ({
  read: (...args: any[]) => mockXLSXRead(...args),
  utils: {
    sheet_to_json: (...args: any[]) => mockSheetToJson(...args),
    encode_cell: vi.fn(({ r, c }: { r: number; c: number }) => {
      const col = String.fromCharCode(65 + c);
      return `${col}${r + 1}`;
    }),
    decode_cell: vi.fn((ref: string) => {
      const c = ref.charCodeAt(0) - 65;
      const r = parseInt(ref.slice(1)) - 1;
      return { r, c };
    }),
    decode_range: vi.fn((ref: string) => {
      const parts = ref.split(':');
      return {
        s: { r: 0, c: 0 },
        e: { r: 100, c: 10 },
      };
    }),
    encode_range: vi.fn((range: any) => `A1:Z100`),
  },
  write: vi.fn(() => Buffer.from('mock-xlsx-output')),
}));

// ---------------------------------------------------------------------------
// Import parser after mocks
// ---------------------------------------------------------------------------

import { parseExcel, parsePDF, parseQuestionnaire } from '@/lib/chat/parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFakeWorkbook(sheets: Record<string, unknown[][]>) {
  const sheetNames = Object.keys(sheets);
  const Sheets: Record<string, any> = {};

  for (const name of sheetNames) {
    Sheets[name] = { '!ref': 'A1:Z100' }; // minimal sheet object
  }

  // Whenever sheet_to_json is called, return the matching data
  mockSheetToJson.mockImplementation((sheet: any, _opts: any) => {
    // Find sheet by reference in Sheets
    for (const name of sheetNames) {
      if (Sheets[name] === sheet) {
        return sheets[name];
      }
    }
    return [];
  });

  return { SheetNames: sheetNames, Sheets };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseExcel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: EN headers — 'Question' and 'Answer'
  it('detects EN headers "Question" and "Answer" correctly', () => {
    const rows = [
      ['ID', 'Question', 'Answer'],
      ['1', 'What is your data backup policy?', ''],
      ['2', 'How do you handle access control?', ''],
    ];

    const workbook = createFakeWorkbook({ Sheet1: rows });
    mockXLSXRead.mockReturnValue(workbook);

    const result = parseExcel(Buffer.from('fake'), 'test.xlsx');

    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].text).toBe('What is your data backup policy?');
    expect(result.questions[1].text).toBe('How do you handle access control?');
    expect(result.fileType).toBe('xlsx');
    expect(result.detectedHeaders).toContain('Question');
  });

  // Test 2: PT headers — 'Questão' and 'Resposta'
  it('detects PT headers "Questão" and "Resposta" correctly', () => {
    const rows = [
      ['ID', 'Questão', 'Resposta'],
      ['1', 'Qual é a política de backup?', ''],
      ['2', 'Como funciona o controle de acesso?', ''],
    ];

    const workbook = createFakeWorkbook({ Planilha1: rows });
    mockXLSXRead.mockReturnValue(workbook);

    const result = parseExcel(Buffer.from('fake'), 'questionario.xlsx');

    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].text).toBe('Qual é a política de backup?');
    expect(result.detectedHeaders).toContain('Questão');
  });

  // Test 3: Multiple sheets
  it('extracts questions from all sheets', () => {
    const sheet1Rows = [
      ['Question', 'Answer'],
      ['Q1 from sheet 1', ''],
    ];
    const sheet2Rows = [
      ['Question', 'Answer'],
      ['Q1 from sheet 2', ''],
      ['Q2 from sheet 2', ''],
    ];

    const workbook = createFakeWorkbook({
      Sheet1: sheet1Rows,
      Sheet2: sheet2Rows,
    });
    mockXLSXRead.mockReturnValue(workbook);

    const result = parseExcel(Buffer.from('fake'), 'multi.xlsx');

    expect(result.questions).toHaveLength(3);
    expect(result.sheetCount).toBe(2);
    expect(result.questions[0].sheetName).toBe('Sheet1');
    expect(result.questions[1].sheetName).toBe('Sheet2');
  });

  // Test 4: No recognisable header row → fallback to column 0
  it('falls back to column 0 when no header row is detected', () => {
    const rows = [
      ['First question text with no header', 'some value'],
      ['Second question text', 'another value'],
    ];

    const workbook = createFakeWorkbook({ Sheet1: rows });
    mockXLSXRead.mockReturnValue(workbook);

    const result = parseExcel(Buffer.from('fake'), 'noheader.xlsx');

    // With fallback, row 0 is treated as header, so data starts at row 1
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].text).toBe('Second question text');
  });

  // Test 5: Empty sheet → returns empty questions array
  it('returns empty questions for an empty sheet', () => {
    const workbook = createFakeWorkbook({ Sheet1: [] });
    mockXLSXRead.mockReturnValue(workbook);

    const result = parseExcel(Buffer.from('fake'), 'empty.xlsx');

    expect(result.questions).toHaveLength(0);
    expect(result.fileType).toBe('xlsx');
  });
});

describe('parseQuestionnaire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 6: Empty buffer → throws
  it('throws error for empty buffer', async () => {
    await expect(
      parseQuestionnaire(Buffer.alloc(0), 'test.xlsx'),
    ).rejects.toThrow('Cannot parse an empty file buffer.');
  });

  // Test 7: Empty filename → throws
  it('throws error for empty filename', async () => {
    await expect(
      parseQuestionnaire(Buffer.from('data'), ''),
    ).rejects.toThrow('File name is required');
  });

  // Test 8: Unsupported extension → throws
  it('throws error for unsupported file extension (.doc)', async () => {
    await expect(
      parseQuestionnaire(Buffer.from('data'), 'file.doc'),
    ).rejects.toThrow('Unsupported file type');
  });

  // Test 9: .xlsx routes to parseExcel
  it('routes .xlsx files to parseExcel', async () => {
    const rows = [
      ['Question', 'Answer'],
      ['Test question?', ''],
    ];
    const workbook = createFakeWorkbook({ Sheet1: rows });
    mockXLSXRead.mockReturnValue(workbook);

    const result = await parseQuestionnaire(Buffer.from('data'), 'test.xlsx');

    expect(result.fileType).toBe('xlsx');
    expect(mockXLSXRead).toHaveBeenCalled();
  });

  // Test 10: .pdf routes to parsePDF
  it('routes .pdf files to parsePDF', async () => {
    // pdf-parse is mocked globally in setup.ts; mock it to return text
    const { PDFParse } = await import('pdf-parse');
    (PDFParse as any).mockImplementation(function() {
      return {
        getText: vi.fn().mockResolvedValue({
          text: '1. What is your security policy?\n2. How do you manage access?',
        }),
        destroy: vi.fn().mockResolvedValue(undefined),
      };
    });

    const result = await parseQuestionnaire(Buffer.from('fake-pdf'), 'test.pdf');

    expect(result.fileType).toBe('pdf');
  });
});
