// tests/unit/test_threat_modeling_post.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/threat-modeling/route";
import { ihosEngine } from "@/lib/ihos-engine";

// Mock Supabase server client (auth/session)
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
  })),
}));

// Admin client mock modeling the specific calls the route makes:
//  - product_versions .select().eq().maybeSingle()  → no match (null)
//  - threat_models    .select().eq().order()        → no existing cache ([])
//  - threat_models    .insert().select().single()   → inserted row
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => {
      const builder: any = {
        _inserted: null as any,
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        insert: (row: any) => {
          builder._inserted = Array.isArray(row) ? row[0] : row;
          return builder;
        },
        // Terminal for the cache-lookup chain (.select().eq().order().limit()).
        limit: () => Promise.resolve({ data: [], error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        // Echo the inserted row back (as real Supabase .insert().select().single() does).
        single: () => Promise.resolve({ data: builder._inserted ?? { id: "tm-generated-1", model_data: {} }, error: null }),
      };
      return builder;
    },
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

const validEngineResult = {
  metadata: { product_version: "v2.2.x", target_frameworks: ["ISO 27001"], generated_at: "now", llm_model: "gpt" },
  rag_context: {},
  threat_model: { threats: [], fmea_correlations: [] },
  gaps: [],
  recommendations: [],
  limitations: [],
};

describe("POST /api/threat-modeling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return 400 if product_version is missing", async () => {
    const req = new MockRequest({ target_frameworks: ["ISO 27001"] }) as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("should return 400 if target_frameworks is missing/empty", async () => {
    const req = new MockRequest({ product_version: "v2.2.x", target_frameworks: [] }) as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("should run engine generate and persist when parameters are valid", async () => {
    const spy = vi.spyOn(ihosEngine, "generateThreatModel").mockResolvedValue(validEngineResult as any);

    const req = new MockRequest({ product_version: "v2.2.x", target_frameworks: ["ISO 27001"] }) as any;
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalled();
    expect(data.success).toBe(true);
    expect(data.cached).toBe(false);
  });

  it("warns about the traceability gap when no product-version deltas exist, instead of guessing", async () => {
    vi.spyOn(ihosEngine, "generateThreatModel").mockResolvedValue(validEngineResult as any);

    const req = new MockRequest({ product_version: "v2.2.x", target_frameworks: ["ISO 27001"] }) as any;
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.limitations.join(" ")).toMatch(/no product-version deltas/i);
  });

  it("does NOT fabricate a threat model when the GRC engine is unavailable", async () => {
    vi.spyOn(ihosEngine, "generateThreatModel").mockRejectedValue(new Error("upstream 500"));

    const req = new MockRequest({ product_version: "v2.2.x", target_frameworks: ["ISO 27001"] }) as any;
    const res = await POST(req);
    const data = await res.json();

    // Must surface a coverage-gap error, never a fabricated 200 with invented threats.
    expect(res.status).toBe(502);
    expect(data.success).toBe(false);
    expect(data.error).toBe("GRC_ENGINE_UNAVAILABLE");
    expect(JSON.stringify(data)).not.toMatch(/mock-engine-fallback/);
    expect(JSON.stringify(data)).not.toMatch(/T-001/);
  });
});
