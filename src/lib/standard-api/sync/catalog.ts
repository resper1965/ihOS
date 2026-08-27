// Loads the vendor's SCF catalogue into local storage.
//
// This is the spine: after this runs, `scf_controls_cache` is the ONLY control
// base in the product. It replaces src/lib/assessment/data/iso27001-annex-a.json,
// a committed duplicate of 93 ISO Annex A controls whose existence forced
// local-engine.ts to guess an SCF code per control (and fall back to a
// hardcoded default when the guess failed).
//
// Measured contract, 2026-08-27 — see docs/standard-api/CONTRACT_AUDIT.md §H:
//   - Controls have an NDJSON bulk export. One request, whole catalogue.
//   - There is no total count, and the vendor has said none is coming. Counting
//     the streamed lines is the only way to learn the catalogue's size.
//   - Frameworks: 272 rows, and `offset`/`limit` are currently ignored there
//     (asked as Q8), so one request returns everything anyway.
//   - Every UUID rotates per SCF version. Keys are (scf_version_id, code).

import { createAdminClient } from '@/lib/supabase/admin';
import { createThrottle, type Throttle } from './throttle';

const API_BASE = process.env.STANDARD_GRC_API_URL ?? 'https://standard-api.bekaa.eu/api/v1';

/** Rows are written in batches this size. Postgres, not the vendor, sets this. */
const UPSERT_BATCH = 500;

export interface CatalogSyncResult {
  scfVersionId: string;
  synced: number;
  /** Rows the vendor sent that we could not use, with the reason. */
  rejected: Array<{ line: number; reason: string }>;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = process.env.STANDARD_GRC_API_KEY;
  if (!key) throw new Error('STANDARD_GRC_API_KEY is not set');
  return { Authorization: `Bearer ${key}`, ...extra };
}

/** Reads `x-ratelimit-remaining` so the throttle can defer to the server. */
function observe(res: Response, throttle: Throttle): void {
  const remaining = res.headers.get('x-ratelimit-remaining');
  if (remaining !== null) {
    const n = Number(remaining);
    if (Number.isFinite(n)) throttle.observeRemaining(n);
  }
}

async function requestJson<T>(path: string, throttle: Throttle): Promise<T> {
  return throttle.run(async () => {
    const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
    observe(res, throttle);
    if (!res.ok) {
      const err = new Error(`GET ${path} → ${res.status}`) as Error & {
        status?: number;
        retryAfterMs?: number;
      };
      err.status = res.status;
      const retryAfter = res.headers.get('retry-after');
      if (retryAfter !== null) {
        const secs = Number(retryAfter);
        if (Number.isFinite(secs)) err.retryAfterMs = secs * 1000;
      }
      throw err;
    }
    return (await res.json()) as T;
  });
}

export async function getLatestScfVersionId(throttle: Throttle): Promise<string> {
  const body = await requestJson<{ data?: Array<{ scf_version_id?: string }> }>(
    '/scf/versions',
    throttle,
  );
  const id = body.data?.[0]?.scf_version_id;
  if (!id) throw new Error('/scf/versions returned no scf_version_id');
  return id;
}

// ── Frameworks ──────────────────────────────────────────────────────────────

interface VendorFramework {
  framework_id?: string;
  framework_code?: string;
  framework_name?: string;
  status?: string;
  is_synthetic?: boolean;
}

export async function syncFrameworkCatalog(
  scfVersionId: string,
  throttle: Throttle = createThrottle(),
): Promise<CatalogSyncResult> {
  const supabase = upsertable();
  const body = await requestJson<{ data?: VendorFramework[] }>(
    `/scf/frameworks?scf_version=${encodeURIComponent(scfVersionId)}&limit=100`,
    throttle,
  );

  const rejected: CatalogSyncResult['rejected'] = [];
  const rows: Array<Record<string, unknown>> = [];

  (body.data ?? []).forEach((f, i) => {
    if (!f.framework_code || !f.framework_id) {
      rejected.push({ line: i, reason: 'missing framework_code or framework_id' });
      return;
    }
    rows.push({
      scf_version_id: scfVersionId,
      framework_code: f.framework_code,
      framework_uuid: f.framework_id,
      framework_name: f.framework_name ?? f.framework_code,
      status: f.status ?? 'unknown',
      is_synthetic: f.is_synthetic ?? false,
      synced_at: new Date().toISOString(),
    });
  });

  await upsertAll(supabase, 'scf_framework_catalog', rows, 'scf_version_id,framework_code');
  return { scfVersionId, synced: rows.length, rejected };
}

