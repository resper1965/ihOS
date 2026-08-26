// tests/unit/standard-api/typed-boundary.test.ts
// The boundary is typed from the spec, so the mismatch that caused A9 is now a
// compile-time error rather than a silent zero-control assessment.

import { describe, it, expect } from 'vitest';
import type { ScfControl } from '@/lib/standard-api/client';

describe('typed SCF control boundary', () => {
  it('accepts the real API shape', () => {
    const c: Pick<ScfControl, 'control_id' | 'control_code'> = {
      control_id: '653a70ef-16fd-4d53-a637-ff61cd998729',
      control_code: 'AAT-01',
    };
    expect(c.control_code).toBe('AAT-01');
  });

  it('exposes control_code, which is what our tables join on', () => {
    // scf_framework_mappings.scf_control_code, control_evaluation_cache.control_code
    // and evidence_evaluations.control_code all key on this field, not on the UUID.
    const codes: Array<ScfControl['control_code']> = ['AST-22', 'AAT-01'];
    expect(codes).toHaveLength(2);
  });
});
