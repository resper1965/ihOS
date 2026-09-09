// src/lib/integrations/defectdojo/scf-resolver.ts
// Resolves a finding's ISO 27001 / NIST 800-53 control mappings to SCF codes
// via the versioned spine (scf_control_mappings), reached through a curated
// vendor framework identity (synced from the Standard GRC API).
//
// Fail-closed (Constitution Principle VIII): if no mapping rows exist for a
// control, the finding stays UNMAPPED and is reported as a coverage gap —
// ihOS never invents SCF codes locally.

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import type { DDFinding } from './client';

/** Our local framework codes. The vendor slug is resolved through curation. */
const ISO_FRAMEWORK_CODE = 'iso27001';
const NIST_FRAMEWORK_CODE = 'nist_800_53';

export type ScfRelationship = 'equal' | 'subset' | 'intersects' | 'superset' | null;

export interface ScfLink {
  scfControlCode: string;
  relationshipType: ScfRelationship;
}

export interface ScfResolutionResult {
  /** target framework control (e.g. "A.8.26" or "SI-10") → SCF links */
  byTargetControl: Map<string, ScfLink[]>;
  /** framework controls that had no usable mapping row */
  unmappedControls: string[];
}

/**
 * Strongest first. Used only to dedupe when one finding reaches the same SCF
 * control through two requirements — it decides which relationship to REPORT,
 * never what a figure counts. What counts is decided in curation/policy.ts and
 * nowhere else.
 */
const RELATIONSHIP_RANK: Record<string, number> = {
  equal: 4,
  subset: 3,
  superset: 2,
  intersects: 1,
};

function rank(r: ScfRelationship): number {
  return r === null ? 0 : (RELATIONSHIP_RANK[r] ?? 0);
}

export async function resolveScfMappings(
  admin: SupabaseClient,
  isoControls: string[],
  nistControls: string[],
  deps?: { scfVersionId?: string },
): Promise<ScfResolutionResult> {
  const { resolveVendorFrameworkCode } = await import('@/lib/assessment/curation/identity');
  const { getCachedScfVersionId } = await import('@/lib/standard-api/sync/catalog');

  const byTargetControl = new Map<string, ScfLink[]>();
  const wanted: Array<{ framework: string; controls: string[] }> = [
    { framework: ISO_FRAMEWORK_CODE, controls: [...new Set(isoControls)] },
    { framework: NIST_FRAMEWORK_CODE, controls: [...new Set(nistControls)] },
  ];

  const scfVersionId =
    deps?.scfVersionId ?? (await getCachedScfVersionId(admin as never));

  for (const { framework, controls } of wanted) {
    if (controls.length === 0) continue;

    // A framework nobody has curated leaves its findings unmapped. It must not
    // stop the other framework from resolving, so this is caught rather than
    // thrown — the caller still learns, through unmappedControls.
    let slug: string;
    try {
      slug = await resolveVendorFrameworkCode(framework, admin as never);
    } catch (err) {
      logger.warn('no curated vendor identity for framework', {
        context: 'defectdojo/scf-resolver',
        meta: { framework, error: err instanceof Error ? err.message : String(err) },
      });
      continue;
    }

    const { data, error } = await admin
      .from('scf_control_mappings')
      .select('requirement_code, control_code, relationship_type')
      .eq('scf_version_id', scfVersionId)
      .eq('framework_code', slug)
      .in('requirement_code', controls);

    if (error) {
      logger.warn('SCF mapping lookup failed', {
        context: 'defectdojo/scf-resolver',
        meta: { framework, slug, error: error.message },
      });
      continue;
    }

    for (const row of (data ?? []) as Array<{
      requirement_code: string;
      control_code: string | null;
      relationship_type: string | null;
    }>) {
      if (!row.control_code) continue;
      // no_relation is the vendor stating these do NOT relate. Carrying it
      // forward would attach a vulnerability to a control the crosswalk
      // explicitly says it does not touch. A null is different: the vendor
      // recorded nothing, which is an absence, not a denial.
      if (row.relationship_type === 'no_relation') continue;

      const existing = byTargetControl.get(row.requirement_code) ?? [];
      if (!existing.some((l) => l.scfControlCode === row.control_code)) {
        existing.push({
          scfControlCode: row.control_code,
          relationshipType: (row.relationship_type ?? null) as ScfRelationship,
        });
      }
      byTargetControl.set(row.requirement_code, existing);
    }
  }

  const allWanted = [...new Set([...isoControls, ...nistControls])];
  const unmappedControls = allWanted.filter((c) => !byTargetControl.has(c));

  return { byTargetControl, unmappedControls };
}

/**
 * Given one finding's framework controls and a pre-resolved mapping table,
 * return the deduplicated SCF links the finding lands on.
 */
export function scfControlsForFinding(
  resolution: ScfResolutionResult,
  isoControls: string[],
  nistControls: string[],
): ScfLink[] {
  const strongest = new Map<string, ScfLink>();
  for (const target of [...isoControls, ...nistControls]) {
    for (const link of resolution.byTargetControl.get(target) ?? []) {
      const held = strongest.get(link.scfControlCode);
      if (held === undefined || rank(link.relationshipType) > rank(held.relationshipType)) {
        strongest.set(link.scfControlCode, link);
      }
    }
  }
  return [...strongest.values()].sort((a, b) =>
    a.scfControlCode.localeCompare(b.scfControlCode),
  );
}

/**
 * Shapes one runtime_control_signals row for a finding/SCF-link pair.
 * Pulled out of the cron route so the hand-off from `link.relationshipType`
 * into the persisted row is unit-testable without standing up the whole
 * DefectDojo/Supabase-mocked GET handler.
 */
export function buildSignalRow(
  finding: DDFinding,
  link: ScfLink,
  productVersionId: string | null,
  syncedAt: string,
): Record<string, unknown> {
  return {
    scf_control_code: link.scfControlCode,
    relationship_type: link.relationshipType,
    product_version_id: productVersionId,
    source: 'defectdojo',
    source_ref: String(finding.id),
    title: finding.title,
    severity: finding.severity,
    active: finding.active,
    verified: finding.verified,
    risk_accepted: finding.risk_accepted,
    is_mitigated: finding.is_mitigated,
    observed_at: finding.created,
    synced_at: syncedAt,
  };
}
