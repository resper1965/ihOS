// tests/unit/assessment/persist-deltas.test.ts
// Regression tests for the graceful degradation added after inspecting the
// live schema: persistDeltas must still record deltas on databases where the
// extraction_confidence/needs_review/source_document_id columns don't exist.

import { describe, it, expect, vi } from "vitest";
import { persistDeltas } from "@/lib/assessment/delta-extractor";

const deltas = [
  { feature_slug: "oauth2", description: "d", affected_components: ["system"] as any, risk_level: "medium" as const, confidence: 0.9 },
  { feature_slug: "webrtc", description: "d", affected_components: ["network"] as any, risk_level: "high" as const, confidence: 0.4 },
];

describe("persistDeltas", () => {
  it("no-ops on empty input", async () => {
    const admin = { from: vi.fn() };
    const res = await persistDeltas(admin, "pv-1", []);
    expect(res).toEqual({ error: null, degraded: false });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("writes the rich columns when the schema supports them", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const admin = { from: () => ({ upsert }) };
    const res = await persistDeltas(admin, "pv-1", deltas as any, 42);

    expect(res).toEqual({ error: null, degraded: false });
    expect(upsert).toHaveBeenCalledTimes(1);
    const rows = upsert.mock.calls[0][0];
    expect(rows[0]).toMatchObject({ feature_slug: "oauth2", extraction_confidence: 0.9, needs_review: false, source_document_id: 42 });
    // low-confidence delta flagged for review
    expect(rows[1]).toMatchObject({ feature_slug: "webrtc", needs_review: true });
  });

  it("falls back to base columns when the rich upsert fails (migration not applied)", async () => {
    const upsert = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: "column extraction_confidence does not exist" } })
      .mockResolvedValueOnce({ error: null });
    const admin = { from: () => ({ upsert }) };

    const res = await persistDeltas(admin, "pv-1", deltas as any, 42);

    expect(res).toEqual({ error: null, degraded: true });
    expect(upsert).toHaveBeenCalledTimes(2);
    // second (fallback) call must NOT include the newer columns
    const baseRows = upsert.mock.calls[1][0];
    expect(baseRows[0]).not.toHaveProperty("extraction_confidence");
    expect(baseRows[0]).not.toHaveProperty("needs_review");
    expect(baseRows[0]).not.toHaveProperty("source_document_id");
    expect(baseRows[0]).toMatchObject({ feature_slug: "oauth2", risk_level: "medium" });
  });

  it("surfaces the error when even the base upsert fails", async () => {
    const upsert = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: "no confidence col" } })
      .mockResolvedValueOnce({ error: { message: "rls denied" } });
    const admin = { from: () => ({ upsert }) };

    const res = await persistDeltas(admin, "pv-1", deltas as any);
    expect(res.degraded).toBe(true);
    expect(res.error).toBe("rls denied");
  });
});
