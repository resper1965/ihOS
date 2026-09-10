// tests/unit/standard-api/cached-catalogue.test.ts
// Both engines read the SCF catalogue from scf_controls_cache through one
// function (spec 2026-09-10 §3). The Standard-API engine used to fetch it live
// against /scf/versions/latest, an endpoint that does not exist, and failed
// every night from 2026-08-29.

import { describe, it, expect, vi } from 'vitest';
import { loadCachedCatalogue, type CatalogueReader } from '@/lib/standard-api/sync/catalog';
import { controlIdentity } from '@/lib/assessment/engine';

/** A reader over fixed rows that honours .range(), like PostgREST does. */
function readerOver(rows: Array<Record<string, unknown>>) {
  const range = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
  const eq = vi.fn(() => ({ order: () => ({ range }) }));
  const client: CatalogueReader = { from: () => ({ select: () => ({ eq }) }) };
  return { client, range, eq };
}

describe('loadCachedCatalogue', () => {
  it('maps a cache row to a control that controlIdentity accepts', async () => {
    const { client, eq } = readerOver([
      { control_code: 'AAT-01', control_title: 'AI governance', control_description: 'Mechanisms exist.' },
    ]);

    const [control] = await loadCachedCatalogue('v-cached', client);

    expect(control).toEqual({ id: 'AAT-01', name: 'AI governance', domain: 'AAT', description: 'Mechanisms exist.' });
    expect(String(controlIdentity(control as unknown as Record<string, unknown>))).toBe('AAT-01');
    expect(eq).toHaveBeenCalledWith('scf_version_id', 'v-cached');
  });

  it('falls back from description to title to code, and drops rows with no code', async () => {
    const { client } = readerOver([
      { control_code: 'GOV-01', control_title: 'Governance', control_description: '' },
      { control_code: 'HRS-02', control_title: null, control_description: null },
      { control_code: null, control_title: 'orphan' },
    ]);

    const out = await loadCachedCatalogue('v', client);

    expect(out.map((c) => c.id)).toEqual(['GOV-01', 'HRS-02']);
    expect(out.map((c) => c.name)).toEqual(['Governance', 'HRS-02']);
    expect(out.map((c) => c.description)).toEqual(['Governance', 'HRS-02']);
  });

  it('reads past the 1,000-row cap', async () => {
    // A version holds ~1,468 controls; supabase-js stops an unbounded select at 1,000.
    const rows = Array.from({ length: 1468 }, (_, i) => ({
      control_code: `C-${String(i).padStart(4, '0')}`,
      control_title: 't',
    }));
    const { client, range } = readerOver(rows);

    expect(await loadCachedCatalogue('v', client)).toHaveLength(1468);
    expect(range).toHaveBeenCalledWith(0, 999);
    expect(range).toHaveBeenCalledWith(1000, 1999);
  });
});
