// tests/unit/posture/tag-evidence.test.ts
// document_chunks.scf_controls[] holds only codes the tagger classified as
// `implements` (src/lib/chat/scf-tagger.ts:146), so it is a stronger claim than
// prose similarity — and the posture engine ignored it entirely.

import { describe, it, expect } from 'vitest';
import {
  TAG_CONFIDENCE,
  rowsToTaggedChunks,
  indexByControl,
  tagProvenanceFor,
} from '@/lib/posture/tag-evidence';
import { MIN_EVIDENCE_SCORE } from '@/lib/posture/bind-evidence';

describe('TAG_CONFIDENCE', () => {
  it('clears the evidence floor, so a confirmed tag always becomes evidence', () => {
    expect(TAG_CONFIDENCE).toBeGreaterThan(MIN_EVIDENCE_SCORE);
    expect(TAG_CONFIDENCE).toBeLessThanOrEqual(1);
  });
});

describe('rowsToTaggedChunks', () => {
  it('maps database rows, coercing ids and truncating the snippet to 300 chars', () => {
    const long = 'x'.repeat(400);
    expect(
      rowsToTaggedChunks([
        { id: '7', document_id: '3', content: long, scf_controls: ['GOV-01', 'IAC-02'] },
      ]),
    ).toEqual([
      { chunkId: 7, documentId: 3, snippet: 'x'.repeat(300), controlCodes: ['GOV-01', 'IAC-02'] },
    ]);
  });

  it('drops rows whose scf_controls is empty, null or not an array', () => {
    const rows = [
      { id: 1, document_id: 1, content: 'a', scf_controls: [] },
      { id: 2, document_id: 1, content: 'a', scf_controls: null },
      { id: 3, document_id: 1, content: 'a' },
      { id: 4, document_id: 1, content: 'a', scf_controls: 'GOV-01' },
    ];
    expect(rowsToTaggedChunks(rows)).toEqual([]);
  });

  it('trims codes and drops empty ones without dropping the chunk', () => {
    expect(
      rowsToTaggedChunks([
        { id: 1, document_id: 2, content: 'c', scf_controls: [' GOV-01 ', '', 'IAC-02'] },
      ])[0].controlCodes,
    ).toEqual(['GOV-01', 'IAC-02']);
  });

  it('drops a chunk whose codes are all blank', () => {
    expect(
      rowsToTaggedChunks([{ id: 1, document_id: 2, content: 'c', scf_controls: ['', '  '] }]),
    ).toEqual([]);
  });

  it('tolerates a missing content field', () => {
    expect(
      rowsToTaggedChunks([{ id: 1, document_id: 2, scf_controls: ['GOV-01'] }])[0].snippet,
    ).toBe('');
  });
});

describe('indexByControl', () => {
  const chunks = rowsToTaggedChunks([
    { id: 1, document_id: 10, content: 'a', scf_controls: ['GOV-01', 'IAC-02'] },
    { id: 2, document_id: 11, content: 'b', scf_controls: ['GOV-01'] },
  ]);

  it('lists every chunk under each of its codes', () => {
    const index = indexByControl(chunks);
    expect(index.get('GOV-01')!.map((c) => c.chunkId)).toEqual([1, 2]);
    expect(index.get('IAC-02')!.map((c) => c.chunkId)).toEqual([1]);
  });

  it('has no entry for a code no chunk carries', () => {
    expect(indexByControl(chunks).has('ZZZ-99')).toBe(false);
  });

  it('returns an empty index for no chunks', () => {
    expect(indexByControl([]).size).toBe(0);
  });
});

describe('tagProvenanceFor', () => {
  const index = indexByControl(
    rowsToTaggedChunks([
      { id: 5, document_id: 50, content: 'evidence text', scf_controls: ['GOV-01'] },
    ]),
  );

  it('emits one provenance row per tagged chunk, marked llm_confirmed', () => {
    expect(tagProvenanceFor(index, 'GOV-01')).toEqual([
      {
        documentId: 50,
        chunkId: 5,
        scfControlCode: 'GOV-01',
        method: 'llm_confirmed',
        score: TAG_CONFIDENCE,
        snippet: 'evidence text',
        justification: 'SCF tag confirmed as `implements` by scf-tagger',
      },
    ]);
  });

  it('returns nothing for a control with no tagged chunks, rather than throwing', () => {
    expect(tagProvenanceFor(index, 'ZZZ-99')).toEqual([]);
  });
});