// ── Controls, via the NDJSON stream ─────────────────────────────────────────

interface VendorControl {
  control_id?: string;
  control_code?: string;
  control_title?: string;
  control_description?: string;
  scf_domain_id?: string;
  status?: string;
  is_synthetic?: boolean;
}

function controlRow(c: VendorControl, scfVersionId: string): Record<string, unknown> | null {
  if (!c.control_code || !c.control_id) return null;
  return {
    scf_version_id: scfVersionId,
    control_code: c.control_code,
    control_uuid: c.control_id,
    control_title: c.control_title ?? c.control_code,
    control_description: c.control_description ?? null,
    scf_domain_uuid: c.scf_domain_id ?? null,
    status: c.status ?? 'unknown',
    is_synthetic: c.is_synthetic ?? false,
    synced_at: new Date().toISOString(),
  };
}

export async function syncControlCatalog(
  scfVersionId: string,
  throttle: Throttle = createThrottle(),
  onProgress?: (synced: number) => void,
): Promise<CatalogSyncResult> {
  const supabase = upsertable();
  const rejected: CatalogSyncResult['rejected'] = [];
  let synced = 0;
  let batch: Array<Record<string, unknown>> = [];
  let lineNo = 0;

  const res = await throttle.run(async () => {
    const r = await fetch(
      `${API_BASE}/scf/versions/${encodeURIComponent(scfVersionId)}/controls`,
      { headers: authHeaders({ Accept: 'application/x-ndjson' }) },
    );
    observe(r, throttle);
    if (!r.ok) {
      const err = new Error(`NDJSON controls → ${r.status}`) as Error & { status?: number };
      err.status = r.status;
      throw err;
    }
    return r;
  });

  if (!res.body) throw new Error('NDJSON controls returned no body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';

  const flush = async () => {
    if (batch.length === 0) return;
    await upsertAll(supabase, 'scf_controls_cache', batch, 'scf_version_id,control_code');
    synced += batch.length;
    batch = [];
    onProgress?.(synced);
  };

  const take = async (line: string) => {
    const trimmed = line.trim();
    if (trimmed === '') return;
    lineNo++;
    let parsed: VendorControl;
    try {
      parsed = JSON.parse(trimmed) as VendorControl;
    } catch {
      rejected.push({ line: lineNo, reason: 'unparseable JSON line' });
      return;
    }
    // Some NDJSON producers wrap each record; accept both shapes.
    const candidate = (parsed as { data?: VendorControl }).data ?? parsed;
    const row = controlRow(candidate, scfVersionId);
    if (!row) {
      rejected.push({ line: lineNo, reason: 'missing control_code or control_id' });
      return;
    }
    batch.push(row);
    if (batch.length >= UPSERT_BATCH) await flush();
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    for (const line of lines) await take(line);
  }
  if (buffered.length > 0) await take(buffered);
  await flush();

  // Deliberately no assertion that `synced` equals 1,468. That number is an
  // observation from 2026-08-27, and the vendor has confirmed no total count
  // exists — asserting it would be asserting a fact we were told not to rely on.
  return { scfVersionId, synced, rejected };
}

// ── Shared write path ───────────────────────────────────────────────────────

// The four spine tables are created by migration 20260828000001 and are not yet
// in src/lib/supabase/types.generated.ts, so the generated client cannot type
// `.from('scf_controls_cache')`. Rather than cast the whole client at each call
// site — which drags the full generic signature into the parameter type and
// fails to match — this names the minimal shape the writes actually use.
interface UpsertableClient {
  from(table: string): {
    upsert(
      rows: Array<Record<string, unknown>>,
      opts: { onConflict: string },
    ): Promise<{ error: { message: string } | null }>;
  };
}

/** The one place the untyped-table cast happens. */
function upsertable(): UpsertableClient {
  return createAdminClient() as unknown as UpsertableClient;
}

async function upsertAll(
  supabase: UpsertableClient,
  table: string,
  rows: Array<Record<string, unknown>>,
  onConflict: string,
): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const slice = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase.from(table).upsert(slice, { onConflict });
    if (error) throw new Error(`upsert into ${table} failed: ${error.message}`);
  }
}
