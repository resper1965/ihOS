// tests/unit/standard-api/normalize-controls.test.ts
// Regression for the getScfControls double-unwrap bug: after get() unwraps the
// { data, trace_id } envelope, the controls list can arrive in several shapes.
// normalizeControlsResponse must always return { data: array }.

import { describe, it, expect, vi } from "vitest";

async function fn() {
  const actual = await vi.importActual<typeof import("@/lib/standard-api/client")>(
    "@/lib/standard-api/client",
  );
  return actual.normalizeControlsResponse;
}

describe("normalizeControlsResponse", () => {
  it("handles a bare array (envelope already unwrapped by get())", async () => {
    const n = await fn();
    const out = n([{ control_id: "A.5.1" }, { control_id: "A.5.2" }]);
    expect(out.data).toHaveLength(2);
    expect(out.total).toBe(2);
  });

  it("handles { data: [...], total }", async () => {
    const n = await fn();
    const out = n({ data: [{ control_id: "A.5.1" }], total: 1468 });
    expect(out.data).toHaveLength(1);
    expect(out.total).toBe(1468);
  });

  it("handles { items: [...], pagination: { total } }", async () => {
    const n = await fn();
    const out = n({ items: [{ control_id: "X" }], pagination: { total: 42 } });
    expect(out.data).toHaveLength(1);
    expect(out.total).toBe(42);
  });

  it("handles { controls: [...] }", async () => {
    const n = await fn();
    expect(n({ controls: [{ control_id: "X" }] }).data).toHaveLength(1);
  });

  it("never throws / returns [] on unexpected shapes", async () => {
    const n = await fn();
    expect(n(null).data).toEqual([]);
    expect(n({}).data).toEqual([]);
    expect(n({ data: "oops" }).data).toEqual([]);
  });
});
