// tests/unit/threat-modeling/lineage.test.ts
import { describe, it, expect } from "vitest";
import { annotateInheritance, resolveVersionContext, findBaselineModel } from "@/lib/threat-modeling/lineage";

// Minimal chainable builder whose maybeSingle() resolves to a preset result.
function versionQuery(result: { data: unknown; error: unknown }) {
  const q: any = {
    select: () => q,
    eq: () => q,
    maybeSingle: () => Promise.resolve(result),
  };
  return q;
}

describe("resolveVersionContext", () => {
  it("reads previous_version_id when the column exists", async () => {
    const admin: any = {
      from: () => versionQuery({ data: { id: "v3", previous_version_id: "v2" }, error: null }),
    };
    const ctx = await resolveVersionContext(admin, "v2.3.x");
    expect(ctx).toEqual({ productVersionId: "v3", previousVersionId: "v2" });
  });

  it("degrades to id-only when previous_version_id column is missing (migration not applied)", async () => {
    let call = 0;
    const admin: any = {
      from: () => {
        call++;
        // First (rich) select errors; second (base 'id') select succeeds.
        return call === 1
          ? versionQuery({ data: null, error: { message: "column previous_version_id does not exist" } })
          : versionQuery({ data: { id: "v3" }, error: null });
      },
    };
    const ctx = await resolveVersionContext(admin, "v2.3.x");
    expect(ctx).toEqual({ productVersionId: "v3", previousVersionId: null });
  });
});

describe("annotateInheritance", () => {
  const generated = {
    metadata: {},
    threat_model: {
      threats: [
        { id: "T1", stride_category: "spoofing", affected_component: "API Gateway" },
        { id: "T2", stride_category: "tampering", affected_component: "WebRTC" }, // new
      ],
    },
    limitations: [],
  };

  it("labels every threat as new when there is no baseline", () => {
    const { data, inheritedCount, newCount, baselineModelId } = annotateInheritance(generated, null);
    expect(baselineModelId).toBeNull();
    expect(inheritedCount).toBe(0);
    expect(newCount).toBe(2);
    // No baseline → data returned unchanged (no is_new annotation forced)
    expect(data).toBe(generated);
  });

  it("marks threats present in the baseline as inherited, others as new", () => {
    const baseline = {
      id: "tm-prev",
      model_data: {
        threat_model: {
          threats: [{ id: "X", stride_category: "spoofing", affected_component: "API Gateway" }],
        },
      },
    };

    const { data, inheritedCount, newCount, baselineModelId } = annotateInheritance(generated, baseline);
    expect(baselineModelId).toBe("tm-prev");
    expect(inheritedCount).toBe(1);
    expect(newCount).toBe(1);

    const threats = (data.threat_model as any).threats;
    const spoof = threats.find((t: any) => t.id === "T1");
    const tamper = threats.find((t: any) => t.id === "T2");
    expect(spoof.is_new).toBe(false);
    expect(spoof.inherited_from_version).toBe("tm-prev");
    expect(tamper.is_new).toBe(true);
    expect(tamper.inherited_from_version).toBeNull();

    expect((data.metadata as any).inherited_threat_count).toBe(1);
    expect((data.metadata as any).new_threat_count).toBe(1);
    expect((data.metadata as any).baseline_model_id).toBe("tm-prev");
  });

  it("matches inherited threats case-insensitively by stride + component", () => {
    const baseline = {
      id: "tm-prev",
      model_data: {
        threat_model: {
          threats: [{ stride_category: "SPOOFING", affected_component: "api gateway" }],
        },
      },
    };
    const { inheritedCount } = annotateInheritance(generated, baseline);
    expect(inheritedCount).toBe(1);
  });

  it("never matches threats that lack both stride and component (no false inheritance)", () => {
    const gen = {
      metadata: {},
      threat_model: { threats: [{ id: "E1" }, { id: "E2", stride_category: "", affected_component: "" }] },
    };
    const baseline = {
      id: "tm-prev",
      model_data: { threat_model: { threats: [{ id: "B", stride_category: "", affected_component: "" }] } },
    };
    const { inheritedCount, newCount, data } = annotateInheritance(gen, baseline);
    expect(inheritedCount).toBe(0); // empty-keyed threats must NOT collide
    expect(newCount).toBe(2);
    expect((data.threat_model as any).threats.every((t: any) => t.is_new === true)).toBe(true);
  });
});

describe("findBaselineModel", () => {
  // Routes .from() by table: product_versions → version_code; threat_models → rows.
  function makeAdmin(prevCode: string | null, threatRows: any[]) {
    return {
      from: (table: string) => {
        const q: any = {
          select: () => q,
          eq: () => q,
          order: () => Promise.resolve({ data: threatRows, error: null }),
          maybeSingle: () => Promise.resolve({ data: prevCode ? { version_code: prevCode } : null, error: null }),
        };
        return q;
      },
    } as any;
  }

  it("returns null when there is no previous version", async () => {
    expect(await findBaselineModel(makeAdmin("v2.2.x", []), null)).toBeNull();
  });

  it("prefers approved > reviewed > most recent", async () => {
    const admin = makeAdmin("v2.2.x", [
      { id: "draft-1", status: "draft", model_data: {}, target_frameworks: ["iso27001"] },
      { id: "approved-1", status: "approved", model_data: {}, target_frameworks: ["iso27001"] },
    ]);
    const res = await findBaselineModel(admin, "prev-id", ["iso27001"]);
    expect(res?.id).toBe("approved-1");
  });

  it("returns null when no baseline shares the requested frameworks", async () => {
    const admin = makeAdmin("v2.2.x", [
      { id: "iso-model", status: "approved", model_data: {}, target_frameworks: ["iso27001"] },
    ]);
    // Requesting SOC 2 — the ISO baseline is not framework-compatible.
    const res = await findBaselineModel(admin, "prev-id", ["soc2"]);
    expect(res).toBeNull();
  });

  // Channel isolation (NPR v3 Moment 1): baselines only serve their own channel.
  it("never inherits across sales channels", async () => {
    const admin = makeAdmin("v2.2.x", [
      { id: "gehc-model", status: "approved", model_data: {}, target_frameworks: ["iso27001"], sales_channel: "B2B_GEHC" },
    ]);
    // A Direct request must not inherit from a GEHC baseline.
    expect(await findBaselineModel(admin, "prev-id", ["iso27001"], "B2B_DIRECT")).toBeNull();
    // The same channel matches.
    const same = await findBaselineModel(admin, "prev-id", ["iso27001"], "B2B_GEHC");
    expect(same?.id).toBe("gehc-model");
  });

  it("serves channel-less legacy baselines only to channel-less requests", async () => {
    const admin = makeAdmin("v2.2.x", [
      { id: "legacy-model", status: "approved", model_data: {}, target_frameworks: ["iso27001"] },
    ]);
    expect(await findBaselineModel(admin, "prev-id", ["iso27001"], "B2B_GEHC")).toBeNull();
    const channelless = await findBaselineModel(admin, "prev-id", ["iso27001"], null);
    expect(channelless?.id).toBe("legacy-model");
  });
});
