import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

/**
 * Server-side Supabase client bound to the current request's cookies.
 * Use inside Server Components, Route Handlers, and tRPC procedures.
 *
 * Never import this from a client component.
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
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
          // The `setAll` method may be called from a Server Component where
          // mutating cookies is not allowed. Middleware refreshes the session
          // separately, so this is safe to ignore here.
        }
      },
    },
  });
}

/**
 * Service-role Supabase client. Bypasses RLS entirely — only use
 * inside server-only code paths that have already authenticated the
 * caller through some other channel (e.g. the Stripe webhook
 * verifying its signature against STRIPE_WEBHOOK_SECRET, the
 * Phase 6B Stripe checkout endpoint validating ctx.facilityId, etc).
 *
 * Never import this from a client component, never expose its
 * results raw to the network.
 */
export function createSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
