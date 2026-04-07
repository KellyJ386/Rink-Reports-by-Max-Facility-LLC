import "server-only";

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";
import { runAllDetectors } from "@/server/anomaly/index";
import { persistAlerts } from "@/server/anomaly/persist";
import { fanOutAlert } from "@/server/notifications/fanout";

/**
 * POST /api/cron/anomaly-scan
 *
 * Vercel cron endpoint (see vercel.json). Runs hourly.
 * Vercel sends `Authorization: Bearer {CRON_SECRET}` automatically.
 *
 * This route:
 *   1. Verifies the cron secret.
 *   2. Uses the service-role Supabase client (bypasses RLS — the cron
 *      has no user session and writes alerts across all facilities).
 *   3. Fetches all active facility IDs.
 *   4. Runs all anomaly detectors per facility.
 *   5. Persists (with dedup) into the alerts table.
 *   6. Fan-outs notifications for each newly inserted alert.
 *   7. Returns a JSON summary; never lets errors 500 the cron.
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

  // 2. Fetch all facility IDs + names (needed for notification messages)
  const { data: facilities, error: facilitiesErr } = await supabase
    .from("facilities")
    .select("id, name");

  if (facilitiesErr) {
    Sentry.captureException(facilitiesErr, {
      tags: { context: "anomaly-cron-fetch-facilities" },
    });
    return NextResponse.json(
      { ok: false, error: "Failed to fetch facilities" },
      { status: 500 },
    );
  }

  if (!facilities || facilities.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, alertsCreated: 0 });
  }

  // Build a facility name lookup map
  const facilityNames = new Map<string, string>(
    facilities.map((f) => [f.id, f.name ?? "Your Facility"]),
  );

  let totalAlertsCreated = 0;

  // 3. Run detectors + persist per facility — use allSettled so one
  //    failing facility doesn't block the rest.
  const facilityResults = await Promise.allSettled(
    facilities.map(async (facility) => {
      const results = await runAllDetectors(facility.id, supabase);
      const { inserted, insertedAlerts } = await persistAlerts(
        results,
        supabase,
      );

      // 4. Fan-out notifications for each newly created alert.
      //    Failures are fire-and-forget and don't affect the cron result.
      if (insertedAlerts.length > 0) {
        const facilityName = facilityNames.get(facility.id) ?? "Your Facility";
        await Promise.allSettled(
          insertedAlerts.map((alert) =>
            fanOutAlert(alert, facilityName, supabase),
          ),
        );
      }

      return inserted;
    }),
  );

  for (const outcome of facilityResults) {
    if (outcome.status === "fulfilled") {
      totalAlertsCreated += outcome.value;
    } else {
      Sentry.captureException(outcome.reason, {
        tags: { context: "anomaly-cron-per-facility" },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: facilities.length,
    alertsCreated: totalAlertsCreated,
  });
}
