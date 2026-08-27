// tests/api/standard-api-key.test.ts
// Storing a credential, so the gate and the non-disclosure are the tests that
// matter. Also pins the precedence trap: getSecret checks process.env FIRST,
// so a key saved to the Vault is inert wherever the env var is set. The route
// must say so rather than reporting a success that changes nothing.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabaseServer } from '../setup';

function asRole(role: string) {
  mockSupabaseServer.auth.getUser.mockResolvedValue({
    data: { user: { id: 'u1', email: 't@example.com' } },
    error: null,
  });
  mockSupabaseServer.from.mockReturnThis();
  mockSupabaseServer.select.mockReturnThis();
  mockSupabaseServer.eq.mockReturnThis();
  mockSupabaseServer.single.mockResolvedValue({ data: { role }, error: null });
}

function req(body: unknown) {
  return { json: async () => body } as any;
}

describe('POST /api/settings/integrations/standard-api/key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asRole('admin');
  });

  it('returns 401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/settings/integrations/standard-api/key/route');
    mockSupabaseServer.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') });
    const res = await POST(req({ key: 'standard_live_aaaaaaaaaaaaaaaaaaaaaaaa' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-privileged role', async () => {
    const { POST } = await import('@/app/api/settings/integrations/standard-api/key/route');
    asRole('client_user');
    const res = await POST(req({ key: 'standard_live_aaaaaaaaaaaaaaaaaaaaaaaa' }));
    expect(res.status).toBe(403);
  });

  it('rejects a key that does not carry the expected prefix', async () => {
    const { POST } = await import('@/app/api/settings/integrations/standard-api/key/route');
    const res = await POST(req({ key: 'not-a-standard-key' }));
    expect(res.status).toBe(400);
  });

  it('never echoes the key back in the response', async () => {
    const { POST } = await import('@/app/api/settings/integrations/standard-api/key/route');
    const key = 'standard_live_0123456789abcdef0123456789abcdef';
    const res = await POST(req({ key }));
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain(key);
    expect(raw).not.toContain('0123456789abcdef0123456789abcdef');
  });

  it('warns that a stored key is shadowed when the env var is set', async () => {
    const { POST } = await import('@/app/api/settings/integrations/standard-api/key/route');
    const saved = process.env.STANDARD_GRC_API_KEY;
    process.env.STANDARD_GRC_API_KEY = 'standard_live_envvaluewinsxxxxxxxxxxxxxxxx';

    const res = await POST(req({ key: 'standard_live_0123456789abcdef0123456789abcdef' }));
    const body = await res.json();

    // The save may succeed, but the response must say it has no effect here.
    expect(body.shadowedByEnv).toBe(true);

    if (saved === undefined) delete process.env.STANDARD_GRC_API_KEY;
    else process.env.STANDARD_GRC_API_KEY = saved;
  });
});
