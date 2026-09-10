import { describe, it, expect } from 'vitest';
import { chunkCsvDocument } from '@/lib/chat/chunker';

/** A CSV whose body is long enough to force several chunks. */
function csv(rows: number): string {
  const header = 'Numero,Titulo,Aplicabilidade,Justificativa';
  const body = Array.from({ length: rows }, (_, i) =>
    `A.5.${i + 1},Politica numero ${i + 1},Aplicavel,Justificativa razoavelmente longa para ocupar espaco no chunk ${i + 1}`,
  );
  return [header, ...body].join('\n');
}

describe('a CSV chunk carries its own column names', () => {
  it('repeats the header at the top of every chunk', () => {
    // Without this, chunk 0 has the header and every later chunk is bare
    // values: "A.5.1,Politicas de seguranca,Aplicavel" with nothing saying
    // which column is which. On a RACI or an Annex A table, the column names
    // are the part that answers the question.
    const chunks = chunkCsvDocument(csv(200));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.content.startsWith('Numero,Titulo,Aplicabilidade,Justificativa')).toBe(true);
    }
  });

  it('does not duplicate the header inside the first chunk', () => {
    const chunks = chunkCsvDocument(csv(200));
    const occurrences = chunks[0].content.split('Numero,Titulo,Aplicabilidade,Justificativa').length - 1;
    expect(occurrences).toBe(1);
  });

  it('keeps every data row exactly once across all chunks', () => {
    // The header is repeated on purpose; data must not be.
    const chunks = chunkCsvDocument(csv(60));
    const body = chunks
      .map((c) => c.content.split('\n').slice(1).join('\n'))
      .join('\n');
    for (const n of [1, 30, 60]) {
      const row = `A.5.${n},Politica numero ${n},`;
      expect(body.split(row).length - 1, `row ${n}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('returns a single chunk with no repetition when the CSV is small', () => {
    const chunks = chunkCsvDocument('Col1,Col2\na,b\nc,d');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Col1,Col2\na,b\nc,d');
  });

  it('returns nothing for an empty or header-only CSV', () => {
    expect(chunkCsvDocument('')).toEqual([]);
    expect(chunkCsvDocument('   ')).toEqual([]);
    expect(chunkCsvDocument('Col1,Col2')).toEqual([]);
  });
});

describe('the format picks the chunker, in one place', () => {
  it('sends csv to the header-repeating chunker', async () => {
    const { chunkByFormat } = await import('@/lib/chat/chunker');
    const chunks = chunkByFormat(csv(200), 'csv');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1].content.startsWith('Numero,Titulo,Aplicabilidade,Justificativa')).toBe(true);
  });

  it('sends everything else to the compliance chunker', async () => {
    const { chunkByFormat, chunkComplianceDocument } = await import('@/lib/chat/chunker');
    const prose = 'Politica de seguranca. '.repeat(300);
    expect(chunkByFormat(prose, 'md')).toEqual(chunkComplianceDocument(prose));
    expect(chunkByFormat(prose, null)).toEqual(chunkComplianceDocument(prose));
  });
});
