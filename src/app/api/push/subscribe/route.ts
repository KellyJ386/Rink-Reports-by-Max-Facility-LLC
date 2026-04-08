import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase-server";

/**
 * POST /api/push/subscribe
 *
 * Stores (or updates) a browser push subscription for the calling user.
 * The user's facility_id is resolved server-side from user_profiles —
 * never accepted from the request body (CLAUDE.md Rule 1).
 *
 * Body: { subscription: PushSubscription }
 */

const PushSubscriptionKeysSchema = z.object({
  p256dh: z.string(),
  auth: z.string(),
});

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: PushSubscriptionKeysSchema,
});

const BodySchema = z.object({
  subscription: PushSubscriptionSchema,
});

export async function POST(req: Request) {
  // 1. Authenticate via session cookie
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid subscription shape", details: parsed.error.issues },
      { status: 422 },
    );
  }

  // 3. Resolve facility_id from user_profiles (server-side only)
  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("facility_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileErr || !profile?.facility_id) {
    return NextResponse.json(
      { error: "No facility associated with this user" },
      { status: 403 },
    );
  }

  const facilityId = profile.facility_id;

  // 4. Upsert into push_subscriptions keyed on (user_id, facility_id).
  //    Use service-role client to bypass RLS for the upsert (the INSERT
  //    policy is owned by the user's session, but UPSERT with ON CONFLICT
  //    needs UPDATE as well — easier to use service role here).
  const serviceSupabase = createSupabaseServiceRoleClient();
  const { error: upsertErr } = await serviceSupabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        facility_id: facilityId,
        subscription: parsed.data.subscription,
      },
      { onConflict: "user_id,facility_id" },
    );

  if (upsertErr) {
    return NextResponse.json(
      { error: "Failed to save subscription" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
