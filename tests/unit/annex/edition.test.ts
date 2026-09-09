import { describe, it, expect } from 'vitest';
import { editionOf } from '@/lib/annex/edition';

describe('an Annex A id says which edition it belongs to', () => {
  it('reads two-segment ids as ISO 27001:2022 Annex A', () => {
    for (const code of ['A.5.1', 'A.5.37', 'A.6.8', 'A.7.14', 'A.8.34', 'A.8.24']) {
      expect(editionOf(code), code).toBe('iso27001:2022');
    }
  });

  it('reads A.7.x.y as ISO 27701:2019, not as a 27001 control', () => {
    // This is the distinction the whole classifier exists for. A.7.5 is an ISO
    // 27001:2022 physical control; A.7.5.3 is an ISO 27701 PII control. They
    // differ only by a segment.
    for (const code of ['A.7.2.1', 'A.7.3.10', 'A.7.4.9', 'A.7.5.4']) {
      expect(editionOf(code), code).toBe('iso27701:2019');
    }
    expect(editionOf('A.7.5')).toBe('iso27001:2022');
  });

  it('returns null for the 2013-edition leftover rather than guessing', () => {
    // A.12.4.1 is the only id in the legacy data belonging to neither edition:
    // ISO 27001:2022 Annex A stops at A.8, and ISO 27701's annex is A.7.x.y
    // only. Defaulting it to either edition would file a 2013 control as a
    // current one.
    expect(editionOf('A.12.4.1')).toBeNull();
  });

  it('returns null for three-segment ids outside A.7', () => {
    expect(editionOf('A.9.2.1')).toBeNull();
    expect(editionOf('A.18.1.3')).toBeNull();
  });

  it('returns null for anything that is not an Annex A id at all', () => {
    for (const code of ['5.1', '6.1.2(d)(3)', 'SI-10', '', 'A.', 'A.x.y']) {
      expect(editionOf(code), code).toBeNull();
    }
  });

  it('does not accept a four-segment A.7 id', () => {
    // The 27701 annex is exactly three segments deep. A fourth means something
    // this classifier has never seen, and inventing a home for it is the
    // failure mode this function exists to prevent.
    expect(editionOf('A.7.2.1.1')).toBeNull();
  });
});
