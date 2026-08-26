// tests/unit/standard-api/fallback-constants.test.ts
// Two invented numbers survived the 2026-08-25 sweep. A prioritisation score
// derived from a list index carries no information about the control, and
// `|| 1` reports one affected control where the data says zero — contradicting
// the `|| 0` in the summary string built from the same array.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'src/lib/standard-api/client.ts'), 'utf-8');

describe('standard-api local fallbacks carry no invented constants', () => {
  it('does not derive an ROI score from a list index', () => {
    expect(src).not.toMatch(/roi_score:\s*95\s*-\s*idx/);
  });

  it('does not invent one affected control out of zero', () => {
    expect(src).not.toMatch(/total_affected_controls:\s*mappings\?\.length\s*\|\|\s*1/);
  });

  it('still contains the grounded computations it should keep', () => {
    // Guard against the fix being a deletion of the whole fallback.
    expect(src).toContain('localRoiPath');
    expect(src).toContain('localBlastRadius');
  });
});
