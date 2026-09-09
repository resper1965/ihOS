// src/lib/chat/document-extractor.ts
// Shared helper for document type resolution and text extraction.

const ACCEPTED_TYPES = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['text/plain', 'txt'],
  ['text/markdown', 'md'],
  ['text/csv', 'csv'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  // Common MIME aliases
  ['application/x-pdf', 'pdf'],
  ['text/x-markdown', 'md'],
]);

const EXTENSION_MAP: Record<string, string> = {
  '.pdf': 'pdf',
  '.txt': 'txt',
  '.md': 'md',
  '.csv': 'csv',
  '.docx': 'docx',
};

/**
 * Extensions we know we cannot read, checked before the MIME type.
 *
 * A caller can lie about the MIME — src/scripts/bulk-reindex-internal.ts
 * declared every non-PDF as text/plain, so this function answered 'txt' for a
 * spreadsheet and the extractor happily read the zip as UTF-8. The extension is
 * the one thing the caller did not invent, so it settles the question first.
 */
const REFUSED_EXTENSIONS = new Set([
  '.xlsx', '.xls', '.xlsm', '.pptx', '.ppt', '.doc', '.zip', '.rtf', '.odt', '.ods',
]);

export function resolveFileType(file: File): string | null {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (REFUSED_EXTENSIONS.has(extension)) return null;

  // Try MIME type first
  const fromMime = ACCEPTED_TYPES.get(file.type);
  if (fromMime) return fromMime;

  // Fallback to extension
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}

export async function extractText(file: File, fileType: string): Promise<string> {
  if (fileType === 'pdf') {
    // Polyfill missing browser DOM APIs required by newer pdfjs-dist
    if (typeof globalThis !== 'undefined') {
      if (!globalThis.DOMMatrix) (globalThis as any).DOMMatrix = class DOMMatrix {};
      if (!globalThis.ImageData) (globalThis as any).ImageData = class ImageData {};
      if (!globalThis.Path2D) (globalThis as any).Path2D = class Path2D {};
    }

    const arrayBuf = await file.arrayBuffer();
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(arrayBuf) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }

  if (fileType === 'docx') {
    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (fileType === 'txt' || fileType === 'md' || fileType === 'csv') {
    return await file.text();
  }

  // Anything else is refused, out loud.
  //
  // This used to fall through to file.text() for every unrecognised format,
  // which silently turned a binary into mojibake. Measured 2026-09-09 against a
  // real .xlsx Statement of Applicability: 45,276 characters returned, 38% of
  // them printable, beginning with the zip header PK\x03\x04 and
  // [Content_Types].xml. Nothing threw, so every caller believed it held a
  // document. 22 spreadsheets reached the database that way and every screen
  // reported chunk counts for text that was never text.
  //
  // Two callers pass `doc.file_format` straight through with no guard —
  // src/scripts/bulk-reindex-internal.ts and the reindex route — so this throw
  // is the only thing standing between an unreadable format and the index.
  throw new Error(
    `Cannot extract text from "${file.name}": no reader for format "${fileType}". ` +
      `Supported: pdf, docx, txt, md, csv.`,
  );
}
