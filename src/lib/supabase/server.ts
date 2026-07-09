import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

/**
 * Creates a Supabase client for use in Server Components, Server Actions,
 * and Route Handlers.
 *
 * Uses the anon key — queries go through RLS scoped to the current user.
 * Must be called inside a request context (cookies() requires it).
 */
export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.",
    );
  }

  // Bypass cookies for cron/background jobs (they fail in Lambda if cookies() is called)
  const isCron = process.env.NEXT_PHASE === 'action' || process.env.IS_CRON === 'true';
  
  if (isCron) {
    return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return []; },
        setAll() {},
      },
    });
  }

  const cookieStore = await cookies();

  const client = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll is called from Server Components where cookies cannot be set.
          // This is expected when the middleware refreshes the session.
          // The middleware will handle setting the cookies on the response.
        }
      },
    },
  });

  const mockUserCookie = (process.env.PLAYWRIGHT_TEST === "true" || process.env.NODE_ENV !== "production") ? cookieStore.get("sb-mock-user") : null;
  if (mockUserCookie?.value) {
    try {
      const mockUser = JSON.parse(mockUserCookie.value);
      client.auth.getUser = async () => {
        return { data: { user: mockUser }, error: null } as any;
      };

      // Mock database queries on the server side for E2E tests
      client.from = (table: string) => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          single: () => chain,
          maybeSingle: () => chain,
          then: (resolve: any) => {
            let result: any = { data: null, error: null, count: null };
            if (table === "compliance_assessments") {
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
            } else if (table === "profiles") {
              result.data = { id: mockUser.id, onboarding_completed: true };
            }
            return Promise.resolve(resolve(result));
          },
        };
        return chain as any;
      };
    } catch (e) {
      console.error("Failed to parse sb-mock-user cookie in server client:", e);
    }
  }

  return client;
}
