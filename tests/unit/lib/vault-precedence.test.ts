// tests/unit/lib/vault-precedence.test.ts
// STANDARD_GRC_API_KEY is read from the Vault first — decision of 2026-09-10,
// docs/superpowers/specs/2026-09-10-defensible-numbers-design.md §1. Every
// other secret keeps env-first. These pin both halves, the cache expiry that
// lets a rotation reach warm instances, and that the catalogue sync (which
// read process.env directly) now sends the Vault key too.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSupabaseAdmin } from '../../setup';
import { getSecret, getSecretSource, invalidateSecretCache } from '@/lib/supabase/vault';

const VAULT_KEY = 'standard_live_fromvault0000000000000000';

/** The Vault answers get_vault_secret with these values, and nothing else. */
function vaultHolds(values: Record<string, string>) {
  mockSupabaseAdmin.rpc.mockImplementation(async (_fn: string, args: { secret_name: string }) => ({
    data: values[args.secret_name] ?? null,
    error: null,
  }));
}

describe('getSecret precedence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSecretCache('STANDARD_GRC_API_KEY');
    invalidateSecretCache('OPENAI_API_KEY');
    mockSupabaseAdmin.rpc.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    mockSupabaseAdmin.rpc.mockResolvedValue({ data: [], error: null });
  });

  it('reads STANDARD_GRC_API_KEY from the Vault even when the env var is set', async () => {
    // tests/setup.ts sets the env var to 'fake-grc-key' for every suite.
    vaultHolds({ STANDARD_GRC_API_KEY: VAULT_KEY });
    expect(await getSecret('STANDARD_GRC_API_KEY')).toBe(VAULT_KEY);
    expect(await getSecretSource('STANDARD_GRC_API_KEY')).toBe('vault');
  });

  it('falls back to the env var when the Vault holds no key', async () => {
    vaultHolds({});
    expect(await getSecret('STANDARD_GRC_API_KEY')).toBe('fake-grc-key');
    expect(await getSecretSource('STANDARD_GRC_API_KEY')).toBe('env');
  });

  it('keeps OPENAI_API_KEY env-first, without asking the Vault', async () => {
    vaultHolds({ OPENAI_API_KEY: 'vault-openai-must-not-win' });
    expect(await getSecret('OPENAI_API_KEY')).toBe('fake-openai-key');
    expect(await getSecretSource('OPENAI_API_KEY')).toBe('env');
    expect(mockSupabaseAdmin.rpc).not.toHaveBeenCalled();
  });

  it('re-reads the Vault after 60 seconds, so a rotation reaches warm instances', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
    vaultHolds({ STANDARD_GRC_API_KEY: VAULT_KEY });
    expect(await getSecret('STANDARD_GRC_API_KEY')).toBe(VAULT_KEY);

    const ROTATED = 'standard_live_rotated000000000000000000';
    vaultHolds({ STANDARD_GRC_API_KEY: ROTATED });

    vi.setSystemTime(new Date('2026-09-10T12:00:30Z'));
    expect(await getSecret('STANDARD_GRC_API_KEY')).toBe(VAULT_KEY);

    vi.setSystemTime(new Date('2026-09-10T12:01:01Z'));
    expect(await getSecret('STANDARD_GRC_API_KEY')).toBe(ROTATED);
  });

  it('sends the Vault key from the catalogue sync, which used to read process.env directly', async () => {
    vaultHolds({ STANDARD_GRC_API_KEY: VAULT_KEY });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ data: [{ scf_version_id: 'v1' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getLatestScfVersionId } = await import('@/lib/standard-api/sync/catalog');
    const { createThrottle } = await import('@/lib/standard-api/sync/throttle');

    expect(await getLatestScfVersionId(createThrottle())).toBe('v1');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${VAULT_KEY}`);
  });
});
