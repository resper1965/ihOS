import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

// ── Rate Limiting (in-memory, compatible with Vercel Edge) ──────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const RATE_LIMITS: { pattern: string; config: RateLimitConfig }[] = [
  // Strictest first — order matters (first match wins)
  { pattern: "/api/chat/generate-answers", config: { maxRequests: 5, windowMs: 60_000 } },
  { pattern: "/api/chat/promote-qa", config: { maxRequests: 10, windowMs: 60_000 } },
  { pattern: "/api/chat/", config: { maxRequests: 20, windowMs: 60_000 } },
  { pattern: "/api/documents/upload", config: { maxRequests: 10, windowMs: 60_000 } },
  { pattern: "/login", config: { maxRequests: 5, windowMs: 900_000 } }, // 5 per 15min
  { pattern: "/signup", config: { maxRequests: 5, windowMs: 900_000 } },
  { pattern: "/api/", config: { maxRequests: 100, windowMs: 60_000 } },
];

function getRateLimitConfig(pathname: string): RateLimitConfig | null {
  for (const { pattern, config } of RATE_LIMITS) {
    if (pathname.startsWith(pattern)) return config;
  }
  return null;
}

function checkRateLimit(
  ip: string,
  pathname: string
): { allowed: boolean; retryAfterMs?: number } {
  const config = getRateLimitConfig(pathname);
  if (!config) return { allowed: true };

  const key = `${ip}:${pathname.split("/").slice(0, 4).join("/")}`;
  const now = Date.now();

  // Cleanup expired entries periodically (every ~100 requests)
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap) {
      if (v.resetAt <= now) rateLimitMap.delete(k);
    }
  }

  const entry = rateLimitMap.get(key);

  if (!entry || entry.resetAt <= now) {
    // New window
    rateLimitMap.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true };
}

// ── Middleware Handler ──────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets entirely
  if (isStaticAsset(pathname)) {
    return NextResponse.next({ request });
  }

  // ── Rate Limiting (applied to API routes and auth endpoints) ──────────
  if (isApiPath(pathname) || pathname === "/login" || pathname === "/signup") {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    const { allowed, retryAfterMs } = checkRateLimit(ip, pathname);

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
