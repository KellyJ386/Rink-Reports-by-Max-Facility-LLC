import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";
import { createOrUpdateContact } from "@/lib/hubspot";

/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook handler. Verifies the signature against
 * STRIPE_WEBHOOK_SECRET, then keeps `facility_config` billing fields
 * in sync with the upstream subscription state.
 *
 * Design decisions:
 *   - Write to billing_events FIRST before updating facility_config.
 *     The UNIQUE index on stripe_event_id makes this the idempotency
 *     check: if insert fails with unique violation, return 200 without
 *     re-processing.
 *   - plan_status is our internal state machine, not Stripe's status
 *     enum, so the app can express 'locked' (past_due > 7 days) without
 *     relying on Stripe strings.
 *   - enabled_modules is fully enabled for active/trial, and for deleted
 *     subscriptions all modules except adminControlCenter are disabled.
 *
 * Events handled:
 *   * customer.subscription.created
 *   * customer.subscription.updated
 *   * customer.subscription.deleted
 *   * invoice.payment_succeeded
 *   * invoice.payment_failed
 *   * customer.subscription.trial_will_end
 *   * checkout.session.completed  (preserved from earlier handler)
 *
 * IMPORTANT: Next.js App Router Route Handlers expose the raw body
 * via `await req.text()`. The Stripe SDK requires the RAW body for
 * signature verification — do not parse it as JSON first.
 *
 * Returns 200 even on no-op events so Stripe doesn't retry; only
 * returns 4xx on signature failures and 5xx on hard DB errors.
 */

export const dynamic = "force-dynamic";

const ALL_MODULES_ENABLED = {
  dailyReports: true,
  iceOperations: true,
  refrigeration: true,
  airQuality: true,
  incidentReporting: true,
  employeeScheduling: true,
  communications: true,
  adminControlCenter: true,
};

const ALL_MODULES_DISABLED_EXCEPT_ADMIN = {
  dailyReports: false,
  iceOperations: false,
  refrigeration: false,
  airQuality: false,
  incidentReporting: false,
  employeeScheduling: false,
  communications: false,
  adminControlCenter: true,
};

/** Map a Stripe subscription status to our internal plan_status. */
function mapStripeStatus(
  stripeStatus: string,
): "active" | "trial" | "past_due" | "cancelled" | "locked" {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trial";
    case "past_due":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    case "unpaid":
    case "incomplete":
    case "paused":
      return "locked";
    default:
      return "locked";
  }
}

/**
 * Attempt to insert a billing_events row for idempotency.
 * Returns true if we should proceed with processing, false if the event
 * was already processed (unique violation on stripe_event_id).
 */
