// Walks the vendor's official SCF crosswalk into local storage.
//
// This is the asset the product was missing. `GET /scf/controls/{id}/mappings`
// returns 200 with the key we already hold and gave 65 official mappings for one
// control, each carrying relationship_type, relationship_strength,
// mapping_source, is_official and is_synthetic. The 25,589 rows quarantined in
// migration 20260825000002 were manufactured by prefixing one framework's
// control ids into another's; the vendor's own records state their provenance,
// so reading this endpoint makes that fabrication impossible by construction.
//
// It is raw material, not an answer. What a relationship type contributes to a
// framework figure is decided in src/lib/assessment/curation/policy.ts, once,
// explicitly, with a version stamped onto every number. Nothing here decides.
//
// Cost, measured 2026-08-27 by running it: 1,473 controls × one request, and the
// binding constraint is the API's own latency, NOT the rate limit. Each mappings
// call takes ~2.6s, so a full walk is roughly SIXTY-FOUR minutes. The 120-req/60s
// limit would allow 110 per minute; we get ~23. An earlier estimate of "13
// minutes" assumed the rate limit bound it, and that estimate is what made a
// working run look stalled.
//
// There is no bulk export for mappings and no changed-since delta, so this is
// resumable by control_code and must never run per assessment.

import { createAdminClient } from '@/lib/supabase/admin';
import { createThrottle, type Throttle } from './throttle';

const API_BASE = process.env.STANDARD_GRC_API_URL ?? 'https://standard-api.bekaa.eu/api/v1';
// Small on purpose. At ~11 mappings per control, 500 rows is ~45 controls and
// ~2 minutes with nothing written and nothing visible — long enough that an
// operator checking progress concludes the walk is stuck. 100 rows is ~9
// controls, so progress appears within half a minute and a crash loses less.
const UPSERT_BATCH = 100;

/** Vendor vocabulary, exactly these five as of 2026-08-27. */
export const RELATIONSHIP_TYPES = [
  'equal',
  'subset',
  'intersects',
  'superset',
  'no_relation',
] as const;

export type Relationship = (typeof RELATIONSHIP_TYPES)[number];

/**
 * A mapping whose relationship the vendor has not recorded.
 *
 * Distinct from `intersects`, and the distinction matters. `intersects` asserts
 * partial overlap; null asserts nothing. The vendor is replacing a hardcoded
 * `intersects` — `xlsx-importer.ts:353` stamped it on every crosswalk row — with
 * values from their STRM bundle, and that bundle holds 5,008 relationships
 * against the 79,133 mappings the API serves. So roughly 94% will arrive null,
 * and treating those as `intersects` would preserve the fabrication under a new
 * name.
 */
export type MaybeRelationship = Relationship | null;

/**
 * Not "possibly wrong" — definitively meaningless, on every official row.
 *
 * The vendor's importer converts the source's numeric 0-10 strength into an enum
 * ("strong" | "moderate" | "weak") before storing it. Seeding then ran
 * `(parseFloat(row.relationship_strength) || 0.5).toFixed(3)`, and
 * `parseFloat("strong")` is NaN — so the `|| 0.5` fired everywhere. Every
 * strength the API serves today is this exact value, derived from nothing, with
 * the real numeric strength discarded a step earlier.
 *
 * Their instruction: treat every ingested strength as void, not unverified.
 * Rows carrying it are marked so a re-read can find them once their fix ships.
 */
const VOID_STRENGTH = 0.5;

export interface StoredMapping {
  scf_version_id: string;
  control_code: string;
  requirement_code: string;
  framework_code: string;
  mapping_uuid: string | null;
  requirement_uuid: string | null;
  relationship_type: MaybeRelationship;
  relationship_strength: number | null;
  strength_is_trustworthy: boolean;
  mapping_source: string | null;
  is_official: boolean;
  is_synthetic: boolean;
}

export type Classified =
  | { store: true; value: StoredMapping; reason?: undefined }
  | {
      store: false;
      value?: undefined;
      reason: 'self_referential' | 'no_requirement_code' | 'no_framework_code';
    };

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Decide whether one vendor mapping row is storable, and shape it if so.
 *
 * Throws on an unrecognised `relationship_type`. That is deliberate and the
 * migration's CHECK constraint mirrors it: if the vendor adds a sixth type, the
 * sync must fail loudly rather than persist a value the curation policy has no
 * rule for.
 */
