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
// Cost, measured 2026-08-27: ~1,468 controls × one request, against 120 req/60s.
// Roughly 13 minutes. There is no bulk export for mappings and no changed-since
// delta, so this is resumable by control_code and must never run per assessment.

import { createAdminClient } from '@/lib/supabase/admin';
import { createThrottle, type Throttle } from './throttle';

const API_BASE = process.env.STANDARD_GRC_API_URL ?? 'https://standard-api.bekaa.eu/api/v1';
const UPSERT_BATCH = 500;

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
 * The vendor's pre-2026-08-27 seeding was
 * `(parseFloat(row.relationship_strength) || 0.5).toFixed(3)`, so an
 * unparseable source value became this exact number. Any row carrying it may be
 * a parse failure wearing a measurement's clothes.
 */
const SUSPECT_STRENGTH = 0.5;

export interface StoredMapping {
  scf_version_id: string;
  control_code: string;
  requirement_code: string;
  framework_code: string | null;
  mapping_uuid: string | null;
  requirement_uuid: string | null;
  relationship_type: Relationship;
  relationship_strength: number | null;
  strength_is_trustworthy: boolean;
  mapping_source: string | null;
  is_official: boolean;
  is_synthetic: boolean;
}

export type Classified =
  | { store: true; value: StoredMapping; reason?: undefined }
  | { store: false; value?: undefined; reason: 'self_referential' | 'no_requirement_code' };

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
  const rel = m.relationship_type as Relationship;
  if (!RELATIONSHIP_TYPES.includes(rel)) {
    throw new Error(
      `unknown relationship_type: ${String(rel)} — the curation policy has no rule for it`,
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
      strength_is_trustworthy: strength !== SUSPECT_STRENGTH,
      mapping_source: str(m.mapping_source),
      is_official: m.is_official === true,
      is_synthetic: m.is_synthetic === true,
    },
  };
}

// ── The walk ────────────────────────────────────────────────────────────────

export interface CrosswalkSyncResult {
  scfVersionId: string;
  controlsWalked: number;
  mappingsStored: number;
  skippedSelfReferential: number;
  skippedNoRequirement: number;
  /** Controls whose mappings could not be fetched, with the reason. */
  failures: Array<{ controlCode: string; reason: string }>;
  /** Where a resumed run should pick up, if it stopped early. */
  lastControlCode: string | null;
}

interface UpsertableClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): {
        gt(col: string, v: string): {
          order(col: string): Promise<{ data: Array<{ control_code: string }> | null; error: { message: string } | null }>;
        };
      };
    };
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
    onProgress?: (walked: number, stored: number) => void;
  } = {},
): Promise<CrosswalkSyncResult> {
  const throttle = opts.throttle ?? createThrottle();
  const supabase = createAdminClient() as unknown as UpsertableClient;
  const key = process.env.STANDARD_GRC_API_KEY;
  if (!key) throw new Error('STANDARD_GRC_API_KEY is not set');

  // Ascending control_code order is what makes resumption a single comparison.
  const { data: controls, error } = await supabase
    .from('scf_controls_cache')
    .select('control_code, control_uuid')
    .eq('scf_version_id', scfVersionId)
    .gt('control_code', opts.resumeAfterControlCode ?? '')
    .order('control_code');
  if (error) throw new Error(`could not read scf_controls_cache: ${error.message}`);

  const result: CrosswalkSyncResult = {
    scfVersionId,
    controlsWalked: 0,
    mappingsStored: 0,
    skippedSelfReferential: 0,
    skippedNoRequirement: 0,
    failures: [],
    lastControlCode: null,
  };

  let batch: Array<Record<string, unknown>> = [];
  const flush = async () => {
    if (batch.length === 0) return;
    const { error: upsertError } = await supabase
      .from('scf_control_mappings')
      .upsert(batch, { onConflict: 'scf_version_id,control_code,requirement_code' });
    if (upsertError) throw new Error(`upsert into scf_control_mappings failed: ${upsertError.message}`);
    result.mappingsStored += batch.length;
    batch = [];
  };

  for (const control of (controls ?? []) as Array<{ control_code: string; control_uuid?: string }>) {
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
      batch.push(classified.value as unknown as Record<string, unknown>);
      if (batch.length >= UPSERT_BATCH) await flush();
    }

    result.controlsWalked++;
    result.lastControlCode = control.control_code;
    opts.onProgress?.(result.controlsWalked, result.mappingsStored + batch.length);
  }

  await flush();
  return result;
}
