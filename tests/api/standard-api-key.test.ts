// tests/api/standard-api-key.test.ts
// Storing a credential, so the gate and the non-disclosure are the tests that
// matter. Also pins which source is in use after a save: since 2026-09-10 the
// Vault wins for this key (vault.ts, VAULT_FIRST), so a saved key is the one
// in use even where the env var is set.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabaseServer, mockSupabaseAdmin } from '../setup';

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
    mockSupabaseAdmin.rpc.mockResolvedValue({ data: [], error: null });
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

  it('reports a saved key as in use even when the env var is set', async () => {
    // Inverted on 2026-09-10. This test used to assert the env var shadowed a
    // saved key; the Vault now wins for this key (spec §1).
    const key = 'standard_live_0123456789abcdef0123456789abcdef';
    mockSupabaseAdmin.rpc.mockImplementation(async (fn: string) =>
      fn === 'get_vault_secret' ? { data: key, error: null } : { data: null, error: null },
    );

    const { POST } = await import('@/app/api/settings/integrations/standard-api/key/route');
    const body = await (await POST(req({ key }))).json();

    expect(body.shadowedByEnv).toBe(false);
  });

  it('reports the env var as in use when the Vault read comes back empty', async () => {
    // The save call succeeded but the read did not find it: the response must
    // not claim the new key is in use.
    mockSupabaseAdmin.rpc.mockResolvedValue({ data: null, error: null });

    const { POST } = await import('@/app/api/settings/integrations/standard-api/key/route');
    const body = await (await POST(req({ key: 'standard_live_0123456789abcdef0123456789abcdef' }))).json();

    expect(body.shadowedByEnv).toBe(true);
  });
});
