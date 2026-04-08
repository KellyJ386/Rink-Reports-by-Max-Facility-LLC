import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

import { authedProcedure, router } from "@/server/trpc/trpc";
import { createOrUpdateContact } from "@/lib/hubspot";
import { syncFacilityToHubSpot } from "@/server/hubspot/sync";

/**
 * Onboarding router. Mounted at `onboarding`. The single mutation
 * here is the only path that wraps the SECURITY DEFINER
 * `create_facility()` Postgres function so a brand-new user can
 * self-serve a facility immediately after sign-up.
 *
 * Uses `authedProcedure` (auth required, facility NOT required)
 * because the caller has no facility yet — that's the entire point
 * of the call.
 */
export const onboardingRouter = router({
  /**
   * Returns the calling user's onboarding status:
   *   - `pending`: signed in, no user_profiles row OR no facility_id
   *   - `complete`: signed in and linked to a facility
   *
   * Used by the /onboarding page to bounce users who have already
   * onboarded back to /dashboard.
   */
  status: authedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("user_profiles")
      .select("facility_id")
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }
    if (data?.facility_id) {
      return { status: "complete" as const, facility_id: data.facility_id };
    }
    return { status: "pending" as const, facility_id: null };
  }),

  /**
   * Create a brand-new facility owned by the calling user. Wraps
   * the SECURITY DEFINER `create_facility()` Postgres function which
   * atomically inserts the facility, the admin profile, the trialing
   * subscription row, and the seeded module catalog.
   *
   * Throws PRECONDITION_FAILED if the user is already linked to a
   * facility (the function raises 'user is already linked to a facility').
   */
  createFacility: authedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        timezone: z.string().min(1).max(64).default("America/New_York"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("create_facility", {
        p_name: input.name,
        p_timezone: input.timezone,
      });
      if (error) {
        if (/already linked to a facility/i.test(error.message)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "You are already linked to a facility.",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const facilityId = data as unknown as string;

      // Best-effort HubSpot Contact sync (legacy). Non-blocking — if HubSpot
      // is unreachable or HUBSPOT_ACCESS_TOKEN isn't set, the call
      // is a silent no-op so onboarding still succeeds.
      const email = ctx.user.email ?? "";
      if (email) {
        // We don't await — the user shouldn't pay the latency cost.
        // Errors are swallowed inside createOrUpdateContact itself.
        void createOrUpdateContact({
          email,
          facility_name: input.name,
          facility_id: facilityId,
          subscription_status: "trialing",
        });
      }

      // Fire-and-forget comprehensive HubSpot sync (company, contact, deal)
      void Promise.resolve().then(() =>
        syncFacilityToHubSpot(facilityId).catch((err) =>
          Sentry.captureException(err, { tags: { context: "hubspot-sync" } }),
        ),
      );

      return { facility_id: facilityId };
    }),
});
