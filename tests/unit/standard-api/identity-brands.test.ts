// tests/unit/standard-api/identity-brands.test.ts
// The A9 defect was comparing a UUID against a set of human codes. Both are
// `string`, so neither hand-written types nor spec-generated types caught it —
// three nightly assessment runs evaluated zero controls. Branding the two
// identities makes that comparison a compile error.
//
// The compile-time behaviour is the actual assertion here; the runtime
// expectations below exist so the file executes and its type errors surface in
// the suite rather than only in a separate tsc run.

import { describe, it, expect } from 'vitest';
import { asControlCode, controlCodeOf, type ControlCode } from '@/lib/standard-api/identity';

describe('control identity brands', () => {
  it('brands a code without changing its runtime value', () => {
    const code = asControlCode('AST-22');
    expect(code).toBe('AST-22');
    expect(typeof code).toBe('string');
  });

  it('extracts the code from an API control object', () => {
    const control = {
      control_id: '653a70ef-16fd-4d53-a637-ff61cd998729',
      control_code: 'AAT-01',
    };
    expect(controlCodeOf(control)).toBe('AAT-01');
  });

  it('keeps a Set of codes usable with branded members', () => {
    const mapped = new Set<ControlCode>([asControlCode('AST-22'), asControlCode('AAT-01')]);
    expect(mapped.has(asControlCode('AST-22'))).toBe(true);
    expect(mapped.has(asControlCode('ZZZ-99'))).toBe(false);
  });

  it('documents the compile error the brands exist to produce', () => {
    // The following must NOT compile, which is the whole point:
    //
    //   const mapped = new Set<ControlCode>([asControlCode('AST-22')]);
    //   mapped.has(control.control_id);
    //   //         ~~~~~~~~~~~~~~~~~~
    //   // Argument of type 'string' is not assignable to parameter of type
    //   // 'ControlCode'.
    //
    // A @ts-expect-error assertion below fails the build if that line ever
    // becomes legal — i.e. if someone widens ControlCode back to string.
    const mapped = new Set<ControlCode>([asControlCode('AST-22')]);
    const rawUuid: string = '653a70ef-16fd-4d53-a637-ff61cd998729';
    // @ts-expect-error a bare string must not satisfy ControlCode
    expect(mapped.has(rawUuid)).toBe(false);
  });
});
