import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Database } from "@/lib/database.types";
import type { Role } from "@/lib/auth/roles";

export type TRPCContext = {
  supabase: SupabaseClient<Database>;
  user: User | null;
  /**
   * facility_id is read here from `user_profiles` and ONLY here.
   * It is NEVER accepted from client input. See CLAUDE.md Rule 1.
   */
  facilityId: string | null;
  /**
   * The authenticated user's role within their facility.
   * Null when no user is authenticated or no profile row exists.
   * Used by viewerProcedure and role-guard utilities.
   */
  role: Role | null;
};

/**
 * Build the per-request tRPC context.
 *
 * Steps:
 *   1. Create a request-bound Supabase server client.
 *   2. Resolve the authenticated user (if any).
 *   3. If authenticated, look up `facility_id` and `role` from
 *      `user_profiles`. Both are read from the DB, never from
 *      client input (CLAUDE.md Rule 1).
 */
export async function createTRPCContext(): Promise<TRPCContext> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let facilityId: string | null = null;
  let role: Role | null = null;

  if (user) {
    // `user_profiles` is the source of truth for facility membership.
    // The Phase 0 SQL migration will create this table; until then
    // the query simply returns no rows and `facilityId` stays null.
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("facility_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.facility_id) {
      facilityId = profile.facility_id;
    }
    if (profile?.role) {
      role = profile.role as Role;
    }
  }

  return { supabase, user, facilityId, role };
}
