// tests/unit/test_threat_modeling_post.test.ts
import { describe, it, expect, vi } from "vitest";
import { POST } from "@/app/api/threat-modeling/route";
import { ihosEngine } from "@/lib/ihos-engine";

// Mock Supabase server client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: { id: "test-user-id", email: "test@example.com" },
            access_token: "test-token",
          },
        },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

// Mock the NextRequest
class MockRequest {
  private bodyData: any;
  public headers: Headers;

  constructor(body: any) {
    this.bodyData = body;
    this.headers = new Headers({ "Content-Type": "application/json" });
  }

  async json() {
    if (!this.bodyData) {
      throw new Error("No body");
    }
    return this.bodyData;
  }
}

describe("POST /api/threat-modeling", () => {
  it("should return 400 if product_version is missing", async () => {
    const req = new MockRequest({
      target_frameworks: ["ISO 27001"],
    }) as any;

    const res = await POST(req);
    const data = await res.json();
    console.log("Response for missing product_version:", res.status, data);
    expect(res.status).toBe(400);
  });

  it("should return 400 if target_frameworks is missing/empty", async () => {
    const req = new MockRequest({
      product_version: "v2.2.x",
      target_frameworks: [],
    }) as any;

    const res = await POST(req);
    const data = await res.json();
    console.log("Response for empty target_frameworks:", res.status, data);
    expect(res.status).toBe(400);
  });

  it("should run engine generate when parameters are valid", async () => {
    // Spy on ihosEngine.generateThreatModel
    const spy = vi.spyOn(ihosEngine, "generateThreatModel").mockResolvedValue({
      metadata: { product_version: "v2.2.x", target_frameworks: ["ISO 27001"], generated_at: "now", llm_model: "gpt" },
      rag_context: {},
      threat_model: { threats: [], fmea_correlations: [] },
      gaps: [],
      recommendations: [],
      limitations: [],
    });

    const req = new MockRequest({
      product_version: "v2.2.x",
      target_frameworks: ["ISO 27001"],
    }) as any;

    const res = await POST(req);
    const data = await res.json();
    console.log("Response for valid input:", res.status, data);
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalled();
  });

  it("warns about the traceability gap when no product-version deltas exist, instead of guessing", async () => {
    vi.spyOn(ihosEngine, "generateThreatModel").mockResolvedValue({
      metadata: { product_version: "v2.2.x", target_frameworks: ["ISO 27001"], generated_at: "now", llm_model: "gpt" },
      rag_context: {},
      threat_model: { threats: [], fmea_correlations: [] },
      gaps: [],
      recommendations: [],
      limitations: [],
    });

    const req = new MockRequest({
      product_version: "v2.2.x",
      target_frameworks: ["ISO 27001"],
    }) as any;

    const res = await POST(req);
    const data = await res.json();
    if (res.status === 200) {
      expect(data.data.limitations.join(" ")).toMatch(/no product-version deltas/i);
    }
  });

  it("does NOT fabricate a threat model when the GRC engine is unavailable", async () => {
    vi.spyOn(ihosEngine, "generateThreatModel").mockRejectedValue(new Error("upstream 500"));

    const req = new MockRequest({
      product_version: "v2.2.x",
      target_frameworks: ["ISO 27001"],
    }) as any;

    const res = await POST(req);
    const data = await res.json();
    console.log("Response for engine failure:", res.status, data);

    // Must surface a coverage-gap error, never a fabricated 200 with invented threats.
    expect(res.status).toBe(502);
    expect(data.success).toBe(false);
    expect(data.error).toBe("GRC_ENGINE_UNAVAILABLE");
    expect(JSON.stringify(data)).not.toMatch(/mock-engine-fallback/);
    expect(JSON.stringify(data)).not.toMatch(/T-001/);
  });
});
