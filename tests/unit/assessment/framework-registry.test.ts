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
  //
  // Changed 2026-08-28: the blocklist named five slugs because, on 2026-08-25,
  // their only mappings were clones. That is a statement about the data, and
  // the data changed — the vendor crosswalk was walked on 2026-08-27 and four
  // of the five were given curated identities on 2026-08-28. A hardcoded list
  // of ids cannot notice that, so it would have failed for a reason that had
  // stopped being true.
  //
  // What is permanent is the rule underneath: our slug is only meaningful once
  // a person has recorded which vendor framework it names. CURATED_IDENTITIES
  // mirrors the local_code column of framework_identity_curation. It is a
  // deliberate duplicate of database state, and it exists so that adding a row
  // to FRAMEWORK_REGISTRY without also curating an identity fails here rather
  // than shipping a framework that silently scores nothing.
  const CURATED_IDENTITIES = new Set([
    'iso27001',    // 2026-08-27, docs/sql/2026-08-28_control_spine_apply.sql
    'BR-LGPD',     // 2026-08-28, docs/sql/2026-08-28d_APPLY_ME_framework_identities.sql
    'EU-GDPR',     //     "
    'EU-DORA',     //     "
    'soc2',        //     "
    'nist_800_53', //     "
    'iso27701',    // 2026-08-28, docs/sql/2026-08-28e_APPLY_ME_iso27701_identity.sql
                   // confidence 'probable', not 'exact' — the only candidate is the
                   // 2025 edition and our slug means 2019. Q14(b) settles it.
  ]);

  // Offered, but with no curation row yet. They project no score until one
  // exists — the honest outcome, not a defect. Listed explicitly so the
  // exemption is visible rather than implied by a passing test, and so this
  // set shrinking is a deliberate act.
  //
  // It shrank on 2026-08-28: iso27701 moved out when it was curated as
  // 'probable'. It was the entry that mattered, because it is in
  // DEFAULT_FRAMEWORKS and so was pre-selected while scoring nothing.
  //
  // The three that remain are blocked on the vendor, not on a decision anyone
  // here is avoiding.
  const OFFERED_WITHOUT_IDENTITY = new Set([
    'fedramp',    // Q14(c) — four baselines, our slug names none
    'IEC-62304',  // Q14(a) — no candidate among the vendor's 272
    'TX-LEVEL-2', // unambiguous candidate exists; row simply not written yet
  ]);

  it('offers only frameworks whose identity a person has curated', () => {
    expect(FRAMEWORK_REGISTRY.length).toBeGreaterThan(0);
    for (const fw of FRAMEWORK_REGISTRY) {
      if (OFFERED_WITHOUT_IDENTITY.has(fw.id)) continue;
      expect(CURATED_IDENTITIES.has(fw.id)).toBe(true);
    }
  });

  it('never offers a framework that is also quarantined', () => {
    const quarantined = new Set(QUARANTINED_FRAMEWORKS.map((f) => f.id));
    for (const fw of FRAMEWORK_REGISTRY) {
      expect(quarantined.has(fw.id)).toBe(false);
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
// Quarantine guard (added 2026-08-25, narrowed 2026-08-28)
//
// A framework must not be offerable until a real crosswalk backs it. On
// 2026-08-25, soc2/nist_800_53/HI-2013/EU-GDPR/BR-LGPD were found to be
// prefix-renamed clones of iso27001/iso27701 — offering them meant answering
// questions about standards with zero real mapping data.
//
// Four of those five stopped being fabricated on 2026-08-27, when the vendor
// crosswalk was walked into scf_control_mappings, and were given curated
// identities on 2026-08-28. The clone rows they were quarantined for still sit
// in scf_framework_mappings_quarantine and are still not read by anything.
//
// HI-2013 remains. Not because its mappings are fabricated — the vendor has
// three HIPAA frameworks and 1,028 mappings across them — but because nobody
// has decided WHICH of the three our slug means, and a framework with no
// curated identity must not be offered.
// ---------------------------------------------------------------------------

const UNCURATED = ['HI-2013'];

describe('framework registry — no framework without a curated identity', () => {
  it('does not offer a framework whose identity nobody has decided', () => {
    const offered = FRAMEWORK_REGISTRY.map((f) => f.id);
    for (const code of UNCURATED) {
      expect(offered).not.toContain(code);
    }
  });

  it('does not default-select a framework whose identity nobody has decided', () => {
    const defaults = DEFAULT_FRAMEWORKS.map((f) => f.id);
    for (const code of UNCURATED) {
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
