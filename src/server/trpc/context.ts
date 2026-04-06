import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Database } from "@/lib/database.types";

export type TRPCContext = {
  supabase: SupabaseClient<Database>;
  user: User | null;
  /**
   * facility_id is read here from `user_profiles` and ONLY here.
   * It is NEVER accepted from client input. See CLAUDE.md Rule 1.
   */
  facilityId: string | null;
};

/**
 * Build the per-request tRPC context.
 *
 * Steps:
 *   1. Create a request-bound Supabase server client.
 *   2. Resolve the authenticated user (if any).
 *   3. If authenticated, look up `facility_id` from `user_profiles`.
 */
export async function createTRPCContext(): Promise<TRPCContext> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let facilityId: string | null = null;

  if (user) {
    // `user_profiles` is the source of truth for facility membership.
    // The Phase 0 SQL migration will create this table; until then
    // the query simply returns no rows and `facilityId` stays null.
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("facility_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.facility_id) {
      facilityId = profile.facility_id;
    }
  }

  return { supabase, user, facilityId };
}
