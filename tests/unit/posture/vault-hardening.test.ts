// tests/unit/posture/vault-hardening.test.ts
// migration-invariants.test.ts reads a single, specific migration
// (20260820000001_posture_core.sql) into a module-level const, so it has no
// helper for reading an arbitrary migration by filename. Rather than bolt a
// second file-reading mechanism onto that file, this test reads its own
// migration the same way — readFileSync + resolve — for a different file.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260827000001_harden_set_vault_secret.sql'),
  'utf8',
);

describe('set_vault_secret is defended in depth', () => {
  // get_vault_secret has always had an internal role check ON TOP of its
  // grant; set_vault_secret had only the grant. Both are unreachable from
  // `authenticated` today, but the asymmetry means a future convenience grant
  // would leave the read protected and silently open the write. A route that
  // stores a credential is about to be built on this function.
  it('rejects callers that are not service_role/postgres/supabase_admin', () => {
    expect(sql).toMatch(/set_vault_secret/);
    expect(sql).toMatch(/service_role/);
    expect(sql).toMatch(/RAISE EXCEPTION/i);
  });

  it('keeps the grant revoked from public', () => {
    expect(sql).toMatch(/REVOKE EXECUTE[\s\S]*FROM public/i);
  });

  it('does not log or return the secret value', () => {
    // A SECURITY DEFINER function that RAISEs with the value, or returns it,
    // would put a credential into Postgres logs.
    expect(sql).not.toMatch(/RAISE\s+(NOTICE|LOG|INFO|WARNING)[\s\S]{0,120}secret_value/i);
    expect(sql).not.toMatch(/RETURNS\s+text/i); // it returns the secret's uuid, never the value
  });
});
