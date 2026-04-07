import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getStripe, priceIdForPlan, type PlanId } from "@/lib/stripe";

/**
 * POST /api/stripe/checkout
 *
 * Body: { plan: "starter" | "pro" | "enterprise" }
 *
 * Auth: requires a Supabase session cookie. The route resolves the
 * caller's facility from user_profiles, refuses non-admins, looks
 * up (or lazily creates) the facility's Stripe Customer, opens a
 * Stripe Checkout Session in subscription mode, and returns
 * { url } so the client can redirect into Stripe's hosted page.
 *
 * Returning JSON instead of an HTTP redirect lets the client decide
 * whether to navigate (window.location) or open a new tab.
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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const plan = body.plan as PlanId | undefined;
  if (plan !== "starter" && plan !== "pro" && plan !== "enterprise") {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }
  const priceId = priceIdForPlan(plan);
  if (!priceId) {
    return NextResponse.json(
      { error: `Plan "${plan}" is not configured on the server` },
      { status: 500 },
    );
  }

  // Look up (or lazily create) the Stripe Customer for this facility.
  const { data: sub } = await supabase
    .from("facility_subscriptions")
    .select("stripe_customer_id")
    .eq("facility_id", profile.facility_id)
    .maybeSingle();

  const stripe = getStripe();
  let customerId = sub?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { facility_id: profile.facility_id },
    });
    customerId = customer.id;
    await supabase
      .from("facility_subscriptions")
      .update({ stripe_customer_id: customerId })
      .eq("facility_id", profile.facility_id);
  }

  // Build absolute success/cancel URLs from the request origin so
  // local dev and prod just work without a separate env var.
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: profile.facility_id,
    subscription_data: {
      metadata: { facility_id: profile.facility_id, plan },
    },
    success_url: `${origin}/admin?billing=success`,
    cancel_url: `${origin}/admin?billing=cancel`,
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
