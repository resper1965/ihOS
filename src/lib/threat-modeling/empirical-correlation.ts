// src/lib/threat-modeling/empirical-correlation.ts
// The GRC engine returns a loosely-typed threat-model JSON payload; this module
// annotates that dynamic shape, so `any` is intentional here (same rationale
// as lineage.ts).
/* eslint-disable @typescript-eslint/no-explicit-any */
// Empirical (analytical-axis) correlation for threat modeling.
//
// The documental STRIDE model says what COULD happen based on architecture
// docs; DefectDojo findings say what is OBSERVABLY exploitable right now.
// This module cross-references the two POST-HOC: each generated threat is
// annotated with the active findings whose CWE class lands on the same
// STRIDE category, marking the threat as empirically observed.
//
// IMPORTANT (honest limitation): the external GRC engine does NOT consume
// runtime findings during generation, and the correlation is CATEGORY-level
// (CWE class → STRIDE category), not component-verified. Annotations say so
// via `correlation_level: 'stride-category'` — reviewers must confirm the
// affected component before treating a threat as exploit-confirmed.

import { logger } from '@/lib/logger';
import type { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

export type StrideCategory =
  | 'spoofing'
  | 'tampering'
  | 'repudiation'
  | 'information_disclosure'
  | 'denial_of_service'
  | 'elevation_of_privilege';

/**
 * CWE class → STRIDE categories, for the same top-20 CWEs the DefectDojo
 * mapper resolves (see integrations/defectdojo/mapper.ts). Findings without
 * a CWE (or outside this set) are simply not correlated — never guessed.
 */
export const STRIDE_BY_CWE: Record<number, StrideCategory[]> = {
  89:  ['tampering', 'information_disclosure'],            // SQL Injection
  79:  ['tampering', 'information_disclosure'],            // XSS
  287: ['spoofing', 'elevation_of_privilege'],             // Improper Authentication
  798: ['spoofing', 'information_disclosure'],             // Hard-coded Credentials
  200: ['information_disclosure'],                         // Sensitive Info Exposure
  22:  ['information_disclosure', 'tampering'],            // Path Traversal
  352: ['spoofing', 'tampering'],                          // CSRF
  918: ['information_disclosure', 'elevation_of_privilege'], // SSRF
  502: ['tampering', 'elevation_of_privilege'],            // Unsafe Deserialization
  78:  ['tampering', 'elevation_of_privilege'],            // OS Command Injection
  434: ['tampering', 'elevation_of_privilege'],            // Unrestricted File Upload
  611: ['information_disclosure', 'denial_of_service'],    // XXE
  306: ['spoofing', 'elevation_of_privilege'],             // Missing Authentication
  862: ['elevation_of_privilege', 'information_disclosure'], // Missing Authorization
  276: ['elevation_of_privilege'],                         // Incorrect Default Permissions
  327: ['information_disclosure', 'tampering'],            // Broken Crypto
  319: ['information_disclosure'],                         // Cleartext Transmission
  532: ['information_disclosure', 'repudiation'],          // Sensitive Info in Logs
  601: ['spoofing'],                                       // Open Redirect
  94:  ['tampering', 'elevation_of_privilege'],            // Code Injection
};

export interface EmpiricalFinding {
  dd_finding_id: number;
  title: string;
  severity: string;
  cwe: number | null;
  mapped_scf_controls?: string[];
}

/** Reference embedded on each correlated threat (kept small on purpose). */
export interface EmpiricalFindingRef {
  dd_finding_id: number;
  title: string;
  severity: string;
  cwe: number | null;
}

const MAX_REFS_PER_THREAT = 5;

/**
 * Load the live findings relevant to a product version: active, unmitigated,
 * not risk-accepted, restricted to the version (org-wide NULL rows included).
 * Findings without a usable CWE are excluded — they cannot be correlated.
 */
export async function loadActiveFindingsForVersion(
  admin: AdminClient,
  productVersionId: string | null,
): Promise<EmpiricalFinding[]> {
  // Any failure here (table absent, client unavailable) degrades to "no
  // empirical annotations" — a coverage note, never a generation failure.
  try {
    let query = (admin as any)
      .from('defectdojo_findings')
      .select('dd_finding_id, title, severity, cwe, mapped_scf_controls, product_version_id')
      .eq('active', true)
      .eq('is_mitigated', false)
      .eq('risk_accepted', false)
      .not('cwe', 'is', null);

    if (productVersionId) {
      query = query.or(`product_version_id.eq.${productVersionId},product_version_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      logger.warn('Could not load DefectDojo findings for empirical correlation', {
        context: 'threat-modeling/empirical-correlation',
        meta: { error: error.message },
      });
      return [];
    }

    return (data ?? []) as EmpiricalFinding[];
  } catch (err) {
    logger.warn('Empirical correlation skipped — findings query unavailable', {
      context: 'threat-modeling/empirical-correlation',
      meta: { error: err instanceof Error ? err.message : 'unknown' },
    });
    return [];
  }
}

/**
 * Post-hoc annotation: mark each threat whose STRIDE category is hit by at
 * least one live finding's CWE class. Returns a shallow-updated copy plus
 * counters; stamps summary metadata on the model.
 */
export function annotateEmpiricalConfirmation(
  generatedData: Record<string, any>,
  findings: EmpiricalFinding[],
): {
  data: Record<string, any>;
  observedThreatCount: number;
  correlatedFindingCount: number;
} {
  const threats: Record<string, any>[] = generatedData?.threat_model?.threats ?? [];

  // Index findings by the STRIDE categories their CWE maps to.
  const findingsByCategory = new Map<StrideCategory, EmpiricalFindingRef[]>();
  const correlatedFindingIds = new Set<number>();
  for (const f of findings) {
    const categories = f.cwe !== null ? STRIDE_BY_CWE[f.cwe] ?? [] : [];
    for (const category of categories) {
      const list = findingsByCategory.get(category) ?? [];
      list.push({ dd_finding_id: f.dd_finding_id, title: f.title, severity: f.severity, cwe: f.cwe });
      findingsByCategory.set(category, list);
    }
  }

  const severityRank: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };

  let observedThreatCount = 0;
  const annotated = threats.map((t) => {
    const category = String(t.stride_category ?? '').toLowerCase() as StrideCategory;
    const matches = findingsByCategory.get(category) ?? [];

    if (matches.length === 0) {
      // Clear stale annotations from a previous correlation pass so a fixed
      // finding doesn't keep a threat marked observed forever.
      const { empirical_findings, empirically_observed, ...rest } = t;
      void empirical_findings; void empirically_observed;
      return { ...rest, empirically_observed: false };
    }

    observedThreatCount++;
    for (const m of matches) correlatedFindingIds.add(m.dd_finding_id);

    const refs = [...matches]
      .sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9))
      .slice(0, MAX_REFS_PER_THREAT);

    return { ...t, empirically_observed: true, empirical_findings: refs };
  });

  const data = {
    ...generatedData,
    threat_model: { ...generatedData.threat_model, threats: annotated },
    metadata: {
      ...generatedData.metadata,
      empirical_correlation: {
        correlated_finding_count: correlatedFindingIds.size,
        observed_threat_count: observedThreatCount,
        total_active_findings: findings.length,
        correlation_level: 'stride-category',
        correlated_at: new Date().toISOString(),
      },
    },
  };

  return { data, observedThreatCount, correlatedFindingCount: correlatedFindingIds.size };
}
