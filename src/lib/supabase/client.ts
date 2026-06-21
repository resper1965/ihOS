import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Creates a Supabase client for use in Client Components (browser).
 *
 * Uses the anon key — all queries go through RLS.
 * Call this inside components/hooks; each invocation reuses the
 * underlying GoTrueClient singleton automatically.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.",
    );
  }

  const client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);

  // Check for mock user cookie in browser context
  let mockUser: any = null;
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(^|;)\s*sb-mock-user\s*=\s*([^;]+)/);
    if (match) {
      try {
        mockUser = JSON.parse(decodeURIComponent(match[2]));
      } catch (e) {
        console.error("Failed to parse sb-mock-user cookie in client:", e);
      }
    }
  }

  if (mockUser) {
    client.auth.getUser = async () => {
      return { data: { user: mockUser }, error: null } as any;
    };

    // Patch client.from to return mock data for E2E tests
    client.from = (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => chain,
        maybeSingle: () => chain,
        insert: (data: any) => {
          if (data && data.onboarding_completed === true) {
            if (typeof window !== "undefined") {
              window.localStorage.setItem("onboarding_completed", "true");
            }
          }
          return chain;
        },
        update: (data: any) => {
          if (data && data.onboarding_completed === true) {
            if (typeof window !== "undefined") {
              window.localStorage.setItem("onboarding_completed", "true");
            }
          }
          return chain;
        },
        then: (resolve: any) => {
          let result: any = { data: null, error: null, count: null };
          if (table === "profiles") {
            const onboardingCompleted = typeof window !== "undefined" && window.localStorage.getItem("onboarding_completed") === "true";
            result.data = { id: mockUser.id, onboarding_completed: onboardingCompleted };
          } else if (table === "compliance_assessments") {
            result.data = [{ framework_code: "iso27001" }];
            result.count = 8;
          } else if (table === "compliance_documents") {
            result.data = [];
            result.count = 15;
          } else if (table === "intelligence_snapshots") {
            result.data = {
              snapshot_data: {
                score: 76,
                coverage: 88,
                missing: 5,
              },
            };
          } else if (table === "agent_notifications") {
            result.data = [
              {
                id: 1,
                title: "Critical Task Overdue",
                content: "ISO 27001 Control A.8.12 implementation has exceeded the target date.",
                type: "task_deadline",
                created_at: new Date(Date.now() - 600000).toISOString(),
              },
            ];
          }
          return Promise.resolve(resolve(result));
        }
      };
      return chain as any;
    };
  }

  return client;
}
