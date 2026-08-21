// tests/unit/posture/bind-evidence.test.ts
// Provenance rows become evidence links only if they clear the score floor and
// their document type grants a role.

import { describe, it, expect } from 'vitest';
import {
  buildEvidenceLinks,
  normalizeRrf,
  MIN_EVIDENCE_SCORE,
  RRF_CEILING,
} from '@/lib/posture/bind-evidence';
import type { ProvenanceRow } from '@/lib/posture/types';

describe('normalizeRrf', () => {
  it('maps zero to zero', () => {
    expect(normalizeRrf(0)).toBe(0);
  });

  it('maps the RRF ceiling to one', () => {
    expect(normalizeRrf(RRF_CEILING)).toBe(1);
  });

  it('maps the midpoint to a half', () => {
    expect(normalizeRrf(RRF_CEILING / 2)).toBeCloseTo(0.5, 5);
  });

  it('clamps above the ceiling rather than exceeding one', () => {
    expect(normalizeRrf(RRF_CEILING * 3)).toBe(1);
  });

  it('clamps negatives to zero', () => {
    expect(normalizeRrf(-1)).toBe(0);
  });

  it('lifts a typical strong RRF score above the evidence floor', () => {
    // local-engine.ts:29 treated 0.025 as strong evidence.
    expect(normalizeRrf(0.025)).toBeGreaterThan(MIN_EVIDENCE_SCORE);
  });

  it('keeps a weak RRF score below the evidence floor', () => {
    expect(normalizeRrf(0.005)).toBeLessThan(MIN_EVIDENCE_SCORE);
  });
});

function prov(over: Partial<ProvenanceRow> = {}): ProvenanceRow {
  return {
    documentId: 1,
    chunkId: 100,
    scfControlCode: 'GOV-01',
    method: 'vector',
    score: 0.9,
    snippet: 'text',
    justification: null,
    ...over,
  };
}

const docTypes = new Map<number, string | null>([
  [1, 'POLICY'],
  [2, 'TEST_REPORT'],
  [3, 'UNCLASSIFIED'],
  [4, null],
]);

describe('buildEvidenceLinks', () => {
  it('turns a qualifying policy row into a policy link', () => {
    const links = buildEvidenceLinks([prov()], docTypes, { productVersionId: null });
    expect(links).toHaveLength(1);
    expect(links[0].role).toBe('policy');
    expect(links[0].chunkId).toBe(100);
    expect(links[0].productVersionId).toBeNull();
  });

  it('turns a qualifying test report into an operational link', () => {
    const links = buildEvidenceLinks(
      [prov({ documentId: 2, chunkId: 200 })],
      docTypes,
      { productVersionId: null },
    );
    expect(links[0].role).toBe('operational');
  });

  it('drops rows below the score floor', () => {
    const links = buildEvidenceLinks(
      [prov({ score: MIN_EVIDENCE_SCORE - 0.01 })],
      docTypes,
      { productVersionId: null },
    );
    expect(links).toEqual([]);
  });

  it('keeps a row exactly at the score floor', () => {
    const links = buildEvidenceLinks(
      [prov({ score: MIN_EVIDENCE_SCORE })],
      docTypes,
      { productVersionId: null },
    );
    expect(links).toHaveLength(1);
  });

  it('drops UNCLASSIFIED documents entirely', () => {
    const links = buildEvidenceLinks(
      [prov({ documentId: 3, chunkId: 300 })],
      docTypes,
      { productVersionId: null },
    );
    expect(links).toEqual([]);
  });

  it('drops documents with a null doc_type', () => {
    const links = buildEvidenceLinks(
      [prov({ documentId: 4, chunkId: 400 })],
      docTypes,
      { productVersionId: null },
    );
    expect(links).toEqual([]);
  });

  it('drops rows whose document is absent from the type map', () => {
    const links = buildEvidenceLinks(
      [prov({ documentId: 99, chunkId: 900 })],
      docTypes,
      { productVersionId: null },
    );
    expect(links).toEqual([]);
  });

  it('deduplicates the same chunk claimed twice for one control', () => {
    const links = buildEvidenceLinks(
      [prov({ score: 0.7 }), prov({ score: 0.95 })],
      docTypes,
      { productVersionId: null },
    );
    expect(links).toHaveLength(1);
    expect(links[0].score).toBe(0.95); // the stronger claim wins
  });

  it('keeps the same chunk for two different controls', () => {
    const links = buildEvidenceLinks(
      [prov({ scfControlCode: 'GOV-01' }), prov({ scfControlCode: 'GOV-02' })],
      docTypes,
      { productVersionId: null },
    );
    expect(links).toHaveLength(2);
  });

  it('stamps the product version onto every link', () => {
    const links = buildEvidenceLinks([prov()], docTypes, {
      productVersionId: '11111111-1111-1111-1111-111111111111',
    });
    expect(links[0].productVersionId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('never emits a chunk in two roles for one control', () => {
    const links = buildEvidenceLinks(
      [prov(), prov({ scfControlCode: 'GOV-01' })],
      docTypes,
      { productVersionId: null },
    );
    const seen = new Set(links.map((l) => `${l.scfControlCode}:${l.chunkId}`));
    expect(seen.size).toBe(links.length);
  });
});
