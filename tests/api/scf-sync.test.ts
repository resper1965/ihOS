import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const route = readFileSync(
  resolve(process.cwd(), 'src/app/api/admin/sync/scf/route.ts'),
  'utf8',
);
const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260828000002_scf_sync_jobs.sql'),
  'utf8',
);

describe('the SCF sync route is gated before it does anything', () => {
  it('rejects an anonymous caller before reading the body', () => {
    // Order matters: getUser() and the 401 must precede req.json(). A route that
    // parses input first has already accepted work from an unauthenticated
    // caller, even if it later refuses to act on it.
    const authAt = route.indexOf('auth.getUser()');
    const bodyAt = route.indexOf('req.json()');
    expect(authAt).toBeGreaterThan(-1);
    expect(bodyAt).toBeGreaterThan(-1);
    expect(authAt).toBeLessThan(bodyAt);
    expect(route).toMatch(/status:\s*401/);
  });

  it('requires an admin or ionic_user role, not merely a session', () => {
    // This is the gate api/compliance/mappings/upload was missing while
    // CONTRACT_AUDIT claimed it had one: getUser() then a service-role write.
    expect(route).toMatch(/from\(['"]profiles['"]\)/);
    expect(route).toMatch(/role/);
    expect(route).toMatch(/'admin'/);
    expect(route).toMatch(/'ionic_user'/);
    expect(route).toMatch(/status:\s*403/);
  });

  it('checks the role before creating a job row', () => {
    const roleCheckAt = route.indexOf("'ionic_user'");
    const insertAt = route.indexOf('.insert(');
    expect(roleCheckAt).toBeLessThan(insertAt);
  });
});

describe('the sync refuses to run twice at once', () => {
  it('returns 409 when a job is already running', () => {
    // Two concurrent walks would spend the same 120-per-60s vendor budget
    // against each other, and the second would repeat the first's work rather
    // than extend it.
    expect(route).toMatch(/status:\s*409/);
    expect(route).toMatch(/already running/i);
  });

  it('enforces that in the database, not only in the route', () => {
    // A route-level check races with itself. The partial unique index makes the
    // invariant true rather than merely intended.
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*?WHERE status = 'running'/);
  });
});

describe('a long walk survives the request that started it', () => {
  it('does not await the sync inside the handler', () => {
    // 13 minutes exceeds any serverless request budget. The work is started and
    // followed through the job row.
    expect(route).toMatch(/void runSync\(/);
    expect(route).toMatch(/maxDuration/);
  });

  it('records where a failed run stopped, so a resume is possible', () => {
    expect(route).toMatch(/resumeAfterControlCode/);
    expect(route).toMatch(/lastControlCode/);
    // The failure path must persist progress rather than discard it.
    expect(route).toMatch(/status:\s*['"]failed['"]/);
  });

  it('returns a job id the caller can poll', () => {
    expect(route).toMatch(/jobId/);
    expect(route).toMatch(/export async function GET/);
  });
});

describe('the job row holds no secret', () => {
  it('never stores or returns the API key', () => {
    // Comments stripped first. Both files explain that they hold no secret, and
    // a naive grep matches the explanation — the same way the local-engine
    // retirement tests first failed against a correct implementation. An
    // assertion about absent code must not read the prose describing it.
    const code = (s: string) =>
      s
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/.*$/gm, '')
        .replace(/^[ \t]*--.*$/gm, '')
        .replace(/COMMENT ON [\s\S]*?;/gi, '');

    expect(code(route)).not.toMatch(/STANDARD_GRC_API_KEY/);
    expect(code(migration)).not.toMatch(/api_key|secret|token/i);
  });
});
