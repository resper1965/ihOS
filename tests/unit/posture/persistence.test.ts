// tests/unit/posture/persistence.test.ts
// Row shaping is pure and tested directly; the writers are tested against a
// fake client so no database is needed.

import { describe, it, expect, vi } from 'vitest';
import {
  toProvenanceRecords,
  toEvidenceRecords,
  persistProvenance,
  replaceEvidenceForScope,
  PERSIST_BATCH_SIZE,
} from '@/lib/posture/persistence';
import type { EvidenceLink, ProvenanceRow } from '@/lib/posture/types';

function prov(i: number): ProvenanceRow {
  return {
    documentId: 1,
    chunkId: i,
    scfControlCode: 'GOV-01',
    method: 'vector',
    score: 0.9,
    snippet: 's',
    justification: null,
  };
}

function link(i: number): EvidenceLink {
  return {
    scfControlCode: 'GOV-01',
    productVersionId: null,
    chunkId: i,
    documentId: 1,
    role: 'policy',
    score: 0.9,
    snippet: 's',
  };
}

function fakeClient() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const is = vi.fn().mockResolvedValue({ error: null });
  const eq = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn(() => ({ is, eq }));
  const client = { from: vi.fn(() => ({ upsert, insert, delete: del })) };
  return { client, upsert, insert, del, is, eq };
}

describe('toProvenanceRecords', () => {
  it('maps camelCase fields onto snake_case columns', () => {
    expect(toProvenanceRecords([prov(7)])[0]).toEqual({
      document_id: 1,
      chunk_id: 7,
      scf_control_code: 'GOV-01',
      method: 'vector',
      score: 0.9,
      snippet: 's',
      justification: null,
    });
  });
});

describe('toEvidenceRecords', () => {
  it('maps camelCase fields onto snake_case columns', () => {
    expect(toEvidenceRecords([link(7)])[0]).toEqual({
      scf_control_code: 'GOV-01',
      product_version_id: null,
      chunk_id: 7,
      document_id: 1,
      role: 'policy',
      score: 0.9,
      snippet: 's',
    });
  });
});

describe('persistProvenance', () => {
  it('writes nothing and returns zero for an empty input', async () => {
    const { client, upsert } = fakeClient();
    await expect(persistProvenance(client, [])).resolves.toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('upserts on the provenance conflict target', async () => {
    const { client, upsert } = fakeClient();
    await persistProvenance(client, [prov(1)]);
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), {
      onConflict: 'chunk_id,scf_control_code',
    });
  });

  it('splits input into batches and returns the total written', async () => {
    const { client, upsert } = fakeClient();
    const rows = Array.from({ length: PERSIST_BATCH_SIZE + 5 }, (_, i) => prov(i));
    await expect(persistProvenance(client, rows)).resolves.toBe(PERSIST_BATCH_SIZE + 5);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('throws with the database message when a batch fails', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
    const client = { from: vi.fn(() => ({ upsert })) };
    await expect(persistProvenance(client, [prov(1)])).rejects.toThrow('boom');
  });
});

describe('replaceEvidenceForScope', () => {
  it('deletes the null-version scope with .is() before inserting', async () => {
    const { client, del, is, insert } = fakeClient();
    await replaceEvidenceForScope(client, null, [link(1)]);
    expect(del).toHaveBeenCalled();
    expect(is).toHaveBeenCalledWith('product_version_id', null);
    expect(insert).toHaveBeenCalled();
  });

  it('deletes a versioned scope with .eq() before inserting', async () => {
    const { client, eq, insert } = fakeClient();
    await replaceEvidenceForScope(client, 'ver-1', [link(1)]);
    expect(eq).toHaveBeenCalledWith('product_version_id', 'ver-1');
    expect(insert).toHaveBeenCalled();
  });

  it('clears the scope even when there is nothing to insert', async () => {
    const { client, del, insert } = fakeClient();
    await expect(replaceEvidenceForScope(client, null, [])).resolves.toBe(0);
    expect(del).toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('batches inserts and returns the total written', async () => {
    const { client, insert } = fakeClient();
    const links = Array.from({ length: PERSIST_BATCH_SIZE + 3 }, (_, i) => link(i));
    await expect(replaceEvidenceForScope(client, null, links)).resolves.toBe(
      PERSIST_BATCH_SIZE + 3,
    );
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('throws with the database message when the delete fails', async () => {
    const is = vi.fn().mockResolvedValue({ error: { message: 'delete boom' } });
    const client = {
      from: vi.fn(() => ({ delete: vi.fn(() => ({ is, eq: vi.fn() })), insert: vi.fn(), upsert: vi.fn() })),
    };
    await expect(replaceEvidenceForScope(client, null, [link(1)])).rejects.toThrow('delete boom');
  });
});
