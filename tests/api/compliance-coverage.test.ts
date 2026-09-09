import { describe, it, expect, vi, beforeEach } from 'vitest';

const projectMock = vi.fn();
const versionMock = vi.fn();

vi.mock('@/lib/assessment/projection', () => ({
  projectFrameworkFromCrosswalk: (...args: unknown[]) => projectMock(...args),
}));
vi.mock('@/lib/standard-api/sync/catalog', () => ({
  getCachedScfVersionId: () => versionMock(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  }),
}));

const PROJECTION = {
  score: null,
  reason: 'nothing_assessable',
  requirementsTotal: 316,
  requirementsSatisfied: 0,
  requirementsPartial: 0,
  requirementsNeedingReview: 0,
  requirementsUnrecorded: 41,
  requirementsUnevaluated: 275,
  requirementsGap: 0,
  policyVersion: '2026-08-27.1',
  policyOwner: 'resper@ionic.health',
};

describe('GET /api/compliance/coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    versionMock.mockResolvedValue('826a1f05-f065-4feb-9f44-ced8019a6701');
  });

  it('returns totals with a null score, not a zero, when nothing is evaluated', async () => {
    // A null score means "nothing to divide by". A zero would read as
    // "assessed, and it came out at nothing" — a different claim entirely.
    projectMock.mockResolvedValue(PROJECTION);
    const { GET } = await import('@/app/api/compliance/coverage/route');
    const body = await (await GET()).json();

    const row = body.frameworks.find((f: { localCode: string }) => f.localCode === 'iso27001');
    expect(row.status).toBe('projected');
    expect(row.requirementsTotal).toBe(316);
    expect(row.requirementsUnrecorded).toBe(41);
    expect(row.score).toBeNull();
    expect(row.reason).toBe('nothing_assessable');
    expect(row.policyVersion).toBe('2026-08-27.1');
  });

  it('always passes an explicit scfVersionId', async () => {
    // scf_control_mappings spans two catalogue versions. An unversioned read
    // mixes the fabricated crosswalk into its own correction, which is why the
    // projection refuses to run without one.
    projectMock.mockResolvedValue(PROJECTION);
    const { GET } = await import('@/app/api/compliance/coverage/route');
    await GET();

    expect(projectMock).toHaveBeenCalled();
    for (const call of projectMock.mock.calls) {
      expect(call[2]?.scfVersionId).toBe('826a1f05-f065-4feb-9f44-ced8019a6701');
    }
  });

  it('reports an uncurated framework as undecided without taking the others down', async () => {
    // fedramp and IEC-62304 are offered with no curated identity, and the
    // projection throws for exactly that case. "Nobody has decided yet" is a
    // different answer from "covers nothing", and the page must be able to
    // tell them apart.
    projectMock.mockImplementation(async (code: string) => {
      if (code === 'fedramp' || code === 'IEC-62304') {
        throw new Error(`no curated vendor framework for "${code}"`);
      }
      return PROJECTION;
    });
    const { GET } = await import('@/app/api/compliance/coverage/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    const fedramp = body.frameworks.find((f: { localCode: string }) => f.localCode === 'fedramp');
    expect(fedramp.status).toBe('undecided');
    expect(fedramp.requirementsTotal).toBeNull();
    expect(fedramp.note).toMatch(/curated/i);

    const iso = body.frameworks.find((f: { localCode: string }) => f.localCode === 'iso27001');
    expect(iso.status).toBe('projected');
  });

  it('refuses an unauthenticated caller', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no session' } }) },
      }),
    }));
    vi.resetModules();
    const { GET } = await import('@/app/api/compliance/coverage/route');
    expect((await GET()).status).toBe(401);
  });
});
