// tests/unit/assessment/corpus-fingerprint.test.ts
// Verifies the invalidation signals that let the assessment engine and
// threat-modeling route reuse persisted evaluations instead of re-calling
// RAG search / the Standard GRC Engine API on every request.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCorpusFingerprint, getDeltaFingerprint } from '@/lib/assessment/corpus-fingerprint';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

// Minimal thenable query-builder stub: supports the chain shape used by
// corpus-fingerprint.ts (select().eq()) and resolves like a Supabase query.
function makeQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  };
  return query;
}

function mockAdminFrom(data: unknown) {
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn(() => makeQuery({ data, error: null })),
  } as unknown as ReturnType<typeof createAdminClient>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCorpusFingerprint', () => {
  it('returns a stable fingerprint for an unchanged corpus', async () => {
    mockAdminFrom([
      { id: 1, product_version_id: null, updated_at: '2026-06-01T00:00:00Z' },
      { id: 2, product_version_id: 'v1', updated_at: '2026-06-02T00:00:00Z' },
    ]);

    const first = await getCorpusFingerprint('v1');
    const second = await getCorpusFingerprint('v1');

    expect(first).toBe(second);
  });

  it('changes when a relevant document is updated', async () => {
    mockAdminFrom([{ id: 1, product_version_id: null, updated_at: '2026-06-01T00:00:00Z' }]);
    const before = await getCorpusFingerprint(null);

    mockAdminFrom([{ id: 1, product_version_id: null, updated_at: '2026-06-15T00:00:00Z' }]);
    const after = await getCorpusFingerprint(null);

    expect(before).not.toBe(after);
  });

  it('excludes documents scoped to a different product version', async () => {
    mockAdminFrom([{ id: 1, product_version_id: 'other-version', updated_at: '2026-06-01T00:00:00Z' }]);
    const withUnrelatedDoc = await getCorpusFingerprint('v1');

    mockAdminFrom([]);
    const empty = await getCorpusFingerprint('v1');

    expect(withUnrelatedDoc).toBe(empty);
  });
});

describe('getDeltaFingerprint', () => {
  it('returns "no-deltas" fingerprint and an empty list when nothing was extracted', async () => {
    mockAdminFrom([]);
    const { fingerprint, deltas, needsReviewCount } = await getDeltaFingerprint('v1');

    expect(deltas).toEqual([]);
    expect(fingerprint).toBeTruthy();
    expect(needsReviewCount).toBe(0);
  });

  it('counts low-confidence deltas flagged needs_review', async () => {
    mockAdminFrom([
      { feature_slug: 'oauth2', description: '', affected_components: [], risk_level: 'medium', updated_at: '2026-06-01T00:00:00Z', needs_review: false },
      { feature_slug: 'webrtc', description: '', affected_components: [], risk_level: 'high', updated_at: '2026-06-01T00:00:00Z', needs_review: true },
    ]);
    const { needsReviewCount } = await getDeltaFingerprint('v1');
    expect(needsReviewCount).toBe(1);
  });

  it('falls back to base columns when needs_review/extraction_confidence do not exist yet', async () => {
    // First (rich) select errors → second (base) select succeeds. Fingerprint
    // still computes; needsReviewCount is 0 since the column is absent.
    let call = 0;
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => {
        call++;
        return call === 1
          ? makeQuery({ data: null, error: { message: 'column needs_review does not exist' } })
          : makeQuery({
              data: [{ feature_slug: 'oauth2', description: '', affected_components: [], risk_level: 'medium', updated_at: '2026-06-01T00:00:00Z' }],
              error: null,
            });
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const { fingerprint, deltas, needsReviewCount } = await getDeltaFingerprint('v1');
    expect(deltas).toHaveLength(1);
    expect(fingerprint).toBeTruthy();
    expect(needsReviewCount).toBe(0);
  });

  it('is order-independent (sorted by feature_slug before hashing)', async () => {
    mockAdminFrom([
      { feature_slug: 'webrtc', description: '', affected_components: [], risk_level: 'high', updated_at: '2026-06-01T00:00:00Z' },
      { feature_slug: 'oauth2', description: '', affected_components: [], risk_level: 'medium', updated_at: '2026-06-01T00:00:00Z' },
    ]);
    const a = await getDeltaFingerprint('v1');

    mockAdminFrom([
      { feature_slug: 'oauth2', description: '', affected_components: [], risk_level: 'medium', updated_at: '2026-06-01T00:00:00Z' },
      { feature_slug: 'webrtc', description: '', affected_components: [], risk_level: 'high', updated_at: '2026-06-01T00:00:00Z' },
    ]);
    const b = await getDeltaFingerprint('v1');

    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('changes when a new delta is extracted', async () => {
    mockAdminFrom([
      { feature_slug: 'oauth2', description: '', affected_components: [], risk_level: 'medium', updated_at: '2026-06-01T00:00:00Z' },
    ]);
    const before = await getDeltaFingerprint('v1');

    mockAdminFrom([
      { feature_slug: 'oauth2', description: '', affected_components: [], risk_level: 'medium', updated_at: '2026-06-01T00:00:00Z' },
      { feature_slug: 'webrtc_signaling', description: '', affected_components: ['network'], risk_level: 'high', updated_at: '2026-06-10T00:00:00Z' },
    ]);
    const after = await getDeltaFingerprint('v1');

    expect(before.fingerprint).not.toBe(after.fingerprint);
  });
});
