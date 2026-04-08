import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { verifyDeviceRequest } from "@/server/ingest/auth";
import { checkIngestRateLimit } from "@/server/ingest/rateLimit";
import { writeIngestLog, findRecentIngestLog } from "@/server/ingest/log";
import { computeTier, EMPTY_THRESHOLDS } from "@/modules/air-quality/schema";
import type { Tier } from "@/modules/air-quality/schema";

/**
 * POST /api/ingest/air-quality
 *
 * IoT device endpoint for air quality sensors. Accepts readings from
 * physical sensors and writes them into air_quality_readings.
 *
 * Security: same as /api/ingest/refrigeration
 * (HMAC verification, replay protection, rate limiting, dedup).
 *
 * Tier computation: reads facility_config air-quality thresholds and
 * calls computeTier(). If no thresholds are configured, uses a simple
 * inline rule: tier 4 if CO>35 or NO2>3, tier 3 if CO>15 or NO2>1,
 * else tier 1.
 *
 * Alert creation: if tier >= 3, inserts an alert row with dedup check
 * (same facility_id + alert_type + target_identifier = submitted_at).
 */

const AirQualityIngestSchema = z
  .object({
    co_ppm: z.number().nonnegative(),
    no2_ppm: z.number().nonnegative(),
    nh3_ppm: z.number().nonnegative(),
    reading_timestamp: z.string().datetime(),
  })
  .strict();

/**
 * Fallback tier computation when facility_config thresholds are not set.
 * Simple rule: tier 4 if CO>35 or NO2>3, tier 3 if CO>15 or NO2>1, else tier 1.
 */
function fallbackComputeTier(co_ppm: number, no2_ppm: number): Tier {
  if (co_ppm > 35 || no2_ppm > 3) return "evacuate";
  if (co_ppm > 15 || no2_ppm > 1) return "action";
  return "normal";
}

