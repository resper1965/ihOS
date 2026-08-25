// tests/unit/standard-api/cross-coverage-fallback.test.ts
// localCrossCoverage must never invent an overlap number. When the mapping
// query fails there is no grounded answer, so it must throw and let the
// caller report a gap (Constitution Principle VIII).
//
// tests/setup.ts mocks the whole standard-api client module, so the real
// implementation is pulled via importActual — same pattern as fallback.test.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      // Throwing here (rather than only on a chained .in()) fails every
      // caller's query the same way, regardless of how many methods it
      // chains after .select() — covers both localCrossCoverage's
      // .select().in() and localComplianceScore's bare .select().
      select: () => {
        throw new Error("relation \"scf_framework_mappings\" does not exist");
      },
    }),
  })),
}));

async function realCrossCoverage() {
  const actual = await vi.importActual<typeof import("@/lib/standard-api/client")>(
    "@/lib/standard-api/client",
  );
  return actual.crossCoverage;
}

async function realComplianceScore() {
  const actual = await vi.importActual<typeof import("@/lib/standard-api/client")>(
    "@/lib/standard-api/client",
  );
  return actual.complianceScore;
}

describe("localCrossCoverage — never fabricates an overlap", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.GRC_LOCAL_FALLBACK_ENABLED = "true";
    delete process.env.GRC_FALLBACK_DISABLED;
    // Stub fetch to reject so the fallback is triggered deterministically,
    // not via DNS resolution which is environment-dependent
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    );
  });

  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  it("throws instead of returning a made-up 50% when the mapping query fails", async () => {
    const crossCoverage = await realCrossCoverage();
    await expect(
      crossCoverage({ source_framework: "iso27001", target_framework: "soc2" }),
    ).rejects.toThrow();
  });

  it("never resolves to a 50/50 coverage shape", async () => {
    const crossCoverage = await realCrossCoverage();
    const result = await crossCoverage({
      source_framework: "iso27001",
      target_framework: "soc2",
    }).catch(() => null);
    expect(result).toBeNull();
  });
});

describe("localComplianceScore — never fabricates a compliance score", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.GRC_LOCAL_FALLBACK_ENABLED = "true";
    delete process.env.GRC_FALLBACK_DISABLED;
    // Stub fetch to reject so the fallback is triggered deterministically,
    // not via DNS resolution which is environment-dependent
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    );
  });

  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  it("throws instead of returning a made-up score: 75 when the evidence/mapping query fails", async () => {
    const complianceScore = await realComplianceScore();
    await expect(
      complianceScore({ framework_code: "iso27001" }),
    ).rejects.toThrow();
  });

  it("never resolves to the hardcoded 75/75 fallback shape", async () => {
    const complianceScore = await realComplianceScore();
    const result = await complianceScore({ framework_code: "iso27001" }).catch(() => null);
    expect(result).toBeNull();
  });
});
