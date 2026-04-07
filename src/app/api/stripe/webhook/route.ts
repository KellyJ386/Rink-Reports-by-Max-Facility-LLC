import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";
import { createOrUpdateContact } from "@/lib/hubspot";

/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook handler. Verifies the signature against
 * STRIPE_WEBHOOK_SECRET, then keeps `facility_subscriptions` in
 * sync with the upstream subscription state. Service-role Supabase
 * client is used here because the webhook has no Supabase Auth
 * session — Stripe's signature is the authentication.
 *
 * Events handled:
 *   * checkout.session.completed       — first link of customer to facility
 *   * customer.subscription.created    — new subscription, store id + status
 *   * customer.subscription.updated    — status / period_end changes
 *   * customer.subscription.deleted    — flip to canceled
 *
 * IMPORTANT: Next.js App Router Route Handlers expose the raw body
 * via `await req.text()`. The Stripe SDK requires the RAW body for
 * signature verification — do not parse it as JSON first.
 *
 * Returns 200 even on no-op events so Stripe doesn't retry; only
 * returns 4xx on signature failures and 5xx on hard DB errors.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }

  const stripe = getStripe();
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bad signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const facilityId =
          session.client_reference_id ??
          (session.metadata?.facility_id ?? null);
        if (!facilityId) break;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : (session.customer?.id ?? null);
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription?.id ?? null);
        await supabase
          .from("facility_subscriptions")
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            // Don't flip status here — wait for the dedicated
            // subscription event so we get the canonical Stripe
            // status string instead of guessing.
          })
          .eq("facility_id", facilityId);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const facilityId = subscription.metadata?.facility_id ?? null;
        if (!facilityId) break;

        const status =
          event.type === "customer.subscription.deleted"
            ? "canceled"
            : subscription.status;

        // Pluck the plan tag we stamped at checkout time, if any.
        const plan = subscription.metadata?.plan ?? null;

        // current_period_end lives on the first item in the items
        // array under newer Stripe API versions; fall back to the
        // top-level field if it's still around.
        const currentPeriodEndRaw =
          (subscription as unknown as { current_period_end?: number })
            .current_period_end ??
          subscription.items.data[0]?.current_period_end ??
          null;
        const currentPeriodEnd = currentPeriodEndRaw
          ? new Date(currentPeriodEndRaw * 1000).toISOString()
          : null;

        const { error } = await supabase
          .from("facility_subscriptions")
          .update({
            status,
            plan,
            stripe_subscription_id: subscription.id,
            current_period_end: currentPeriodEnd,
          })
          .eq("facility_id", facilityId);
        if (error) {
          console.error("[stripe webhook] update failed:", error.message);
          return NextResponse.json(
            { error: error.message },
            { status: 500 },
          );
        }

        // Best-effort HubSpot Contact sync. Look up the facility's
        // owner email so we can patch the right Contact.
        try {
          const { data: facility } = await supabase
            .from("facilities")
            .select("name")
            .eq("id", facilityId)
            .maybeSingle();
          const { data: adminProfile } = await supabase
            .from("user_profiles")
            .select("user_id")
            .eq("facility_id", facilityId)
            .eq("role", "admin")
            .limit(1)
            .maybeSingle();
          if (adminProfile) {
            const { data: adminUser } =
              await supabase.auth.admin.getUserById(adminProfile.user_id);
            const adminEmail = adminUser.user?.email ?? "";
            if (adminEmail) {
              void createOrUpdateContact({
                email: adminEmail,
                facility_name: facility?.name,
                facility_id: facilityId,
                subscription_status: status,
                plan: plan ?? undefined,
              });
            }
          }
        } catch (err) {
          // HubSpot lookup is non-critical — log and continue.
          console.warn("[stripe webhook] hubspot sync skipped:", err);
        }
        break;
      }

      default:
        // Unhandled event types — return 200 so Stripe doesn't
        // retry. Add new cases above as we wire more flows.
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook failed";
    console.error("[stripe webhook] hard error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
