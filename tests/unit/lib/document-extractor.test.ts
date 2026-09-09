// tests/unit/lib/document-extractor.test.ts
// The extractor must refuse a format it cannot read, out loud.

import { describe, it, expect } from 'vitest';
import { extractText, resolveFileType } from '@/lib/chat/document-extractor';

/** A real .xlsx is a zip. These are its first bytes. */
function xlsxLikeFile(name = 'Statement of Applicability.xlsx'): File {
  const zipHeader = new Uint8Array([
    0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00,
    0x00, 0x00, 0x21, 0x00, 0xc3, 0x9f, 0x8a, 0xd7, 0x24, 0xbb,
  ]);
  return new File([zipHeader], name, { type: 'text/plain' });
}

describe('extractText refuses what it cannot read', () => {
  it('throws on xlsx instead of returning the zip as text', async () => {
    // Measured 2026-09-09 against document 507, a real Statement of
    // Applicability: extractText returned 45,276 characters of which 38% were
    // printable — the zip header, [Content_Types].xml, and binary noise — and
    // threw nothing. Chunking that produced 2 chunks of mojibake. 22 documents
    // reached the database that way, and every screen believed they held text.
    await expect(extractText(xlsxLikeFile(), 'xlsx')).rejects.toThrow(/xlsx/i);
  });

  it('names the file in the error, so an operator can find it', async () => {
    await expect(
      extractText(xlsxLikeFile('Declaração de aplicabilidade.xlsx'), 'xlsx'),
    ).rejects.toThrow(/Declaração de aplicabilidade\.xlsx/);
  });

  it('throws on any format it does not implement, not only xlsx', async () => {
    for (const fmt of ['xls', 'pptx', 'zip', 'png', 'unknown', '']) {
      await expect(
        extractText(new File(['x'], `f.${fmt || 'none'}`), fmt),
        `format "${fmt}" must be refused`,
      ).rejects.toThrow();
    }
  });

  it('still reads the formats it does implement', async () => {
    const txt = await extractText(new File(['hello'], 'a.txt'), 'txt');
    expect(txt).toBe('hello');
    const md = await extractText(new File(['# h'], 'a.md'), 'md');
    expect(md).toBe('# h');
    const csv = await extractText(new File(['a,b'], 'a.csv'), 'csv');
    expect(csv).toBe('a,b');
  });

  it('does not let a mislabelled mime type turn a spreadsheet into text', () => {
    // src/scripts/bulk-reindex-internal.ts declared every non-PDF as
    // text/plain, so resolveFileType — the guard that would have returned null
    // for a spreadsheet — answered 'txt' instead. The extension is what settles
    // it when the mime is a lie.
    expect(resolveFileType(xlsxLikeFile())).toBeNull();
  });
});
