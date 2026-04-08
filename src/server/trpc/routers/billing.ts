import "server-only";

import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { isActiveStatus, PLANS } from "@/lib/stripe";
import { requireAdmin } from "@/server/trpc/routers/admin";

/**
 * Billing read router. Mounted at `billing`. The expensive endpoints
 * (createCheckoutSession, createPortalSession) are NOT here — they
 * live in `/api/stripe/checkout` and `/api/stripe/portal` because
 * they need to redirect on success and we don't want a tRPC RPC
 * round-trip in the URL chain.
 *
 * This router only exposes the read side: the current subscription
 * row + plan catalog so the BillingConfigCard can render.
 */
export const billingRouter = router({
  /**
   * Legacy procedure used by BillingConfigCard.
   * Queries the facility_subscriptions table (original Stripe integration).
   */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("facility_subscriptions")
      .select(
        "facility_id, status, plan, stripe_customer_id, stripe_subscription_id, current_period_end, trial_end",
      )
      .eq("facility_id", ctx.facilityId)
      .maybeSingle();
    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return {
      subscription: data,
      plans: PLANS,
      isActive: isActiveStatus(data?.status),
    };
  }),

  /**
   * New Phase G procedure — reads billing state from facility_config.
   * Used by the billing page and BillingBanner component.
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("facility_config")
      .select(
        "plan_status, plan_tier, trial_ends_at, past_due_since, seat_count, max_seats, enabled_modules, stripe_customer_id",
      )
      .eq("facility_id", ctx.facilityId)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return {
      planStatus: data?.plan_status ?? "trial",
      planTier: data?.plan_tier ?? "single_facility",
      trialEndsAt: data?.trial_ends_at ?? null,
      pastDueSince: data?.past_due_since ?? null,
      seatCount: data?.seat_count ?? 1,
      maxSeats: data?.max_seats ?? 200,
      enabledModules: (data?.enabled_modules ?? {}) as Record<string, boolean>,
      stripeCustomerId: data?.stripe_customer_id ?? null,
    };
  }),

  /**
   * Seat usage query — admin only.
   * Returns current seat count, max seats, and the list of facility users.
   * Used by UserManagementCard to show seat usage and disable "Invite User"
   * when at capacity.
   */
  getSeatUsage: protectedProcedure.query(async ({ ctx }) => {
    await requireAdmin(ctx);

    // Get seat limits from facility_config
    const { data: configRow } = await ctx.supabase
      .from("facility_config")
      .select("max_seats")
      .eq("facility_id", ctx.facilityId)
      .limit(1)
      .maybeSingle();

    // Get actual user list from user_profiles
    const { data: users, error } = await ctx.supabase
      .from("user_profiles")
      .select("user_id, full_name, role")
      .eq("facility_id", ctx.facilityId);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    const userList = (users ?? []).map((u) => ({
      id: u.user_id,
      name: u.full_name ?? null,
      role: u.role,
    }));

    return {
      used: userList.length,
      max: configRow?.max_seats ?? 200,
      users: userList,
    };
  }),
});
