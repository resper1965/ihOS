// src/lib/chat/parser.ts
// Robust file parser for GRC/compliance questionnaires (XLSX, CSV, PDF)

import * as XLSX from 'xlsx';
import { PDFParse } from 'pdf-parse';

import type {
  ExtractedQuestion,
  ParseResult,
  SupportedFileType,
} from '@/lib/chat/questionnaire-types';

// ── Header-detection patterns ────────────────────────────────────────────────

/** Patterns that indicate a column holds questions / requirements */
const QUESTION_PATTERNS: RegExp[] = [
  /^quest[ãa]o$/i,
  /^question$/i,
  /^pergunta$/i,
  /^requisito$/i,
  /^requirement$/i,
  /^controle?$/i,
  /^control$/i,
  /^control\s+question$/i,
  /^description$/i,
  /^descri[çc][ãa]o$/i,
  /^item$/i,
  /^crit[eé]rio$/i,
  /^criterion$/i,
  /^audit\s+question$/i,
  /^compliance\s+question$/i,
  /^security\s+requirement$/i,
  /^requisito\s+de\s+seguran[çc]a$/i,
];

/** Patterns that indicate a column holds answers / responses */
const ANSWER_PATTERNS: RegExp[] = [
  /^answer$/i,
  /^resposta$/i,
  /^response$/i,
  /^coment[áa]rios?$/i,
  /^comments?$/i,
  /^reply$/i,
  /^a[çc][ãa]o$/i,
  /^action$/i,
  /^evid[eê]ncia$/i,
  /^evidence$/i,
  /^observa[çc][ãa]o$/i,
  /^observation$/i,
  /^status$/i,
  /^compliance\s+status$/i,
  /^implementation\s+status$/i,
];

// ── Utility helpers ──────────────────────────────────────────────────────────

/**
 * Converts a 0-based column index to an Excel-style column letter (A, B, …, Z, AA, …).
 */
function colIndexToLetter(col: number): string {
  let result = '';
  let c = col;
  while (c >= 0) {
    result = String.fromCharCode((c % 26) + 65) + result;
    c = Math.floor(c / 26) - 1;
  }
  return result;
}

/**
 * Resolves the file type from the extension.
 */
function resolveFileType(fileName: string): SupportedFileType {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'xlsx':
    case 'xls':
      return 'xlsx';
    case 'csv':
      return 'csv';
    case 'pdf':
      return 'pdf';
    default:
      throw new Error(
        `Unsupported file type ".${ext}". Accepted types: .xlsx, .xls, .csv, .pdf`,
      );
  }
}

/**
 * Tests whether a header string matches any of the given patterns.
 */
function matchesPatterns(header: string, patterns: RegExp[]): boolean {
  const trimmed = header.trim();
  return patterns.some((p) => p.test(trimmed));
}

/**
 * Normalises a cell value to a non-empty string or `undefined`.
 */
function cellToString(val: unknown): string | undefined {
  if (val === null || val === undefined) return undefined;
  const s = String(val).trim();
  return s.length > 0 ? s : undefined;
}

// ── Excel / CSV parser ───────────────────────────────────────────────────────

/**
 * Parses an XLSX or CSV buffer and extracts questionnaire questions.
 *
 * The algorithm:
 * 1. For each sheet, convert to an array-of-arrays.
 * 2. Scan the first 10 rows looking for a "header row" that contains at
 *    least one column matching QUESTION_PATTERNS.
 * 3. Once found, identify the question column(s) and answer column.
 * 4. Iterate remaining rows extracting questions with cell coordinates.
 */
