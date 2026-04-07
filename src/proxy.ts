import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import * as Sentry from "@sentry/nextjs";

/**
 * Supabase SSR session proxy (Next 16 renamed `middleware` to `proxy`).
 *
 * Two responsibilities, in this order:
 *   1. Refresh the auth cookie on every request (required for server
 *      components and route handlers to see a valid session).
 *   2. Redirect unauthenticated users away from protected route groups
 *      to /login?next=<original-path>, and authenticated users away
 *      from /login back to /dashboard.
 *
 * The auth gate is also enforced server-side in (dashboard)/layout.tsx,
 * via tRPC `protectedProcedure`, and via Supabase RLS at the database.
 * That redundancy is intentional (CLAUDE.md Rule 8).
 */

const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

export async function proxy(request: NextRequest) {
  try {
    let response = NextResponse.next({ request });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      // Misconfigured environment. Fail closed for protected routes.
      if (
        PROTECTED_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p))
      ) {
        return NextResponse.redirect(new URL("/login", request.url));
      }
      return response;
    }

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    // IMPORTANT: do not insert any code between createServerClient and
    // getUser. Per Supabase SSR docs, getUser() is what triggers the
    // session refresh and writes refreshed cookies via setAll above.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;
    const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

    if (isProtected && !user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }

    if (pathname === "/login" && user) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return response;
  } catch (err) {
    Sentry.captureException(err);
    throw err;
  }
}

export const config = {
  matcher: [
    /*
     * Match every request path EXCEPT:
     *   - _next/static and _next/image (build assets)
     *   - favicon.ico
     *   - api/trpc and api/sync (handle their own auth)
     *   - common image file extensions in /public
     */
    "/((?!_next/static|_next/image|favicon.ico|api/trpc|api/sync|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
