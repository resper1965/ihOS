// tests/unit/standard-api/cross-coverage-fallback.test.ts
// localCrossCoverage must never invent an overlap number. When the mapping
// query fails there is no grounded answer, so it must throw and let the
// caller report a gap (Constitution Principle VIII).
//
// tests/setup.ts mocks the whole standard-api client module, so the real
// implementation is pulled via importActual — same pattern as fallback.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        in: async () => {
          throw new Error("relation \"scf_framework_mappings\" does not exist");
        },
      }),
    }),
  })),
}));

async function realCrossCoverage() {
  const actual = await vi.importActual<typeof import("@/lib/standard-api/client")>(
    "@/lib/standard-api/client",
  );
  return actual.crossCoverage;
}

describe("localCrossCoverage — never fabricates an overlap", () => {
  beforeEach(() => {
    process.env.GRC_LOCAL_FALLBACK_ENABLED = "true";
    delete process.env.GRC_FALLBACK_DISABLED;
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
