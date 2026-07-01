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

export function resolveFileType(file: File): string | null {
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

  // txt, md, csv — read as UTF-8
  return await file.text();
}
