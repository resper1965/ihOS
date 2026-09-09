// Operator script: deliver a Standard API key, and prove what it can reach.
//
//   npm run probe:standard-api           # probe whatever is configured
//   npm run probe:standard-api -- --set  # paste a new key, then probe
//
// Reads .env then .env.local (same order as scripts/run-scf-sync.ts, so
// .env.local wins). It NEVER prints the key: only its marker, an 8-char
// prefix and its length, which is enough to tell two keys apart and not
// enough to use one.
//
// `--set` reads the key from STDIN, never from argv. That is deliberate: an
// argument lands in shell history and in the process list, where a second
// person on the machine can read it. Stdin lands in neither. The key goes
// into .env.local, which is git-ignored — it is never pasted into a
// conversation, a commit, or a terminal transcript.
//
// Replaces scripts/test_grc_api.js, which had a live standard_live_ key
// hardcoded as its fallback in a public repository.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';

const MARKERS = ['standard_live_', 'standard_test_'] as const;
const ENV_LOCAL = '.env.local';
const VAR = 'STANDARD_GRC_API_KEY';

/** Reads one line from stdin without echoing it back. */
async function readKeyFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8').trim();
}

/**
 * Writes the key into .env.local, replacing an existing line rather than
 * appending a second one — two definitions of the same variable is how a
 * rotation silently fails to take effect.
 */
function writeKey(key: string): 'replaced' | 'appended' {
  const existing = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, 'utf8') : '';
  const lines = existing.split('\n');
  const idx = lines.findIndex((l) => l.startsWith(`${VAR}=`));
  if (idx >= 0) {
    lines[idx] = `${VAR}=${key}`;
    writeFileSync(ENV_LOCAL, lines.join('\n'));
    return 'replaced';
  }
  const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  writeFileSync(ENV_LOCAL, `${existing}${sep}${VAR}=${key}\n`);
  return 'appended';
}

async function setKey(): Promise<number> {
  console.log(`Paste the key, then press Enter and Ctrl+D (Ctrl+Z Enter on Windows).`);
  console.log(`It is not echoed, not logged, and goes straight into ${ENV_LOCAL}.\n`);
  const key = await readKeyFromStdin();
  const marker = MARKERS.find((m) => key.startsWith(m));
  if (!marker) {
    // Deliberately does not print what was read — a rejected paste is often a
    // valid secret pasted into the wrong prompt.
    console.error(`Rejected: a key must start with ${MARKERS.join(' or ')}. Nothing written.`);
    return 1;
  }
  if (key.length < 24) {
    console.error(`Rejected: ${key.length} chars is too short to be a key. Nothing written.`);
    return 1;
  }
  const how = writeKey(key);
  console.log(`${how === 'replaced' ? 'Replaced' : 'Added'} ${VAR} in ${ENV_LOCAL}: ${marker}${key.slice(marker.length, marker.length + 8)}… (${key.length} chars)\n`);
  // Re-read so the probe below sees what was just written.
  loadEnv({ path: ENV_LOCAL, override: true });
  return 0;
}

loadEnv({ path: '.env' });
loadEnv({ path: ENV_LOCAL, override: true });

/**
 * Endpoints worth knowing about, in two groups: what the product calls today,
 * and what the reformulated API added that it does not call yet. A probe is a
 * GET unless stated; POST bodies are omitted deliberately — a 401/403 answers
 * the reachability question without writing anything.
 */
const PROBES: Array<{ path: string; note: string; used: boolean }> = [
  // ── consumed by the product today ──
  { path: '/scf/versions/latest', note: 'catalogue version pin', used: true },
  { path: '/scf/frameworks?limit=1', note: 'framework catalogue', used: true },

  // ── added by the reformulation; not wired in yet ──
  { path: '/scf/strm?limit=1', note: 'STRM crosswalk, filterable', used: false },
  { path: '/scf/strm/lookup?fde_code=AC-1&limit=1', note: 'crosswalk by FDE code', used: false },
  { path: '/scf/controls/by-code/GOV-01?', note: 'stable control resolution', used: false },
];

/** Parses the API's own 403 body: "...required scope(s): X. Key has: Y." */
function parseScopes(detail: string | undefined): string | null {
  if (!detail) return null;
  const m = detail.match(/required scope\(s\):\s*([^.]+)\.\s*Key has:\s*([^.]+)\.?/i);
  return m ? `missing [${m[1].trim()}] — holds [${m[2].trim()}]` : null;
}

async function main(): Promise<number> {
  if (process.argv.includes('--set')) {
    const code = await setKey();
    if (code !== 0) return code;
  }

  const BASE = process.env.STANDARD_GRC_API_URL;
  const KEY = process.env.STANDARD_GRC_API_KEY;

  if (!BASE) {
    console.error('STANDARD_GRC_API_URL is not set. Expected to end in /api/v1.');
    return 1;
  }
  if (!BASE.endsWith('/api/v1')) {
    console.error(`STANDARD_GRC_API_URL does not end in /api/v1: ${BASE}`);
    console.error('The client sends paths without that segment, so every call 404s.');
    return 1;
  }
  if (!KEY) {
    console.error('STANDARD_GRC_API_KEY is not set in .env or .env.local.');
    console.error('Deliver it with: npm run probe:standard-api -- --set');
    return 1;
  }

  const marker = MARKERS.find((m) => KEY.startsWith(m));
  if (!marker) {
    console.error(`Key does not start with ${MARKERS.join(' or ')} — wrong value or wrong variable.`);
    return 1;
  }

  console.log(`base    ${BASE}`);
  console.log(`key     ${marker}${KEY.slice(marker.length, marker.length + 8)}… (${KEY.length} chars)`);
  // The header is deliberately absent: a key is bound to its own organization,
  // and sending x-standard-tenant-id makes otherwise-fine requests 403.
  console.log(`tenant  header not sent${process.env.STANDARD_GRC_TENANT_ID ? ' — but STANDARD_GRC_TENANT_ID IS SET, unset it' : ''}`);
  console.log('');

  let reachable = 0;
  for (const probe of PROBES) {
    let line: string;
    try {
      const res = await fetch(`${BASE}${probe.path}`, {
        headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
      });
      const body = res.ok ? '' : await res.text().catch(() => '');
      let detail: string | undefined;
      try {
        detail = JSON.parse(body)?.detail ?? JSON.parse(body)?.error?.message;
      } catch {
        detail = body.slice(0, 120) || undefined;
      }
      const scopes = res.status === 403 ? parseScopes(detail) : null;
      line = `${res.status}${scopes ? `  ${scopes}` : detail && !res.ok ? `  ${detail}` : ''}`;
      if (res.ok) reachable += 1;
    } catch (err) {
      line = `NETWORK  ${err instanceof Error ? err.message : String(err)}`;
    }
    console.log(`${probe.used ? 'used' : 'new '}  ${line.padEnd(28)}  ${probe.path}  — ${probe.note}`);
  }

  console.log('');
  console.log(`${reachable} of ${PROBES.length} probes returned 200.`);
  return reachable === 0 ? 1 : 0;
}

main().then((code) => process.exit(code));
