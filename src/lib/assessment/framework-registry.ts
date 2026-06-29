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

export const FRAMEWORK_REGISTRY: FrameworkInfo[] = [
  { id: 'iso27001', name: 'ISO/IEC 27001:2022', icon: '🔒' },
  { id: 'iso27701', name: 'ISO/IEC 27701:2019', icon: '🛡️' },
  { id: 'BR-LGPD', name: 'LGPD', icon: '🇧🇷', aliases: ['lgpd'] },
  { id: 'HI-2013', name: 'HIPAA', icon: '🏥', aliases: ['hipaa'] },
  { id: 'EU-GDPR', name: 'EU GDPR', icon: '🇪🇺', aliases: ['gdpr'] },
  { id: 'soc2', name: 'SOC 2 Type II', icon: '📋', aliases: ['soc-2'] },
  { id: 'nist_800_53', name: 'NIST SP 800-53', icon: '🏛️', aliases: ['NIST-800-53'] },
  { id: 'fedramp', name: 'FedRAMP', icon: '🇺🇸' },
  { id: 'IEC-62304', name: 'IEC 62304', icon: '⚕️' },
  { id: 'TX-LEVEL-2', name: 'TX-RAMP Level 2', icon: '⭐', aliases: ['txramp'] },
];

// Build lookup maps for O(1) resolution
const _nameMap = new Map<string, string>();
const _iconMap = new Map<string, string>();

for (const fw of FRAMEWORK_REGISTRY) {
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

/** The 6 default frameworks shown in the Run Assessment modal */
export const DEFAULT_FRAMEWORKS = [
  { id: 'iso27001', name: 'ISO/IEC 27001:2022' },
  { id: 'soc2', name: 'SOC 2 Type II' },
  { id: 'HI-2013', name: 'HIPAA' },
  { id: 'nist_800_53', name: 'NIST SP 800-53' },
  { id: 'iso27701', name: 'ISO/IEC 27701:2019' },
  { id: 'fedramp', name: 'FedRAMP' },
];
