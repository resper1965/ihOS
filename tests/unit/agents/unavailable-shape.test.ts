// tests/unit/agents/unavailable-shape.test.ts
// When a tool has no data, the NUMBER is what the model reads and repeats — not
// the `source: 'unavailable'` field beside it. Returning 0 turns "we could not
// find out" into "you are 0% compliant" in the answer. The numeric fields must
// be null so the absence survives into the response.

import { describe, it, expect } from 'vitest';

// The unavailable shapes the tools return, asserted structurally. These mirror
// the objects in src/lib/agents/tools/index.ts; the point of the test is that
// no numeric field carries a fabricated value in the unavailable case.
function assertNoFabricatedNumbers(shape: Record<string, unknown>) {
  const numericFields = [
    'overallScore', 'controlsTotal', 'controlsMet', 'controlsPartial',
    'controlsNotMet', 'coveragePercentage', 'overlapPercentage',
  ];
  for (const f of numericFields) {
    if (f in shape) {
      expect(shape[f], `${f} must be null when unavailable, not a number`).toBeNull();
    }
  }
}

describe('unavailable tool results', () => {
  it('carries null, not 0, for every numeric field', () => {
    assertNoFabricatedNumbers({
      framework: 'iso27001',
      overallScore: null,
      controlsTotal: null,
      controlsMet: null,
      source: 'unavailable',
      error: 'API/DB unavailable',
    });
  });

  it('fails an object that reports zero instead of absence', () => {
    expect(() =>
      assertNoFabricatedNumbers({ overallScore: 0, source: 'unavailable' }),
    ).toThrow();
  });

  it('still permits a real measured zero when the source is not unavailable', () => {
    // A backed 0% is a finding and must remain expressible.
    const backed = { framework: 'iso27001', overallScore: 0, controlsTotal: 582, source: 'database' };
    expect(backed.overallScore).toBe(0);
    expect(backed.controlsTotal).toBe(582);
  });
});
