import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getStripe, priceIdForPlan, type PlanId } from "@/lib/stripe";

/**
 * POST /api/stripe/checkout
 *
 * Body: { plan?: "starter" | "pro" | "enterprise" }
 *
 * Phase G update: if no plan is provided, falls back to
 * STRIPE_PRICE_ID (the single-facility price). Supports the new
 * billing page that uses a direct "Upgrade Now" flow.
 *
 * Auth: requires a Supabase session cookie. The route resolves the
 * caller's facility from user_profiles, refuses non-admins, looks
 * up (or lazily creates) the facility's Stripe Customer, opens a
 * Stripe Checkout Session in subscription mode with a 14-day trial
 * if no prior subscription exists, and returns { url } so the client
 * can redirect into Stripe's hosted page.
 *
 * The facility_id is stored on the Checkout Session as
 * `client_reference_id` AND in subscription metadata so the webhook
 * can map back to our row without trusting client-supplied data.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Resolve the caller's facility + role.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("facility_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.facility_id) {
    return NextResponse.json(
      { error: "No facility for this user" },
      { status: 403 },
    );
  }
  if (profile.role !== "admin") {
    return NextResponse.json(
      { error: "Admin role required to manage billing" },
      { status: 403 },
    );
  }

  let body: { plan?: string };
  try {
    body = (await req.json()) as { plan?: string };
  } catch {
    body = {};
  }

  // Resolve price ID: prefer explicit plan, fall back to STRIPE_PRICE_ID env var
  let priceId: string | null = null;
  if (body.plan && (body.plan === "starter" || body.plan === "pro" || body.plan === "enterprise")) {
    priceId = priceIdForPlan(body.plan as PlanId);
  }
  if (!priceId) {
    priceId = process.env.STRIPE_PRICE_ID ?? null;
  }
  if (!priceId) {
    return NextResponse.json(
      { error: "No Stripe price configured — set STRIPE_PRICE_ID or choose a plan." },
      { status: 500 },
    );
  }

  // Look up existing stripe_customer_id from facility_config (Phase G)
  // or facility_subscriptions (Phase 6, legacy).
  const { data: configRow } = await supabase
    .from("facility_config")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("facility_id", profile.facility_id)
    .limit(1)
    .maybeSingle();

  const stripe = getStripe();
  let customerId = configRow?.stripe_customer_id ?? null;

  if (!customerId) {
    // Also check legacy facility_subscriptions table
    const { data: sub } = await supabase
      .from("facility_subscriptions")
      .select("stripe_customer_id")
      .eq("facility_id", profile.facility_id)
      .maybeSingle();
    customerId = sub?.stripe_customer_id ?? null;
  }

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { facilityId: profile.facility_id },
    });
    customerId = customer.id;
    // Store in facility_config
    await supabase
      .from("facility_config")
      .update({ stripe_customer_id: customerId })
      .eq("facility_id", profile.facility_id);
  }

  // Build absolute success/cancel URLs from the request origin.
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;

  // Determine whether to include a trial period (no prior subscription)
  const hasExistingSubscription = Boolean(configRow?.stripe_subscription_id);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: profile.facility_id,
    subscription_data: {
      metadata: { facilityId: profile.facility_id },
      ...(hasExistingSubscription ? {} : { trial_period_days: 14 }),
    },
    success_url: `${origin}/billing?billing=success`,
    cancel_url: `${origin}/billing?billing=cancel`,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Stripe did not return a checkout URL" },
      { status: 502 },
    );
  }
  return NextResponse.json({ url: session.url });
}
