// src/lib/integrations/defectdojo/scf-resolver.ts
// Resolves a finding's ISO 27001 / NIST 800-53 control mappings to SCF codes
// via the scf_framework_mappings table (synced from the Standard GRC API).
//
// Fail-closed (Constitution Principle VIII): if no mapping rows exist for a
// control, the finding stays UNMAPPED and is reported as a coverage gap —
// ihOS never invents SCF codes locally.

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

/** framework_code values as stored in scf_framework_mappings. */
const ISO_FRAMEWORK_CODE = 'iso27001';
const NIST_FRAMEWORK_CODE = 'nist_800_53';

export interface ScfResolutionResult {
  /** target framework control (e.g. "A.8.26" or "SI-10") → SCF codes */
  byTargetControl: Map<string, string[]>;
  /** framework controls that had no SCF mapping rows */
  unmappedControls: string[];
}

/**
 * Batch-resolve ISO and NIST control ids to SCF control codes.
 * One query per framework, regardless of how many findings are being synced.
 */
export async function resolveScfMappings(
  admin: SupabaseClient,
  isoControls: string[],
  nistControls: string[],
): Promise<ScfResolutionResult> {
  const byTargetControl = new Map<string, string[]>();
  const wanted: Array<{ framework: string; controls: string[] }> = [
    { framework: ISO_FRAMEWORK_CODE, controls: [...new Set(isoControls)] },
    { framework: NIST_FRAMEWORK_CODE, controls: [...new Set(nistControls)] },
  ];

  for (const { framework, controls } of wanted) {
    if (controls.length === 0) continue;

    const { data, error } = await admin
      .from('scf_framework_mappings')
      .select('target_control_id, scf_control_code')
      .eq('framework_code', framework)
      .in('target_control_id', controls);

    if (error) {
      logger.warn('SCF mapping lookup failed', {
        context: 'defectdojo/scf-resolver',
        meta: { framework, error: error.message },
      });
      continue;
    }

    for (const row of (data ?? []) as Array<{ target_control_id: string; scf_control_code: string | null }>) {
      if (!row.scf_control_code) continue;
      const existing = byTargetControl.get(row.target_control_id) ?? [];
      if (!existing.includes(row.scf_control_code)) existing.push(row.scf_control_code);
      byTargetControl.set(row.target_control_id, existing);
    }
  }

  const allWanted = [...new Set([...isoControls, ...nistControls])];
  const unmappedControls = allWanted.filter((c) => !byTargetControl.has(c));

  return { byTargetControl, unmappedControls };
}

/**
 * Given one finding's framework controls and a pre-resolved mapping table,
 * return the deduplicated SCF codes the finding lands on.
 */
export function scfControlsForFinding(
  resolution: ScfResolutionResult,
  isoControls: string[],
  nistControls: string[],
): string[] {
  const codes = new Set<string>();
  for (const target of [...isoControls, ...nistControls]) {
    for (const scf of resolution.byTargetControl.get(target) ?? []) {
      codes.add(scf);
    }
  }
  return [...codes].sort();
}