export function parseExcel(buffer: Buffer, fileName: string): ParseResult {
  const fileType = resolveFileType(fileName);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (err) {
    throw new Error(
      `Failed to read ${fileType.toUpperCase()} file "${fileName}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!workbook.SheetNames.length) {
    throw new Error(`The file "${fileName}" contains no sheets.`);
  }

  const allQuestions: ExtractedQuestion[] = [];
  let globalQuestionIdx = 0;

  // Track detection results from the first sheet that has headers
  let detectedHeaders: string[] | undefined;
  let answerColumnIndex: number | undefined;
  let answerColumnHeader: string | undefined;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Convert sheet to array-of-arrays (each row is an array of cell values)
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
    });

    if (rows.length === 0) continue;

    // ── Detect header row (scan first 10 rows) ──────────────────────────
    let headerRowIdx = -1;
    let questionColIdx = -1;
    let answerColIdx = -1;
    let headerRow: string[] = [];

    const scanLimit = Math.min(rows.length, 10);
    for (let r = 0; r < scanLimit; r++) {
      const row = rows[r];
      if (!row) continue;

      // Convert row cells to trimmed strings
      const cells = row.map((c) => cellToString(c) ?? '');

      // Look for a question column
      const qIdx = cells.findIndex((c) => matchesPatterns(c, QUESTION_PATTERNS));
      if (qIdx !== -1) {
        headerRowIdx = r;
        questionColIdx = qIdx;
        headerRow = cells;

        // Look for an answer column AFTER the question column
        for (let a = qIdx + 1; a < cells.length; a++) {
          if (matchesPatterns(cells[a], ANSWER_PATTERNS)) {
            answerColIdx = a;
            break;
          }
        }

        // If no answer column found by header matching, use the first empty
        // column immediately after the question column as a fallback
        if (answerColIdx === -1) {
          for (let a = qIdx + 1; a < cells.length; a++) {
            if (cells[a] === '') {
              answerColIdx = a;
              break;
            }
          }
        }

        break;
      }
    }

    // If no header row was detected, fall back to using the first column with
    // data as the question column (best-effort for poorly-structured files)
    if (headerRowIdx === -1) {
      headerRowIdx = 0;
      questionColIdx = 0;
      headerRow = (rows[0] ?? []).map((c) => cellToString(c) ?? '');
    }

    // Persist detection results from the first sheet
    if (detectedHeaders === undefined) {
      detectedHeaders = headerRow.filter((h) => h.length > 0);
      answerColumnIndex = answerColIdx !== -1 ? answerColIdx : undefined;
      answerColumnHeader =
        answerColIdx !== -1 ? headerRow[answerColIdx] : undefined;
    }

    // ── Extract questions from data rows ────────────────────────────────

    // Detect a "context" column: the column immediately before the question
    // column, if it exists and is not a question/answer column itself.
    const contextColIdx =
      questionColIdx > 0 &&
      !matchesPatterns(headerRow[questionColIdx - 1] ?? '', QUESTION_PATTERNS) &&
      !matchesPatterns(headerRow[questionColIdx - 1] ?? '', ANSWER_PATTERNS)
        ? questionColIdx - 1
        : -1;

    // Track the last non-empty context value (useful for category rows that
    // span multiple question rows)
    let lastContext: string | undefined;

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;

      const questionText = cellToString(row[questionColIdx]);
      if (!questionText) continue; // skip empty question rows

      // Update running context
      if (contextColIdx !== -1) {
        const ctx = cellToString(row[contextColIdx]);
        if (ctx) lastContext = ctx;
      }

      // Excel row numbers are 1-based; header occupies row (headerRowIdx + 1)
      const excelRow = r + 1; // +1 because array is 0-based but Excel is 1-based
      const colLetter = colIndexToLetter(questionColIdx);

      const question: ExtractedQuestion = {
        questionId: `q-${globalQuestionIdx++}`,
        text: questionText,
        context: lastContext,
        cellCoords: `${colLetter}${excelRow}`,
        sheetName,
        rowIndex: r,
      };

      allQuestions.push(question);
    }
  }

  return {
    questions: allQuestions,
    fileType,
    fileName,
    sheetCount: workbook.SheetNames.length,
    detectedHeaders,
    answerColumnIndex,
    answerColumnHeader,
  };
}

// ── PDF parser ───────────────────────────────────────────────────────────────

/**
 * Regex patterns used to identify "question-like" lines in PDF text:
 *
 * 1. Lines ending with a question mark
 * 2. Numbered items:  1.  /  1.1  /  1.1.1  /  1)  /  a)
 * 3. Lettered items:  a.  /  a)
 * 4. Roman numeral items: i.  /  ii.  /  iii)
 * 5. Bullet items followed by substantial text
 */
const PDF_QUESTION_PATTERNS: RegExp[] = [
  // Lines ending with "?"
  /^(.+\?)\s*$/,
  // Numbered: "1.", "1.1", "1.1.1", etc. – must be followed by text
  /^(\d+(?:\.\d+)*\.?\s+.{10,})$/,
  // Numbered with parenthesis: "1)", "12)"
  /^(\d+\)\s+.{10,})$/,
  // Lettered: "a.", "b.", "a)", "b)"
  /^([a-zA-Z][.)]\s+.{10,})$/,
  // Roman numeral items
  /^((?:i{1,3}|iv|vi{0,3}|ix|x{1,3})[.)]\s+.{10,})$/i,
];

/**
 * Parses a PDF buffer and extracts question-like lines.
 */
export async function parsePDF(
  buffer: Buffer,
  fileName: string,
): Promise<ParseResult> {
  let fullText: string;
  try {
    const pdf = new PDFParse({ data: new Uint8Array(buffer) });
    const textResult = await pdf.getText();
    fullText = textResult.text ?? '';
    await pdf.destroy();
  } catch (err) {
    throw new Error(
      `Failed to parse PDF "${fileName}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (fullText.trim().length === 0) {
    throw new Error(
      `The PDF "${fileName}" contains no extractable text. It may be scanned/image-based.`,
    );
  }

  // Split into lines and filter empties
  const lines: string[] = fullText
    .split(/\r?\n/)
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  const questions: ExtractedQuestion[] = [];
  let questionIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of PDF_QUESTION_PATTERNS) {
      const match = pattern.exec(line);
      if (match) {
        // Grab some context: the preceding non-empty line (if any)
        const context = i > 0 ? lines[i - 1] : undefined;

        questions.push({
          questionId: `q-${questionIdx++}`,
          text: (match[1] ?? line).trim(),
          context,
          rowIndex: i,
        });

        break; // only match once per line
      }
    }
  }

  return {
    questions,
    fileType: 'pdf',
    fileName,
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Parses a questionnaire file (XLSX, CSV or PDF) and returns structured questions.
 *
 * @param buffer  - Raw file contents as a Node Buffer
 * @param fileName - Original filename (used to detect type via extension)
 * @returns ParseResult with extracted questions and metadata
 *
 * @example
 * ```ts
 * const buffer = fs.readFileSync('questionnaire.xlsx');
 * const result = await parseQuestionnaire(buffer, 'questionnaire.xlsx');
 * console.log(result.questions.length); // number of extracted questions
 * ```
 */
export async function parseQuestionnaire(
  buffer: Buffer,
  fileName: string,
): Promise<ParseResult> {
  if (!buffer || buffer.length === 0) {
    throw new Error('Cannot parse an empty file buffer.');
  }

  if (!fileName || fileName.trim().length === 0) {
    throw new Error('File name is required to determine the file type.');
  }

  const fileType = resolveFileType(fileName);

  switch (fileType) {
    case 'xlsx':
    case 'csv':
      return parseExcel(buffer, fileName);
    case 'pdf':
      return parsePDF(buffer, fileName);
    default: {
      // Exhaustive check
      const _exhaustive: never = fileType;
      throw new Error(`Unhandled file type: ${_exhaustive}`);
    }
  }
}
