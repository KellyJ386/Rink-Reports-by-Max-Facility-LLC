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
import { toMeasurements } from "@/modules/ice-depth/schema";

/**
 * POST /api/ingest/ice-depth
 *
 * IoT device endpoint for ice depth sensors (digital calipers).
 * Accepts point-by-point depth measurements for a specific template
 * and session date.
 *
 * Flow:
 *   1. Verify HMAC, check device type (ice_depth_sensor)
 *   2. Rate limit + dedup
 *   3. Validate payload
 *   4. Find or create today's draft session for facility + template
 *   5. Update session's measurements: find point_index, replace or append
 *   6. If depth < 1.0 inch: insert critical alert (dedup by point index)
 *   7. Log + return
 */

const IceDepthIngestSchema = z
  .object({
    template_id: z.string().uuid(),
    point_index: z.number().int().min(1).max(60),
    depth_inches: z.number(),
    reading_timestamp: z.string().datetime(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

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
    if (device.deviceType !== "ice_depth_sensor") {
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
    let parsed: z.infer<typeof IceDepthIngestSchema>;
    try {
      parsed = IceDepthIngestSchema.parse(JSON.parse(rawBody));
    } catch (err) {
      await writeIngestLog(supabase, {
        deviceId: device.deviceId,
        facilityId: device.facilityId,
        endpoint: "/api/ingest/ice-depth",
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

    // Step 6: Find or create today's draft session
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    let sessionId: string;
    let currentMeasurements: Record<string, number>;

    // Find existing draft session for today
    const { data: existingSession } = await supabase
      .from("ice_depth_sessions")
      .select("id, measurements")
      .eq("facility_id", device.facilityId)
      .eq("template_id", parsed.template_id)
      .eq("status", "draft")
      .gte("submitted_at", todayISO)
      .maybeSingle();

    if (existingSession) {
      sessionId = existingSession.id;
      currentMeasurements = toMeasurements(existingSession.measurements);
    } else {
      // Create a new draft session
      const { data: newSession, error: createError } = await supabase
        .from("ice_depth_sessions")
        .insert({
          facility_id: device.facilityId,
          template_id: parsed.template_id,
          submitted_at: new Date().toISOString(),
          status: "draft",
          resurfacing_status: null,
          notes: null,
          measurements: {} as Json,
        })
        .select("id")
        .single();

      if (createError || !newSession) {
        await writeIngestLog(supabase, {
          deviceId: device.deviceId,
          facilityId: device.facilityId,
          endpoint: "/api/ingest/ice-depth",
          payloadHash,
          status: "rejected",
          rejectionReason: createError?.message ?? "session creation failed",
        });
        return NextResponse.json(
          { status: "session_creation_failed" },
          { status: 500 },
        );
      }

      sessionId = newSession.id;
      currentMeasurements = {};
    }

    // Update measurements: set or replace the point
    const pointKey = String(parsed.point_index);
    const updatedMeasurements = {
      ...currentMeasurements,
      [pointKey]: parsed.depth_inches,
    };

    const { error: updateError } = await supabase
      .from("ice_depth_sessions")
      .update({
        measurements: updatedMeasurements as Json,
      })
      .eq("id", sessionId);

    if (updateError) {
      await writeIngestLog(supabase, {
        deviceId: device.deviceId,
        facilityId: device.facilityId,
        endpoint: "/api/ingest/ice-depth",
        payloadHash,
        status: "rejected",
        rejectionReason: updateError.message,
      });
      return NextResponse.json(
        { status: "update_failed" },
        { status: 500 },
      );
    }

    // Alert creation: if depth < 1.0 inch
    let alertTriggered = false;
    if (parsed.depth_inches < 1.0) {
      const targetId = `point-${parsed.point_index}`;

      // Dedup check
      const { data: existing } = await supabase
        .from("alerts")
        .select("id")
        .eq("facility_id", device.facilityId)
        .eq("alert_type", "ice_depth_critical")
        .eq("target_identifier", targetId)
        .is("resolved_at", null)
        .limit(1)
        .maybeSingle();

      if (!existing) {
        const { error: alertError } = await supabase
          .from("alerts")
          .insert({
            facility_id: device.facilityId,
            alert_type: "ice_depth_critical",
            severity: "critical",
            target_identifier: targetId,
            title: "Critical thin spot detected",
            description: `Point ${parsed.point_index}: ${parsed.depth_inches.toFixed(2)}"`,
            metadata: { source: "sensor", confidence: parsed.confidence } as Json,
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
      endpoint: "/api/ingest/ice-depth",
      payloadHash,
      status: "accepted",
    });

    return NextResponse.json({
      status: "accepted",
      sessionId,
      alertTriggered,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
