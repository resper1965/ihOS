// tests/unit/assessment/framework-registry.test.ts
// T018: Unit tests for the framework registry (src/lib/assessment/framework-registry.ts)
//
// On 2026-08-25, soc2/nist_800_53/HI-2013/EU-GDPR/BR-LGPD were found to be
// prefix-renamed clones of iso27001/iso27701 — offering them meant answering
// questions about standards with zero real mapping data. They were
// quarantined out of FRAMEWORK_REGISTRY/DEFAULT_FRAMEWORKS into a
// name-only QUARANTINED_FRAMEWORKS list (see
// docs/superpowers/plans/2026-08-25-epistemic-integrity.md). The tests below
// were updated in place where the quarantine legitimately changed an
// expected value; everything else is unchanged from before the quarantine.

import { describe, it, expect } from 'vitest';
import {
  FRAMEWORK_REGISTRY,
  QUARANTINED_FRAMEWORKS,
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
  // Changed 2026-08-25: shrunk from 6 to 2 when soc2/nist_800_53/BR-LGPD/
  // EU-GDPR were quarantined (see framework registry — no framework without
  // a real crosswalk, below). Only iso27001/iso27701 have real mappings.
  it('has exactly 2 entries', () => {
    expect(DEFAULT_FRAMEWORKS).toHaveLength(2);
  });

  it('contains all expected framework IDs', () => {
    // Post-quarantine default set: only the two frameworks with real
    // mappings (iso27001, iso27701). soc2/nist_800_53/BR-LGPD/EU-GDPR were
    // pulled from the default selection on 2026-08-25.
    const ids = DEFAULT_FRAMEWORKS.map((f) => f.id);
    expect(ids).toContain('iso27001');
    expect(ids).toContain('iso27701');
  });

  it('each entry has an id and a name', () => {
    for (const fw of DEFAULT_FRAMEWORKS) {
      expect(fw.id).toBeTruthy();
      expect(fw.name).toBeTruthy();
    }
  });
});

describe('FRAMEWORK_REGISTRY', () => {
  // Changed 2026-08-25: "at least 9 entries" was a brittle stand-in for "the
  // registry offers things." The real intent — never offer a framework
  // without a real crosswalk — is what actually needs guarding.
  it('is non-empty and offers only frameworks backed by a real crosswalk', () => {
    expect(FRAMEWORK_REGISTRY.length).toBeGreaterThan(0);
    const fabricated = new Set(['soc2', 'nist_800_53', 'HI-2013', 'EU-GDPR', 'BR-LGPD']);
    for (const fw of FRAMEWORK_REGISTRY) {
      expect(fabricated.has(fw.id)).toBe(false);
    }
  });

  it('every entry has required fields (id, name, icon)', () => {
    for (const fw of FRAMEWORK_REGISTRY) {
      expect(fw.id).toBeTruthy();
      expect(fw.name).toBeTruthy();
      expect(fw.icon).toBeTruthy();
    }
  });

  // Strengthened 2026-08-25: aliases now come from two lists
  // (FRAMEWORK_REGISTRY + QUARANTINED_FRAMEWORKS) that both feed the same
  // shared lookup maps built in framework-registry.ts. A collision between
  // them would silently misresolve a name/icon — and Task 5's
  // alias-to-canonical normalization depends on this holding.
  it('aliases are unique and do not collide with canonical IDs, across offered and quarantined frameworks', () => {
    const allIds = new Set<string>();
    for (const fw of [...FRAMEWORK_REGISTRY, ...QUARANTINED_FRAMEWORKS]) {
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

// ---------------------------------------------------------------------------
// Quarantine guard (added 2026-08-25)
// A framework must not be offerable until a real crosswalk backs it. On
// 2026-08-25, soc2/nist_800_53/HI-2013/EU-GDPR/BR-LGPD were found to be
// prefix-renamed clones of iso27001/iso27701 — offering them meant answering
// questions about standards with zero real mapping data. This is the guard
// against silently re-adding one.
// ---------------------------------------------------------------------------

const FABRICATED = ['soc2', 'nist_800_53', 'HI-2013', 'EU-GDPR', 'BR-LGPD'];

describe('framework registry — no framework without a real crosswalk', () => {
  it('does not offer any of the frameworks whose mappings were fabricated', () => {
    const offered = FRAMEWORK_REGISTRY.map((f) => f.id);
    for (const code of FABRICATED) {
      expect(offered).not.toContain(code);
    }
  });

  it('does not default-select any fabricated framework in the assessment modal', () => {
    const defaults = DEFAULT_FRAMEWORKS.map((f) => f.id);
    for (const code of FABRICATED) {
      expect(defaults).not.toContain(code);
    }
  });

  it('still offers the two frameworks with real mappings', () => {
    const offered = FRAMEWORK_REGISTRY.map((f) => f.id);
    expect(offered).toContain('iso27001');
    expect(offered).toContain('iso27701');
  });

  it('still resolves display names for quarantined codes so historical records render', () => {
    // Existing assessments/snapshots reference these codes; they must not
    // render as a raw slug just because the framework is no longer offered.
    expect(resolveFrameworkName('soc2')).toBe('SOC 2 Type II');
    expect(resolveFrameworkName('BR-LGPD')).toBe('LGPD');
  });
});
