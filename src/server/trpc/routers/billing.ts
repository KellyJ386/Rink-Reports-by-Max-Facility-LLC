import "server-only";

import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import { isActiveStatus, PLANS } from "@/lib/stripe";

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
});