export async function POST(req: Request) {
  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const rawBody = await req.text();

    // Step 1: Verify HMAC signature + replay protection
    const device = await verifyDeviceRequest(req, rawBody, supabase);
    if (!device) {
      return NextResponse.json({ status: "unauthorized" }, { status: 401 });
    }

    // Step 2: Verify device type
    if (device.deviceType !== "air_quality_sensor") {
      return NextResponse.json(
        { status: "wrong_device_type" },
        { status: 403 },
      );
    }

    // Step 3: Rate limit
    if (!checkIngestRateLimit(device.deviceId)) {
      return NextResponse.json({ status: "rate_limited" }, { status: 429 });
    }

    // Step 4: Dedup — same payload hash within 60 seconds = replay
    const payloadHash = crypto
      .createHash("sha256")
      .update(rawBody)
      .digest("hex");
    if (
      await findRecentIngestLog(supabase, device.deviceId, payloadHash)
    ) {
      return NextResponse.json({ status: "duplicate" }, { status: 200 });
    }

    // Step 5: Validate payload
    let parsed: z.infer<typeof AirQualityIngestSchema>;
    try {
      parsed = AirQualityIngestSchema.parse(JSON.parse(rawBody));
    } catch (err) {
      await writeIngestLog(supabase, {
        deviceId: device.deviceId,
        facilityId: device.facilityId,
        endpoint: "/api/ingest/air-quality",
        payloadHash,
        status: "rejected",
        rejectionReason:
          err instanceof Error ? err.message : "invalid payload",
      });
      return NextResponse.json(
        { status: "invalid_payload" },
        { status: 400 },
      );
    }

    // Step 6: Compute tier from facility config thresholds
    let tier: Tier = "normal";
    try {
      const { data: config } = await supabase
        .from("facility_config")
        .select("air_quality")
        .eq("facility_id", device.facilityId)
        .maybeSingle();

      if (config?.air_quality) {
        const configData = config.air_quality as {
          co_caution?: number | null;
          co_action?: number | null;
          co_evacuate?: number | null;
          no2_caution?: number | null;
          no2_action?: number | null;
          no2_evacuate?: number | null;
        } | null;

        if (configData) {
          tier = computeTier(
            { co_ppm: parsed.co_ppm, no2_ppm: parsed.no2_ppm },
            {
              co_caution: configData.co_caution ?? null,
              co_action: configData.co_action ?? null,
              co_evacuate: configData.co_evacuate ?? null,
              no2_caution: configData.no2_caution ?? null,
              no2_action: configData.no2_action ?? null,
              no2_evacuate: configData.no2_evacuate ?? null,
            },
          );
        } else {
          tier = fallbackComputeTier(parsed.co_ppm, parsed.no2_ppm);
        }
      } else {
        tier = fallbackComputeTier(parsed.co_ppm, parsed.no2_ppm);
      }
    } catch {
      // If config lookup fails, fall back to inline rule
      tier = fallbackComputeTier(parsed.co_ppm, parsed.no2_ppm);
    }

    // Step 7: Look up an admin user for submitted_by FK
    const { data: adminUser } = await supabase
      .from("user_profiles")
      .select("user_id")
      .eq("facility_id", device.facilityId)
      .in("role", ["admin", "super_admin"])
      .limit(1)
      .maybeSingle();

    if (!adminUser) {
      await writeIngestLog(supabase, {
        deviceId: device.deviceId,
        facilityId: device.facilityId,
        endpoint: "/api/ingest/air-quality",
        payloadHash,
        status: "rejected",
        rejectionReason: "no admin user found for facility",
      });
      return NextResponse.json(
        { status: "facility_misconfigured" },
        { status: 500 },
      );
    }

    // Step 8: Insert reading — facility_id comes from verified device
    const { data: inserted, error: insertError } = await supabase
      .from("air_quality_readings")
      .insert({
        facility_id: device.facilityId,
        submitted_by: adminUser.user_id,
        submitted_at: parsed.reading_timestamp,
        co_ppm: parsed.co_ppm,
        no2_ppm: parsed.no2_ppm,
        nh3_ppm: parsed.nh3_ppm,
        tier,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      await writeIngestLog(supabase, {
        deviceId: device.deviceId,
        facilityId: device.facilityId,
        endpoint: "/api/ingest/air-quality",
        payloadHash,
        status: "rejected",
        rejectionReason: insertError?.message ?? "insert failed",
      });
      return NextResponse.json(
        { status: "insert_failed" },
        { status: 500 },
      );
    }

    // Alert creation: if tier >= 3, check for existing unresolved alert
    let alertTriggered = false;
    if (tier === "action" || tier === "evacuate") {
      const severity = tier === "evacuate" ? "critical" : "warning";
      const targetId = parsed.reading_timestamp;

      // Dedup check: same facility + alert_type + target_identifier
      const { data: existing } = await supabase
        .from("alerts")
        .select("id")
        .eq("facility_id", device.facilityId)
        .eq("alert_type", "air_quality_escalation")
        .eq("target_identifier", targetId)
        .is("resolved_at", null)
        .limit(1)
        .maybeSingle();

      if (!existing) {
        const { error: alertError } = await supabase
          .from("alerts")
          .insert({
            facility_id: device.facilityId,
            alert_type: "air_quality_escalation",
            severity,
            target_identifier: targetId,
            title: "Sensor-reported air quality escalation",
            description: `CO ${parsed.co_ppm} ppm, NO2 ${parsed.no2_ppm} ppm, NH3 ${parsed.nh3_ppm} ppm`,
            metadata: { source: "sensor" } as Json,
          });

        if (!alertError) {
          alertTriggered = true;
        }
      }
    }

    // Step 9: Log accepted
    await writeIngestLog(supabase, {
      deviceId: device.deviceId,
      facilityId: device.facilityId,
      endpoint: "/api/ingest/air-quality",
      payloadHash,
      status: "accepted",
    });

    return NextResponse.json({
      status: "accepted",
      tier,
      alertTriggered,
      serverId: inserted.id,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
