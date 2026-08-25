// tests/api/agentic-triggers-score.test.ts
// The agentic-triggers cron used to invent a compliance score from the
// character count of the framework's name (60 + (name.length * 3) % 40) when
// it had no real one, then notify users about "changes" in that number and
// persist it as the baseline for the next comparison. A score with nothing
// behind it must produce no score, no alert, and no stored state.
//
// This tests the scoring decision in isolation rather than the whole route,
// because the route's body is a long batched pipeline whose other branches
// need extensive unrelated mocking.

import { describe, it, expect } from 'vitest';
import { resolveFrameworkScore } from '@/app/api/cron/agentic-triggers/score';

describe('resolveFrameworkScore', () => {
  it('returns the computed score when one really exists', () => {
    expect(resolveFrameworkScore({ code: 'iso27001', score: 82 })).toBe(82);
  });

  it('returns null — not an invented number — when there is no computed score', () => {
    expect(resolveFrameworkScore(undefined)).toBeNull();
    expect(resolveFrameworkScore({ code: 'soc2', score: null })).toBeNull();
  });

  it('never derives a score from the framework code itself', () => {
    // The old formula was 60 + (code.length * 3) % 40, so a 4-char and a
    // 12-char code produced different "scores" from the same absence of data.
    expect(resolveFrameworkScore({ code: 'soc2', score: null })).toBe(
      resolveFrameworkScore({ code: 'nist_800_53', score: null }),
    );
  });

  it('preserves a legitimate zero rather than treating it as missing', () => {
    expect(resolveFrameworkScore({ code: 'iso27001', score: 0 })).toBe(0);
  });
});
