import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Next.js middleware — runs on every matched request.
 *
 * Responsibilities:
 *  1. Refresh the Supabase auth session (keeps cookies alive)
 *  2. Protect dashboard routes (redirect to /login when unauthenticated)
 *  3. Rate limit API routes (in-memory, Vercel Edge compatible)
 *  4. Allow public routes (/login, /signup, /callback) through
 *
 * IMPORTANT: The (dashboard) route group does NOT add a URL prefix.
 * Routes like /, /compliance, /chat are all dashboard routes and must
 * be protected. We use a PUBLIC_PATHS allowlist approach instead.
 */

// ── Public paths that do NOT require authentication ─────────────────────────
const PUBLIC_PATHS = ["/login", "/signup", "/callback"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/i.test(pathname)
  );
}

// ── Rate Limiting (Upstash Redis, Vercel Edge compatible) ──────────────────

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || "";
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

const RATE_LIMITS = [
  // Strictest first — order matters (first match wins)
  { pattern: "/api/chat/generate-answers", limiter: redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "60 s"), prefix: "ihos:rl" }) : null },
  { pattern: "/api/chat/promote-qa", limiter: redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "60 s"), prefix: "ihos:rl" }) : null },
  { pattern: "/api/chat/", limiter: redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "60 s"), prefix: "ihos:rl" }) : null },
  { pattern: "/api/documents/upload", limiter: redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "60 s"), prefix: "ihos:rl" }) : null },
  { pattern: "/login", limiter: redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "15 m"), prefix: "ihos:rl" }) : null },
  { pattern: "/signup", limiter: redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "15 m"), prefix: "ihos:rl" }) : null },
  { pattern: "/api/", limiter: redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, "60 s"), prefix: "ihos:rl" }) : null },
];

async function checkRateLimit(
  ip: string,
  pathname: string
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  for (const { pattern, limiter } of RATE_LIMITS) {
    if (pathname.startsWith(pattern)) {
      if (!limiter) return { allowed: true }; // Allow all if redis is missing

      const key = `${ip}:${pattern}`;
      try {
        const { success, reset } = await limiter.limit(key);
        if (!success) {
          return { allowed: false, retryAfterMs: Math.max(0, reset - Date.now()) };
        }
      } catch (error) {
        // Fallback to allow if Redis fails
        console.error("Rate limit Redis error:", error);
        return { allowed: true };
      }
      return { allowed: true };
    }
  }
  return { allowed: true };
}

// ── Middleware Handler ──────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets entirely
  if (isStaticAsset(pathname)) {
    return NextResponse.next({ request });
  }

  // ── Rate Limiting (applied to API routes and auth POST submissions) ──
  if (isApiPath(pathname) || ((pathname === "/login" || pathname === "/signup") && request.method === "POST")) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const { allowed, retryAfterMs } = await checkRateLimit(ip, pathname);

    if (!allowed) {
      const retryAfterSeconds = Math.ceil((retryAfterMs ?? 60_000) / 1000);
      return new NextResponse(
        JSON.stringify({
          error: "Too Many Requests",
          retryAfter: retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfterSeconds),
          },
        }
      );
    }
  }

  // ── Supabase Session Refresh ──────────────────────────────────────────
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // If env vars are missing, let the request through — the app will
    // surface the error when it tries to use a Supabase client.
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // First, update the request cookies so downstream Server Components
        // see the refreshed tokens.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        // Then create a new response that carries the updated request and
        // set cookies on it so the browser receives them.
        supabaseResponse = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: Do NOT call supabase.auth.getSession() here.
  // getUser() validates the token against the Supabase Auth server,
  // which is the secure approach. getSession() only reads from cookies
  // and can be spoofed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Route Protection ──────────────────────────────────────────────────
  // The (dashboard) route group does NOT add a URL prefix to the URL.
  // So routes like /, /compliance, /chat, /goals, /assessments, /documents,
  // /reports are all dashboard routes that need protection.
  //
  // Strategy: Everything is protected UNLESS it's explicitly public or an API route.
  const isPublic = isPublicPath(pathname);
  const isApi = isApiPath(pathname);
  const needsAuth = !isPublic && !isApi;

  if (needsAuth && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    // Preserve the intended destination so we can redirect after login
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *  - _next/static (static files)
     *  - _next/image (image optimization)
     *  - favicon.ico (browser icon)
     *  - Public assets (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
