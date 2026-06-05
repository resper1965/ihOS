import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js middleware — runs on every matched request.
 *
 * Responsibilities:
 *  1. Refresh the Supabase auth session (keeps cookies alive)
 *  2. Protect /dashboard/* routes (redirect to /login when unauthenticated)
 *  3. Allow public routes (/login, /signup) and API routes (/api/*) through
 */
export async function middleware(request: NextRequest) {
  // Create an unmodified response to start with
  let supabaseResponse = NextResponse.next({
    request,
  });

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
        supabaseResponse = NextResponse.next({
          request,
        });

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

  const { pathname } = request.nextUrl;

  // Protected routes: /dashboard and all sub-routes
  const isProtectedRoute = pathname.startsWith("/dashboard");

  if (isProtectedRoute && !user) {
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
