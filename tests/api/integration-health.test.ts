// tests/api/integration-health.test.ts
// The Settings page used to render status="Connected" as a hardcoded string —
// true whether the key was valid, absent, expired, or (as it actually was)
// missing three scopes. This endpoint reports what the API really says.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabaseServer } from '../setup';

function resetMocks() {
  mockSupabaseServer.auth.getUser.mockResolvedValue({
    data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    error: null,
  });
  mockSupabaseServer.from.mockReturnThis();
  mockSupabaseServer.select.mockReturnThis();
  mockSupabaseServer.eq.mockReturnThis();
  mockSupabaseServer.single.mockResolvedValue({ data: { role: 'admin' }, error: null });
}

describe('GET /api/settings/integrations/standard-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/settings/integrations/standard-api/route');
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Session not found'),
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-privileged role', async () => {
    const { GET } = await import('@/app/api/settings/integrations/standard-api/route');
    mockSupabaseServer.single.mockResolvedValue({ data: { role: 'client_user' }, error: null });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('parses the scopes the API reports out of a 403 body', async () => {
    const { GET } = await import('@/app/api/settings/integrations/standard-api/route');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        title: 'INSUFFICIENT SCOPE',
        detail:
          'This API key lacks the required scope(s): intelligence:run. Key has: ' +
          'assessment:read, assessment:write, document:read, document:write, scf:read.',
      }),
    })));

    const res = await GET();
    const body = await res.json();

    expect(body.scopesMissing).toContain('intelligence:run');
    expect(body.scopesHeld).toContain('scf:read');
    expect(body.scopesHeld).toContain('assessment:write');
  });

  it('never returns the key itself, only a prefix', async () => {
    const { GET } = await import('@/app/api/settings/integrations/standard-api/route');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));

    const res = await GET();
    const raw = JSON.stringify(await res.json());

    // The full key must never appear in the response, under any field.
    expect(raw).not.toMatch(/standard_live_[a-f0-9]{20,}/);
  });
});