export function classifyMapping(m: Record<string, unknown>, scfVersionId: string): Classified {
  // Absent is allowed; unrecognised is not.
  //
  // A null relationship_type means the vendor has not recorded how this control
  // relates to this requirement. That is a real and honest state, and it is about
  // to become the common one: they are replacing the hardcoded `intersects` from
  // xlsx-importer.ts:353 with values from their STRM bundle, which covers 5,008
  // of 79,133 mappings. Rejecting null would kill the sync on its first row.
  //
  // A value we have never seen still throws. That guard is about a SIXTH
  // relationship type appearing — something the curation policy would have no
  // rule for — and it stays.
  const raw = m.relationship_type;
  let rel: MaybeRelationship;
  if (raw === null || raw === undefined || raw === '') {
    rel = null;
  } else if (RELATIONSHIP_TYPES.includes(raw as Relationship)) {
    rel = raw as Relationship;
  } else {
    throw new Error(
      `unknown relationship_type: ${String(raw)} — the curation policy has no rule for it`,
    );
  }

  // The catalogue mapped onto itself. Real, and worth dropping: counting it
  // would inflate every denominator. Identified by framework_code, which is
  // populated — NOT by an empty scf_framework_id, which the vendor has
  // confirmed was a hardcoded bug rather than a signal.
  const framework = str(m.framework_code);
  if (framework !== null && /Secure Controls Framework/i.test(framework)) {
    return { store: false, reason: 'self_referential' };
  }
  if (framework === null) {
    // A mapping with no framework belongs to no denominator, and framework_code
    // is part of the primary key (see migration 20260828000003).
    return { store: false, reason: 'no_framework_code' };
  }

  const requirementCode = str(m.requirement_code);
  if (requirementCode === null) {
    // Without it there is nothing to key a denominator on.
    return { store: false, reason: 'no_requirement_code' };
  }

  const controlCode = str(m.control_code);
  if (controlCode === null) {
    return { store: false, reason: 'no_requirement_code' };
  }

  // A missing strength stays missing. Not 0, not 0.5 — that substitution is
  // exactly the defect the vendor disclosed on their own side.
  const rawStrength = m.relationship_strength;
  let strength: number | null = null;
  if (typeof rawStrength === 'number' && Number.isFinite(rawStrength)) {
    strength = rawStrength;
  } else if (typeof rawStrength === 'string' && rawStrength.trim() !== '') {
    const parsed = Number(rawStrength);
    strength = Number.isFinite(parsed) ? parsed : null;
  }

  return {
    store: true,
    value: {
      scf_version_id: scfVersionId,
      control_code: controlCode,
      requirement_code: requirementCode,
      framework_code: framework,
      mapping_uuid: str(m.id),
      requirement_uuid: str(m.scf_framework_requirement_id),
      relationship_type: rel,
      relationship_strength: strength,
      strength_is_trustworthy: strength !== VOID_STRENGTH,
      mapping_source: str(m.mapping_source),
      is_official: m.is_official === true,
      is_synthetic: m.is_synthetic === true,
    },
  };
}

// ── The walk ────────────────────────────────────────────────────────────────

export interface CrosswalkSyncResult {
  scfVersionId: string;
  /** Controls skipped because they already had mappings stored. */
  controlsAlreadyDone: number;
  controlsWalked: number;
  mappingsStored: number;
  skippedSelfReferential: number;
  skippedNoRequirement: number;
  /** Controls whose mappings could not be fetched, with the reason. */
  failures: Array<{ controlCode: string; reason: string }>;
  /** Where a resumed run should pick up, if it stopped early. */
  lastControlCode: string | null;
}

interface ControlsQuery
  extends PromiseLike<{
    data: Array<{ control_code: string; control_uuid?: string }> | null;
    error: { message: string } | null;
  }> {
  eq(col: string, v: string): ControlsQuery;
  gt(col: string, v: string): ControlsQuery;
  order(col: string): ControlsQuery;
  range(from: number, to: number): ControlsQuery;
}

interface UpsertableClient {
  from(table: string): {
    select(cols: string): ControlsQuery;
    upsert(
      rows: Array<Record<string, unknown>>,
      opts: { onConflict: string },
    ): Promise<{ error: { message: string } | null }>;
  };
}

