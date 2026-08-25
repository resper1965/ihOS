// src/app/api/cron/agentic-triggers/score.ts
// Extracted from route.ts so the scoring decision is testable without mocking
// the cron's whole batched pipeline. Next's route type-checker rejects exports
// outside the HTTP-method allowlist in a route.ts, so this cannot live there.

export interface ComputedScore {
  code: string;
  score: number | null;
}

/**
 * The score for a framework, or null when there genuinely isn't one.
 *
 * This used to fall back to `60 + (framework.length * 3) % 40` — a number
 * derived from the framework code's character count — and before that to a
 * flat 73.5. Both fed user-facing "your compliance score changed" alerts and
 * were persisted as the baseline for the next run's comparison, so a framework
 * with no data produced a plausible-looking score and a stream of alerts about
 * its movement. Absence of a score is now reported as absence (Constitution
 * Principle VIII).
 */
export function resolveFrameworkScore(computed: ComputedScore | undefined): number | null {
  if (!computed || computed.score === null || computed.score === undefined) {
    return null;
  }
  return computed.score;
}
