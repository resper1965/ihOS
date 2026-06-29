// tests/unit/assessment/framework-registry.test.ts
// T018: Unit tests for the framework registry (src/lib/assessment/framework-registry.ts)

import { describe, it, expect } from 'vitest';
import {
  FRAMEWORK_REGISTRY,
  DEFAULT_FRAMEWORKS,
  resolveFrameworkName,
  resolveFrameworkIcon,
} from '@/lib/assessment/framework-registry';

// ---------------------------------------------------------------------------
// resolveFrameworkName
// ---------------------------------------------------------------------------

describe('resolveFrameworkName', () => {
  it('resolves canonical IDs to their display names', () => {
    expect(resolveFrameworkName('iso27001')).toBe('ISO/IEC 27001:2022');
    expect(resolveFrameworkName('iso27701')).toBe('ISO/IEC 27701:2019');
    expect(resolveFrameworkName('soc2')).toBe('SOC 2 Type II');
    expect(resolveFrameworkName('fedramp')).toBe('FedRAMP');
    expect(resolveFrameworkName('nist_800_53')).toBe('NIST SP 800-53');
  });

  it('resolves alias IDs to the same display name as their canonical ID', () => {
    expect(resolveFrameworkName('hipaa')).toBe('HIPAA');
    expect(resolveFrameworkName('HI-2013')).toBe('HIPAA');

    expect(resolveFrameworkName('soc-2')).toBe('SOC 2 Type II');

    expect(resolveFrameworkName('lgpd')).toBe('LGPD');
    expect(resolveFrameworkName('BR-LGPD')).toBe('LGPD');

    expect(resolveFrameworkName('gdpr')).toBe('EU GDPR');
    expect(resolveFrameworkName('EU-GDPR')).toBe('EU GDPR');

    expect(resolveFrameworkName('txramp')).toBe('TX-RAMP Level 2');
    expect(resolveFrameworkName('TX-LEVEL-2')).toBe('TX-RAMP Level 2');

    expect(resolveFrameworkName('NIST-800-53')).toBe('NIST SP 800-53');
  });

  it('returns the raw ID when the framework is not in the registry', () => {
    expect(resolveFrameworkName('unknown-framework')).toBe('unknown-framework');
    expect(resolveFrameworkName('')).toBe('');
    expect(resolveFrameworkName('pci-dss')).toBe('pci-dss');
  });
});

// ---------------------------------------------------------------------------
// resolveFrameworkIcon
// ---------------------------------------------------------------------------

describe('resolveFrameworkIcon', () => {
  it('returns the correct icon for known canonical IDs', () => {
    expect(resolveFrameworkIcon('iso27001')).toBe('🔒');
    expect(resolveFrameworkIcon('soc2')).toBe('📋');
    expect(resolveFrameworkIcon('fedramp')).toBe('🇺🇸');
    expect(resolveFrameworkIcon('HI-2013')).toBe('🏥');
  });

  it('returns the correct icon for alias IDs', () => {
    expect(resolveFrameworkIcon('hipaa')).toBe('🏥');
    expect(resolveFrameworkIcon('gdpr')).toBe('🇪🇺');
    expect(resolveFrameworkIcon('txramp')).toBe('⭐');
  });

  it('returns the default fallback icon "📋" for unknown IDs', () => {
    expect(resolveFrameworkIcon('unknown-framework')).toBe('📋');
    expect(resolveFrameworkIcon('')).toBe('📋');
  });
});

// ---------------------------------------------------------------------------
// Data constants
// ---------------------------------------------------------------------------

describe('DEFAULT_FRAMEWORKS', () => {
  it('has exactly 6 entries', () => {
    expect(DEFAULT_FRAMEWORKS).toHaveLength(6);
  });

  it('contains all expected framework IDs', () => {
    const ids = DEFAULT_FRAMEWORKS.map((f) => f.id);
    expect(ids).toContain('iso27001');
    expect(ids).toContain('soc2');
    expect(ids).toContain('HI-2013');
    expect(ids).toContain('nist_800_53');
    expect(ids).toContain('iso27701');
    expect(ids).toContain('fedramp');
  });

  it('each entry has an id and a name', () => {
    for (const fw of DEFAULT_FRAMEWORKS) {
      expect(fw.id).toBeTruthy();
      expect(fw.name).toBeTruthy();
    }
  });
});

describe('FRAMEWORK_REGISTRY', () => {
  it('has at least 9 entries', () => {
    expect(FRAMEWORK_REGISTRY.length).toBeGreaterThanOrEqual(9);
  });

  it('every entry has required fields (id, name, icon)', () => {
    for (const fw of FRAMEWORK_REGISTRY) {
      expect(fw.id).toBeTruthy();
      expect(fw.name).toBeTruthy();
      expect(fw.icon).toBeTruthy();
    }
  });

  it('aliases are unique and do not collide with canonical IDs', () => {
    const allIds = new Set<string>();
    for (const fw of FRAMEWORK_REGISTRY) {
      expect(allIds.has(fw.id)).toBe(false);
      allIds.add(fw.id);
      if (fw.aliases) {
        for (const alias of fw.aliases) {
          expect(allIds.has(alias)).toBe(false);
          allIds.add(alias);
        }
      }
    }
  });
});
