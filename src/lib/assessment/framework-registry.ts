// src/lib/assessment/framework-registry.ts
// Single source of truth for framework identifiers, display names, and icons.
// Eliminates 4x duplication across: frameworks.ts, assessment-to-scorecard.ts,
// assessments/page.tsx, assessments/[id]/page.tsx

export interface FrameworkInfo {
  id: string;
  name: string;
  icon: string;
  aliases?: string[];  // Alternative IDs that map to this framework
}

// Frameworks the product offers. A framework belongs here ONLY when a real
// crosswalk backs it AND a person has recorded which vendor framework our slug
// means, in framework_identity_curation. Both halves are load-bearing: the
// crosswalk supplies the rows, the curation row supplies the join, and without
// the join a projection has no denominator and returns no score at all.
//
// On 2026-08-25 an audit found soc2/nist_800_53/HI-2013/EU-GDPR/BR-LGPD were
// prefix-renamed clones of the two ISO mappings (see
// docs/superpowers/plans/2026-08-25-epistemic-integrity.md) and quarantined them.
// On 2026-08-27 the real vendor crosswalk was walked into scf_control_mappings
// — 79,133 mappings over all 1,473 controls — and on 2026-08-28 four of the five
// were given curated identities in docs/sql/2026-08-28d_APPLY_ME_framework_identities.sql.
// The condition that quarantined them no longer holds, so they are offered again.
//
// HI-2013 stays quarantined: "HIPAA" matches three distinct vendor frameworks
// (Administrative Simplification 2013, the Security Rule / NIST SP 800-66 R2,
// and 45 CFR 155.260) and no one has decided which one our slug means.
export const FRAMEWORK_REGISTRY: FrameworkInfo[] = [
  { id: 'iso27001', name: 'ISO/IEC 27001:2022', icon: '🔒' },
  { id: 'iso27701', name: 'ISO/IEC 27701:2019', icon: '🛡️' },
  { id: 'fedramp', name: 'FedRAMP', icon: '🇺🇸' },
  { id: 'IEC-62304', name: 'IEC 62304', icon: '⚕️' },
  { id: 'TX-LEVEL-2', name: 'TX-RAMP Level 2', icon: '⭐', aliases: ['txramp'] },
  // Identities curated 2026-08-28; each names exactly one vendor framework.
  { id: 'BR-LGPD', name: 'LGPD', icon: '🇧🇷', aliases: ['lgpd'] },
  { id: 'EU-GDPR', name: 'EU GDPR', icon: '🇪🇺', aliases: ['gdpr'] },
  { id: 'EU-DORA', name: 'EU DORA', icon: '🇪🇺', aliases: ['dora'] },
  { id: 'soc2', name: 'SOC 2 Type II', icon: '📋', aliases: ['soc-2'] },
  { id: 'nist_800_53', name: 'NIST SP 800-53', icon: '🏛️', aliases: ['NIST-800-53'] },
];

// Quarantined: NOT offered, but their display names must still resolve so
// existing assessments, scorecards and reports that reference these codes
// render a real name instead of a raw slug.
export const QUARANTINED_FRAMEWORKS: FrameworkInfo[] = [
  { id: 'HI-2013', name: 'HIPAA', icon: '🏥', aliases: ['hipaa'] },
];

// Build lookup maps for O(1) resolution
const _nameMap = new Map<string, string>();
const _iconMap = new Map<string, string>();

for (const fw of [...FRAMEWORK_REGISTRY, ...QUARANTINED_FRAMEWORKS]) {
  _nameMap.set(fw.id, fw.name);
  _iconMap.set(fw.id, fw.icon);
  if (fw.aliases) {
    for (const alias of fw.aliases) {
      _nameMap.set(alias, fw.name);
      _iconMap.set(alias, fw.icon);
    }
  }
}

export function resolveFrameworkName(id: string): string {
  return _nameMap.get(id) ?? id;
}

export function resolveFrameworkIcon(id: string): string {
  return _iconMap.get(id) ?? '📋';
}

/** Frameworks pre-selected in the Run Assessment modal — offered ones only. */
export const DEFAULT_FRAMEWORKS = [
  { id: 'iso27001', name: 'ISO/IEC 27001:2022' },
  { id: 'iso27701', name: 'ISO/IEC 27701:2019' },
];

// Canonical-code lookup, built from every id and alias the registry knows
// (offered and quarantined alike), keyed case-insensitively.
const _canonicalMap = new Map<string, string>();
for (const fw of [...FRAMEWORK_REGISTRY, ...QUARANTINED_FRAMEWORKS]) {
  _canonicalMap.set(fw.id.toLowerCase(), fw.id);
  if (fw.aliases) {
    for (const alias of fw.aliases) _canonicalMap.set(alias.toLowerCase(), fw.id);
  }
}

/**
 * Canonicalizes a framework code from external input (CSV upload, API body)
 * onto the exact code the registry uses.
 *
 * The upload route previously did `.toUpperCase()`, which would have written
 * "ISO27001" beside the real "iso27001" and split one framework's mappings
 * across two codes with nothing flagging it. Unknown codes are passed through
 * with whitespace collapsed rather than case-mangled, so a genuinely new
 * framework keeps whatever casing the crosswalk uses.
 */
export function normalizeFrameworkCode(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, '-');
  return _canonicalMap.get(trimmed.toLowerCase()) ?? trimmed;
}
