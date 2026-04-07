import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getStripe } from "@/lib/stripe";

/**
 * POST /api/stripe/portal
 *
 * Returns { url } pointing into Stripe's Customer Portal so the
 * facility's admin can update payment methods, change plans, or
 * cancel from Stripe's hosted UI.
 *
 * Requires admin role and an existing stripe_customer_id (the
 * checkout flow lazily creates it on first subscribe).
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

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

  const { data: sub } = await supabase
    .from("facility_subscriptions")
    .select("stripe_customer_id")
    .eq("facility_id", profile.facility_id)
    .maybeSingle();
  if (!sub?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No Stripe customer for this facility yet — start a checkout first." },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${origin}/admin`,
  });

  return NextResponse.json({ url: session.url });
}
