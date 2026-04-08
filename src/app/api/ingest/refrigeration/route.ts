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

/**
 * POST /api/ingest/refrigeration
 *
 * IoT device endpoint for refrigeration controllers. Accepts readings
 * from physical devices (e.g. Modbus/BACnet bridges) and writes them
 * into refrigeration_readings.
 *
 * Security:
 *   1. HMAC-SHA256 signature verified via X-Device-Id, X-Timestamp,
 *      X-Signature headers (see src/server/ingest/auth.ts).
 *   2. Replay protection: X-Timestamp must be within 300 seconds of now.
 *   3. Rate limiting: 1 request per device per 10 seconds (in-memory,
 *      single-lane; TODO Phase E+: Upstash Redis for multi-lane).
 *   4. Payload dedup: reject if same payload_hash seen within 60 seconds.
 *   5. facility_id is NEVER taken from the request body — it comes
 *      exclusively from the verified device_credentials row (CLAUDE.md Rule 1).
 *
 * The payload schema is strict (.strict()) — unknown fields are rejected.
 */

const RefrigerationIngestSchema = z
  .object({
    compressor_index: z.number().int().min(0),
    suction_pressure: z.number(),
    discharge_pressure: z.number(),
    oil_pressure: z.number(),
    amps: z.number(),
    oil_temp: z.number(),
    brine_supply: z.number(),
    brine_return: z.number(),
    brine_flow: z.number(),
    ice_surface_temp: z.number(),
    reading_timestamp: z.string().datetime(),
  })
  .strict();

export async function POST(req: Request) {
  try {
    // Use service-role client: ingest endpoint has no user session and
    // writes data on behalf of the device. facility_id comes from the
    // verified device_credentials row, never from request input.
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
    if (device.deviceType !== "refrigeration_controller") {
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
    let parsed: z.infer<typeof RefrigerationIngestSchema>;
    try {
      parsed = RefrigerationIngestSchema.parse(JSON.parse(rawBody));
    } catch (err) {
      await writeIngestLog(supabase, {
        deviceId: device.deviceId,
        facilityId: device.facilityId,
        endpoint: "/api/ingest/refrigeration",
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

    // Step 6: Look up a facility admin user to satisfy the submitted_by FK.
    // TODO: When a `source` column is added to refrigeration_readings,
    // use source='sensor' and make submitted_by nullable for device rows.
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
        endpoint: "/api/ingest/refrigeration",
        payloadHash,
        status: "rejected",
        rejectionReason: "no admin user found for facility",
      });
      return NextResponse.json(
        { status: "facility_misconfigured" },
        { status: 500 },
      );
    }

    // Step 7: Insert reading — facility_id comes from verified device, never request body
    const { data: inserted, error: insertError } = await supabase
      .from("refrigeration_readings")
      .insert({
        facility_id: device.facilityId,
        submitted_by: adminUser.user_id,
        submitted_at: parsed.reading_timestamp,
        compressor_readings: [
          {
            compressor_index: parsed.compressor_index,
            suction_pressure: parsed.suction_pressure,
            discharge_pressure: parsed.discharge_pressure,
            oil_pressure: parsed.oil_pressure,
            amps: parsed.amps,
            oil_temp: parsed.oil_temp,
          },
        ] as unknown as Json,
        brine_supply: parsed.brine_supply,
        brine_return: parsed.brine_return,
        brine_flow: parsed.brine_flow,
        ice_surface_temp: parsed.ice_surface_temp,
        // TODO: add source: 'sensor' when the column exists (Phase E migration)
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      await writeIngestLog(supabase, {
        deviceId: device.deviceId,
        facilityId: device.facilityId,
        endpoint: "/api/ingest/refrigeration",
        payloadHash,
        status: "rejected",
        rejectionReason: insertError?.message ?? "insert failed",
      });
      return NextResponse.json(
        { status: "insert_failed" },
        { status: 500 },
      );
    }

    // Step 8: Log accepted
    await writeIngestLog(supabase, {
      deviceId: device.deviceId,
      facilityId: device.facilityId,
      endpoint: "/api/ingest/refrigeration",
      payloadHash,
      status: "accepted",
    });

    return NextResponse.json({
      status: "accepted",
      serverId: inserted.id,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
