// tests/unit/standard-api/fallback.test.ts
// Verifies the fail-closed default of the Standard GRC Engine local fallback:
// estimation is OPT-IN. By default (and under the legacy kill switch) the
// client must NOT substitute an estimated result — it lets the error surface
// so the caller reports a gap instead of fabricating an evaluation.
//
// NOTE: the global test setup (tests/setup.ts) mocks the whole standard-api
// client module, so we pull the REAL implementation via importActual to test
// the actual gating logic. Full end-to-end fallback behavior is covered by the
// validation runbook (needs a live GRC API).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

async function realIsLocalFallbackEnabled() {
  const actual = await vi.importActual<typeof import("@/lib/standard-api/client")>(
    "@/lib/standard-api/client",
  );
  return actual.isLocalFallbackEnabled;
}

describe("isLocalFallbackEnabled — fail-closed default", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.GRC_FALLBACK_DISABLED;
    delete process.env.GRC_LOCAL_FALLBACK_ENABLED;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is DISABLED by default (neither flag set) — never estimate silently", async () => {
    const isEnabled = await realIsLocalFallbackEnabled();
    expect(isEnabled()).toBe(false);
  });

  it("is ENABLED only when GRC_LOCAL_FALLBACK_ENABLED=true (explicit opt-in)", async () => {
    process.env.GRC_LOCAL_FALLBACK_ENABLED = "true";
    const isEnabled = await realIsLocalFallbackEnabled();
    expect(isEnabled()).toBe(true);
  });

  it("legacy GRC_FALLBACK_DISABLED=true forces OFF even if opt-in is set", async () => {
    process.env.GRC_LOCAL_FALLBACK_ENABLED = "true";
    process.env.GRC_FALLBACK_DISABLED = "true";
    const isEnabled = await realIsLocalFallbackEnabled();
    expect(isEnabled()).toBe(false);
  });
});
