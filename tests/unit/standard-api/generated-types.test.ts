// tests/unit/standard-api/generated-types.test.ts
// Type-level assertions against the generated spec types. These compile-time
// checks are the point of the whole exercise: finding A9 was our code keying on
// control_id (a UUID) while every table we join on keys on control_code, and it
// cost three nightly assessment runs that evaluated zero controls. The vendor's
// spec always said control_id was `format: uuid`; nothing made us read it.

import { describe, it, expect } from 'vitest';
import type { paths } from '@/lib/standard-api/generated/schema';

// A compile-time equality assertion. If the generated shape drifts from what
// the code below claims, `tsc` fails — which is the actual test.
type Expect<T extends true> = T;
type IsString<T> = [T] extends [string] ? true : false;

type ControlsResponse =
  paths['/api/v1/scf/versions/{scfVersionId}/controls']['get']['responses']['200']['content']['application/json'];

type ControlItem = NonNullable<ControlsResponse['data']>[number];

// Both identity fields exist and are strings — the spec marks control_id as
// `format: uuid`, which openapi-typescript renders as `string`. The distinction
// the code must respect is semantic, not structural, which is exactly why A9
// was invisible: both are strings, but only one matches our join keys.
type _codeIsString = Expect<IsString<ControlItem['control_code']>>;
type _idIsString = Expect<IsString<ControlItem['control_id']>>;

describe('generated API types', () => {
  it('exposes the controls endpoint under the camelCase path parameter', () => {
    // Documents a real trap: the path parameter is {scfVersionId}, not
    // {scf_version_id}. A survey script guessed snake_case and reported the
    // endpoint as missing from the spec when it was present all along.
    const key: keyof paths = '/api/v1/scf/versions/{scfVersionId}/controls';
    expect(key).toBe('/api/v1/scf/versions/{scfVersionId}/controls');
  });

  it('declares both control identity fields on the controls response', () => {
    // Runtime assertion is trivial; the value is the type resolution above
    // compiling at all. This test exists so the file is executed and its
    // type errors surface in the suite, not only in a separate tsc run.
    const sample: Pick<ControlItem, 'control_id' | 'control_code'> = {
      control_id: '653a70ef-16fd-4d53-a637-ff61cd998729',
      control_code: 'AAT-01',
    };
    expect(sample.control_code).toBe('AAT-01');
    expect(sample.control_id).not.toBe(sample.control_code);
  });

  it('declares a pagination envelope, so termination need not be inferred', () => {
    // Our client terminates paging on "page shorter than per_page" (audit B1).
    // The spec describes a pagination object; this pins that it exists so a
    // follow-up can use it instead of inferring.
    type Paginated = ControlsResponse extends { pagination?: unknown } ? true : false;
    const hasPagination: Paginated = true;
    expect(hasPagination).toBe(true);
  });
});
