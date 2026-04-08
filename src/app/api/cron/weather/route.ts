import "server-only";

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";
import { fetchWeatherForFacility } from "@/server/weather/service";

/**
 * GET /api/cron/weather
 *
 * Vercel cron endpoint (see vercel.json). Runs daily at 6 AM UTC.
 * Vercel sends `Authorization: Bearer {CRON_SECRET}` automatically.
 *
 * This route:
 *   1. Verifies the cron secret.
 *   2. Uses the service-role Supabase client (bypasses RLS).
 *   3. Fetches all facility IDs.
 *   4. Pulls weather for today for each facility.
 *   5. Uses Promise.allSettled to isolate failures.
 *   6. Returns a JSON summary.
 *
 * facility_id comes from the database, never from request input
 * (CLAUDE.md Rule 1).
 */
export async function GET(req: Request) {
  // 1. Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("Authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();

  // 2. Get today's ISO date string (YYYY-MM-DD)
  const todayISODate = new Date().toISOString().split("T")[0];

  // 3. Fetch all facility IDs
  const { data: facilities, error: facilitiesErr } = await supabase
    .from("facilities")
    .select("id");

  if (facilitiesErr) {
    Sentry.captureException(facilitiesErr, {
      tags: { context: "weather-cron-fetch-facilities" },
    });
    return NextResponse.json(
      { ok: false, error: "Failed to fetch facilities" },
      { status: 500 },
    );
  }

  if (!facilities || facilities.length === 0) {
    return NextResponse.json({ ok: true, fetched: 0 });
  }

  // 4. Pull weather for each facility
  const weatherResults = await Promise.allSettled(
    facilities.map((facility) =>
      fetchWeatherForFacility(facility.id, todayISODate, supabase),
    ),
  );

  let successCount = 0;
  for (const outcome of weatherResults) {
    if (outcome.status === "fulfilled") {
      if (outcome.value !== null) {
        successCount += 1;
      }
    } else {
      Sentry.captureException(outcome.reason, {
        tags: { context: "weather-cron-per-facility" },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    fetched: successCount,
  });
}