export async function syncCrosswalk(
  scfVersionId: string,
  opts: {
    throttle?: Throttle;
    /** Resume a walk that stopped: only controls after this code are fetched. */
    resumeAfterControlCode?: string;
    /**
     * Skip controls that already have at least one mapping stored.
     *
     * Prefer this over resumeAfterControlCode for resuming an interrupted walk.
     * Resuming by code assumes what is stored forms a contiguous prefix, and it
     * does not: a probe that walked the tail, or any earlier partial run, leaves
     * islands. Resuming after the highest stored code would then skip everything
     * between — silently, and reporting success. Asking which controls are
     * missing is order-independent and cannot make that mistake.
     */
    skipControlsWithMappings?: boolean;
    onProgress?: (walked: number, stored: number) => void;
  } = {},
): Promise<CrosswalkSyncResult> {
  const throttle = opts.throttle ?? createThrottle();
  const supabase = createAdminClient() as unknown as UpsertableClient;
  let result0SkippedAlreadyDone = 0;
  const key = process.env.STANDARD_GRC_API_KEY;
  if (!key) throw new Error('STANDARD_GRC_API_KEY is not set');

  // Ascending control_code order is what makes resumption a single comparison.
  //
  // Paged explicitly with .range(): supabase-js caps an unbounded select at
  // 1,000 rows, and the catalogue is 1,473. Without this the walk would cover
  // the first 1,000 controls, report success, and leave 473 unmapped — the same
  // silent-truncation shape as the vendor's NDJSON export.
  const READ_PAGE = 1000;
  const readAll = async (
    table: string,
    cols: string,
    apply: (q: ControlsQuery) => ControlsQuery,
  ) => {
    const out: Array<{ control_code: string; control_uuid?: string }> = [];
    for (let from = 0; ; from += READ_PAGE) {
      const { data, error } = await apply(
        supabase.from(table).select(cols),
      ).range(from, from + READ_PAGE - 1);
      if (error) throw new Error(`could not read ${table}: ${error.message}`);
      const rows = data ?? [];
      out.push(...rows);
      if (rows.length < READ_PAGE) break;
    }
    return out;
  };

  let controls = await readAll('scf_controls_cache', 'control_code, control_uuid', (q) =>
    q
      .eq('scf_version_id', scfVersionId)
      .gt('control_code', opts.resumeAfterControlCode ?? '')
      .order('control_code'),
  );

  if (opts.skipControlsWithMappings === true) {
    const done = new Set(
      (
        await readAll('scf_control_mappings', 'control_code', (q) =>
          q.eq('scf_version_id', scfVersionId).order('control_code'),
        )
      ).map((r) => r.control_code),
    );
    const before = controls.length;
    controls = controls.filter((c) => !done.has(c.control_code));
    result0SkippedAlreadyDone = before - controls.length;
  }

  const result: CrosswalkSyncResult = {
    scfVersionId,
    controlsAlreadyDone: result0SkippedAlreadyDone,
    controlsWalked: 0,
    mappingsStored: 0,
    skippedSelfReferential: 0,
    skippedNoRequirement: 0,
    failures: [],
    lastControlCode: null,
  };

  // Keyed by the primary key, not an array, so an intra-batch duplicate is
  // overwritten before it reaches Postgres. ON CONFLICT DO UPDATE cannot resolve
  // two conflicting rows inside ONE statement — it raises "cannot affect row a
  // second time" — so the key must be unique in the batch as well as the table.
  // That is exactly how this bug first surfaced.
  let batch = new Map<string, Record<string, unknown>>();
  const batchKey = (v: StoredMapping) =>
    `${v.scf_version_id}|${v.control_code}|${v.framework_code}|${v.requirement_code}`;

  const flush = async () => {
    if (batch.size === 0) return;
    const { error: upsertError } = await supabase
      .from('scf_control_mappings')
      .upsert([...batch.values()], { onConflict: 'scf_version_id,control_code,framework_code,requirement_code' });
    if (upsertError) throw new Error(`upsert into scf_control_mappings failed: ${upsertError.message}`);
    result.mappingsStored += batch.size;
    batch = new Map();
  };

  for (const control of controls) {
    const uuid = control.control_uuid;
    if (!uuid) {
      result.failures.push({ controlCode: control.control_code, reason: 'no control_uuid cached' });
      continue;
    }

    let rows: unknown[];
    try {
      rows = await throttle.run(async () => {
        const res = await fetch(`${API_BASE}/scf/controls/${encodeURIComponent(uuid)}/mappings`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        const remaining = res.headers.get('x-ratelimit-remaining');
        if (remaining !== null && Number.isFinite(Number(remaining))) {
          throttle.observeRemaining(Number(remaining));
        }
        if (!res.ok) {
          const err = new Error(`mappings for ${control.control_code} → ${res.status}`) as Error & {
            status?: number;
            retryAfterMs?: number;
          };
          err.status = res.status;
          const retryAfter = res.headers.get('retry-after');
          if (retryAfter !== null && Number.isFinite(Number(retryAfter))) {
            err.retryAfterMs = Number(retryAfter) * 1000;
          }
          throw err;
        }
        const body = (await res.json()) as { data?: unknown[] };
        return body.data ?? [];
      });
    } catch (err) {
      // One control's failure does not end the walk — but it is recorded, and
      // lastControlCode still advances so a resume does not silently re-skip it.
      result.failures.push({
        controlCode: control.control_code,
        reason: err instanceof Error ? err.message : String(err),
      });
      result.lastControlCode = control.control_code;
      continue;
    }

    for (const raw of rows) {
      const classified = classifyMapping(raw as Record<string, unknown>, scfVersionId);
      if (!classified.store) {
        if (classified.reason === 'self_referential') result.skippedSelfReferential++;
        else result.skippedNoRequirement++;
        continue;
      }
      batch.set(
        batchKey(classified.value),
        classified.value as unknown as Record<string, unknown>,
      );
      if (batch.size >= UPSERT_BATCH) await flush();
    }

    result.controlsWalked++;
    result.lastControlCode = control.control_code;
    opts.onProgress?.(result.controlsWalked, result.mappingsStored + batch.size);
  }

  await flush();
  return result;
}
