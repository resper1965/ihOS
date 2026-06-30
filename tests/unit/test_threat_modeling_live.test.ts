// tests/unit/test_threat_modeling_live.test.ts
import { describe, it, expect, vi } from "vitest";
import { POST } from "@/app/api/threat-modeling/route";

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

describe("Live Threat Modeling Route Handler", () => {
  it("should call the real engine and report the actual status/response", async () => {
    const req = new MockRequest({
      product_version: "v2.2.x",
      target_frameworks: ["ISO 27001", "LGPD"],
    }) as any;

    console.log("Triggering live POST /api/threat-modeling...");
    const res = await POST(req);
    const data = await res.json();
    console.log("Response status code:", res.status);
    console.log("Response body:", JSON.stringify(data, null, 2));
  }, 30000);
});
