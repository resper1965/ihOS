// tests/api/frameworks.test.ts
// The frameworks endpoint feeds the Run Assessment picker. It must offer only
// frameworks something actually backs — the Standard API's own catalog, or a
// real crosswalk in scf_framework_mappings. It previously merged in a
// hardcoded list of 13 codes regardless of backing, which is how five
// fabricated frameworks (and five with no mappings at all) stayed selectable.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabaseServer } from '../setup';

vi.mock('@/lib/standard-api/client', () => ({
  getScfFrameworks: vi.fn(async () => []),
}));

function resetMocks() {
  mockSupabaseServer.auth.getUser.mockResolvedValue({
    data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    error: null,
  });
  mockSupabaseServer.from.mockReturnThis();
  mockSupabaseServer.select.mockResolvedValue({
    data: [{ framework_code: 'iso27001' }, { framework_code: 'iso27701' }],
    error: null,
  });
}

describe('GET /api/compliance/frameworks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/compliance/frameworks/route');
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Session not found'),
    });

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('offers only frameworks that have real mappings when the Standard API returns none', async () => {
    const { GET } = await import('@/app/api/compliance/frameworks/route');

    const res = await GET();
    const body = await res.json();
    const codes = body.data.map((f: { framework_code: string }) => f.framework_code);

    expect(codes.sort()).toEqual(['iso27001', 'iso27701']);
  });

  it('never offers a fabricated or unbacked framework from a hardcoded list', async () => {
    const { GET } = await import('@/app/api/compliance/frameworks/route');

    const res = await GET();
    const body = await res.json();
    const codes = body.data.map((f: { framework_code: string }) => f.framework_code);

    for (const unbacked of ['soc2', 'hipaa', 'nist_800_53', 'BR-LGPD', 'EU-GDPR', 'nist_csf', 'PCI-DSS', 'saudi_sama', 'saudi_nca', 'cis_v8']) {
      expect(codes).not.toContain(unbacked);
    }
  });

  it('still resolves a display name for a code it does offer', async () => {
    const { GET } = await import('@/app/api/compliance/frameworks/route');

    const res = await GET();
    const body = await res.json();
    const iso = body.data.find((f: { framework_code: string }) => f.framework_code === 'iso27001');

    expect(iso.framework_name).toBe('ISO/IEC 27001:2022');
  });
});
