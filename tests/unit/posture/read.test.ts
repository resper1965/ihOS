// tests/unit/posture/read.test.ts
// Grouping evidence into per-control posture. A control with no evidence must
// still appear, as a gap — silence must never read as an answer.

import { describe, it, expect } from 'vitest';
import { rowsToLinks, groupPosture, selectControlCodes, summarise } from '@/lib/posture/read';
import type { EvidenceLink } from '@/lib/posture/types';

function link(code: string, role: EvidenceLink['role'], chunkId: number, score = 0.9): EvidenceLink {
  return {
    scfControlCode: code,
    productVersionId: null,
    chunkId,
    documentId: 1,
    role,
    score,
    snippet: 's',
  };
}

describe('rowsToLinks', () => {
  it('maps database rows into links, coercing numerics', () => {
    const links = rowsToLinks([
      {
        scf_control_code: 'GOV-01',
        product_version_id: null,
        chunk_id: 5,
        document_id: 2,
        role: 'policy',
        score: '0.8700',
        snippet: 'text',
      },
    ]);
    expect(links).toEqual([
      {
        scfControlCode: 'GOV-01',
        productVersionId: null,
        chunkId: 5,
        documentId: 2,
        role: 'policy',
        score: 0.87,
        snippet: 'text',
      },
    ]);
  });
});

describe('groupPosture', () => {
  it('reports a control with both roles as conforming', () => {
    const out = groupPosture(['GOV-01'], [link('GOV-01', 'policy', 1), link('GOV-01', 'operational', 2)]);
    expect(out[0].verdict).toBe('conforming');
    expect(out[0].policy).toHaveLength(1);
    expect(out[0].operational).toHaveLength(1);
  });

  it('reports a control with no evidence as a gap rather than omitting it', () => {
    const out = groupPosture(['GOV-01', 'GOV-02'], [link('GOV-01', 'policy', 1)]);
    expect(out).toHaveLength(2);
    const gov02 = out.find((p) => p.scfControlCode === 'GOV-02')!;
    expect(gov02.verdict).toBe('gap');
    expect(gov02.confidence).toBe(0);
    expect(gov02.policy).toEqual([]);
  });

  it('ignores evidence for a control outside the requested list', () => {
    const out = groupPosture(['GOV-01'], [link('GOV-99', 'policy', 1)]);
    expect(out).toHaveLength(1);
    expect(out[0].verdict).toBe('gap');
  });

  it('sorts evidence within a role by descending score', () => {
    const out = groupPosture(
      ['GOV-01'],
      [link('GOV-01', 'policy', 1, 0.7), link('GOV-01', 'policy', 2, 0.95)],
    );
    expect(out[0].policy.map((l) => l.chunkId)).toEqual([2, 1]);
  });
});

describe('selectControlCodes', () => {
  function evidenceRow(code: string): Record<string, unknown> {
    return { scf_control_code: code };
  }

  it('counts distinct codes, sorted, deduplicating repeated evidence rows', () => {
    const rows = [
      evidenceRow('GOV-02'),
      evidenceRow('GOV-01'),
      evidenceRow('GOV-02'), // same control, second evidence row
    ];
    const result = selectControlCodes(rows, 500);
    expect(result.codes).toEqual(['GOV-01', 'GOV-02']);
    expect(result.totalDistinct).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('caps the returned codes but reports the true distinct total', () => {
    const rows = Array.from({ length: 3 }, (_, i) => evidenceRow(`C-${i}`));
    const result = selectControlCodes(rows, 2);
    expect(result.codes).toHaveLength(2);
    expect(result.totalDistinct).toBe(3);
    expect(result.truncated).toBe(true);
  });

  it('does not report truncation when the distinct count exactly equals the cap', () => {
    const rows = Array.from({ length: 2 }, (_, i) => evidenceRow(`C-${i}`));
    const result = selectControlCodes(rows, 2);
    expect(result.codes).toHaveLength(2);
    expect(result.totalDistinct).toBe(2);
    expect(result.truncated).toBe(false);
  });
});

describe('summarise', () => {
  it('counts every verdict state, including those with no members', () => {
    const postures = groupPosture(
      ['A', 'B', 'C'],
      [link('A', 'policy', 1), link('B', 'policy', 2), link('B', 'operational', 3)],
    );
    expect(summarise(postures)).toEqual({
      conforming: 1,
      partial: 1,
      informal: 0,
      gap: 1,
    });
  });
});