async function recordBillingEvent(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  facilityId: string,
  eventId: string,
  eventType: string,
  payload: unknown,
): Promise<boolean> {
  const { error } = await supabase.from("billing_events").insert({
    facility_id: facilityId,
    stripe_event_id: eventId,
    event_type: eventType,
    payload: payload as import("@/lib/database.types").Json,
  });

  if (error) {
    // PostgreSQL unique violation code
    if (error.code === "23505") {
      // Already processed — idempotent no-op
      return false;
    }
    // Any other error is a hard failure
    throw new Error(`billing_events insert failed: ${error.message}`);
  }
  return true;
}

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
        // Preserved from earlier handler — link customer to facility on checkout
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
          .from("facility_config")
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
          })
          .eq("facility_id", facilityId);
        break;
      }

      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        const facilityId = subscription.metadata?.facilityId ?? subscription.metadata?.facility_id ?? null;
        if (!facilityId) break;

        const shouldProcess = await recordBillingEvent(
          supabase,
          facilityId,
          event.id,
          event.type,
          event.data.object,
        );
        if (!shouldProcess) break;

        const planStatus = mapStripeStatus(subscription.status);
        const trialEnd = (subscription as unknown as { trial_end?: number | null }).trial_end;
        const trialEndsAt = trialEnd
          ? new Date(trialEnd * 1000).toISOString()
          : null;

        const quantity = subscription.items.data[0]?.quantity ?? 1;

        await supabase
          .from("facility_config")
          .update({
            stripe_subscription_id: subscription.id,
            plan_status: planStatus,
            trial_ends_at: trialEndsAt,
            seat_count: quantity,
            enabled_modules: ALL_MODULES_ENABLED,
          })
          .eq("facility_id", facilityId);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const facilityId = subscription.metadata?.facilityId ?? subscription.metadata?.facility_id ?? null;
        if (!facilityId) break;

        const shouldProcess = await recordBillingEvent(
          supabase,
          facilityId,
          event.id,
          event.type,
          event.data.object,
        );
        if (!shouldProcess) break;

        const planStatus = mapStripeStatus(subscription.status);

        // Fetch current facility_config to check if past_due_since should be set
        const { data: configRow } = await supabase
          .from("facility_config")
          .select("plan_status, past_due_since")
          .eq("facility_id", facilityId)
          .limit(1)
          .maybeSingle();

        const trialEnd = (subscription as unknown as { trial_end?: number | null }).trial_end;
        const trialEndsAt = trialEnd
          ? new Date(trialEnd * 1000).toISOString()
          : null;

        const quantity = subscription.items.data[0]?.quantity ?? 1;

        const updatePayload: Record<string, unknown> = {
          stripe_subscription_id: subscription.id,
          plan_status: planStatus,
          trial_ends_at: trialEndsAt,
          seat_count: quantity,
        };

        // Set past_due_since only when first transitioning to past_due
        if (planStatus === "past_due" && !configRow?.past_due_since) {
          updatePayload.past_due_since = new Date().toISOString();
        }
        // Clear past_due_since when coming back to active
        if (planStatus === "active") {
          updatePayload.past_due_since = null;
        }

        await supabase
          .from("facility_config")
          .update(updatePayload)
          .eq("facility_id", facilityId);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const facilityId = subscription.metadata?.facilityId ?? subscription.metadata?.facility_id ?? null;
        if (!facilityId) break;

        const shouldProcess = await recordBillingEvent(
          supabase,
          facilityId,
          event.id,
          event.type,
          event.data.object,
        );
        if (!shouldProcess) break;

        await supabase
          .from("facility_config")
          .update({
            plan_status: "cancelled",
            enabled_modules: ALL_MODULES_DISABLED_EXCEPT_ADMIN,
          })
          .eq("facility_id", facilityId);

        // Best-effort HubSpot sync on cancellation
        try {
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
            const { data: facility } = await supabase
              .from("facilities")
              .select("name")
              .eq("id", facilityId)
              .maybeSingle();
            if (adminEmail) {
              void createOrUpdateContact({
                email: adminEmail,
                facility_name: facility?.name,
                facility_id: facilityId,
                subscription_status: "canceled",
                plan: undefined,
              });
            }
          }
        } catch (err) {
          console.warn("[stripe webhook] hubspot sync skipped:", err);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : (invoice.customer?.id ?? null);
        if (!customerId) break;

        // Find facility by stripe_customer_id
        const { data: configRow } = await supabase
          .from("facility_config")
          .select("facility_id")
          .eq("stripe_customer_id", customerId)
          .limit(1)
          .maybeSingle();
        if (!configRow?.facility_id) break;

        const facilityId = configRow.facility_id;

        const shouldProcess = await recordBillingEvent(
          supabase,
          facilityId,
          event.id,
          event.type,
          event.data.object,
        );
        if (!shouldProcess) break;

        await supabase
          .from("facility_config")
          .update({
            plan_status: "active",
            past_due_since: null,
          })
          .eq("facility_id", facilityId);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : (invoice.customer?.id ?? null);
        if (!customerId) break;

        // Find facility by stripe_customer_id
        const { data: configRow } = await supabase
          .from("facility_config")
          .select("facility_id, plan_status, past_due_since")
          .eq("stripe_customer_id", customerId)
          .limit(1)
          .maybeSingle();
        if (!configRow?.facility_id) break;

        const facilityId = configRow.facility_id;

        const shouldProcess = await recordBillingEvent(
          supabase,
          facilityId,
          event.id,
          event.type,
          event.data.object,
        );
        if (!shouldProcess) break;

        // Only escalate to past_due if currently active or trial
        if (
          configRow.plan_status === "active" ||
          configRow.plan_status === "trial"
        ) {
          await supabase
            .from("facility_config")
            .update({
              plan_status: "past_due",
              past_due_since: new Date().toISOString(),
            })
            .eq("facility_id", facilityId);
        }
        break;
      }

      case "customer.subscription.trial_will_end": {
        const subscription = event.data.object as Stripe.Subscription;
        const facilityId = subscription.metadata?.facilityId ?? subscription.metadata?.facility_id ?? null;
        if (!facilityId) break;

        // Insert a trial_ending alert (dedup check: no open alert of this type)
        const { data: existing } = await supabase
          .from("alerts")
          .select("id")
          .eq("facility_id", facilityId)
          .eq("alert_type", "trial_ending")
          .is("resolved_at", null)
          .limit(1)
          .maybeSingle();

        if (!existing) {
          await supabase.from("alerts").insert({
            facility_id: facilityId,
            alert_type: "trial_ending",
            severity: "warning",
            target_identifier: "trial",
            title: "Trial ends in 3 days",
            description:
              "Upgrade now to continue using RinkReports.",
            metadata: {},
          });
        }
        break;
      }

      default:
        // Unhandled event types — return 200 so Stripe doesn't retry.
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook failed";
    console.error("[stripe webhook] hard error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
