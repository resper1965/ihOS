// src/lib/standard-api/identity.ts
// Nominal types for the two SCF control identities, which are both plain
// `string` in the API and in the generated spec types — and were therefore
// interchangeable to the compiler.
//
// That interchangeability was finding A9: the assessment engine compared
// `control_id` (a UUID) against sets built from `scf_control_code` (codes like
// AST-22), the predicate was never true, and three consecutive nightly runs
// evaluated zero controls while reporting a score. The vendor's spec marks
// control_id as `format: uuid` and control_code as a plain string, so the
// distinction is documented — it just could not be enforced.
//
// Branding costs nothing at runtime: these are compile-time-only intersections,
// and the values remain ordinary strings.

/** The API's `control_id` — a UUID. NOT what our tables join on. */
export type ControlUuid = string & { readonly __brand: 'ControlUuid' };

/**
 * The API's `control_code` (e.g. `AST-22`) — the identity every ihOS table
 * joins on: scf_framework_mappings.scf_control_code,
 * control_evaluation_cache.control_code, evidence_evaluations.control_code.
 */
export type ControlCode = string & { readonly __brand: 'ControlCode' };

/**
 * Assert that a string is a control code.
 *
 * Use this at the boundary where a code enters from an untyped source (a
 * database row, a request body, a CSV). Do NOT use it to silence a type error
 * on a value that is actually a UUID — that is the bug this file exists to
 * prevent, and the cast will hide it again.
 */
export function asControlCode(s: string): ControlCode {
  return s as ControlCode;
}

/** Assert that a string is a control UUID. Same caution as asControlCode. */
export function asControlUuid(s: string): ControlUuid {
  return s as ControlUuid;
}

/**
 * The code of an API control object, branded. Prefer this over reaching for
 * `.control_code` directly, so the brand travels with the value.
 */
export function controlCodeOf(c: { control_code: string }): ControlCode {
  return c.control_code as ControlCode;
}
