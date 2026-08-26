// tests/unit/assessment/scorecard-backing.test.ts
// A score with nothing behind it must not be written. On 2026-08-26 an
// assessment that evaluated zero controls (finding A9) caused syncScorecard to
// delete the existing rows and write 0.0 for two frameworks, so the dashboard
// showed 0% for frameworks it had never measured. 0% is a real finding —
// "evaluated, nothing compliant" — and must stay distinguishable from
// "not evaluated".

import { describe, it, expect } from 'vitest';
import { isScoreBacked } from '@/lib/assessment/assessment-to-scorecard';

describe('isScoreBacked', () => {
  it('accepts a framework where controls were actually required and evaluated', () => {
    expect(isScoreBacked({ totalRequired: 582, implementedCount: 341 })).toBe(true);
  });

  it('accepts a genuine zero — required controls, none implemented', () => {
    // This is a measurement, not an absence. It must still be written.
    expect(isScoreBacked({ totalRequired: 582, implementedCount: 0 })).toBe(true);
  });

  it('rejects a framework where nothing was required, so nothing was measured', () => {
    expect(isScoreBacked({ totalRequired: 0, implementedCount: 0 })).toBe(false);
  });

  it('rejects the incoherent case rather than guessing which field to trust', () => {
    // totalRequired 0 with a positive implementedCount cannot both be true;
    // refusing is safer than picking one.
    expect(isScoreBacked({ totalRequired: 0, implementedCount: 5 })).toBe(false);
  });
});
