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
});
