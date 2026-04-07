import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Json } from "@/lib/database.types";
import { DailyReportSubmissionInput } from "@/modules/daily-reports/schema";
import { IceOperationSubmissionInput } from "@/modules/ice-operations/schema";
import { RefrigerationReadingInput } from "@/modules/refrigeration/schema";
import {
  AirQualityReadingInput,
  EMPTY_THRESHOLDS,
  ThresholdSet,
  computeTier,
} from "@/modules/air-quality/schema";

/**
 * /api/sync — the only non-tRPC endpoint allowed for app data.
 * It exists because the offline sync engine batches Dexie writes
 * and replays them in a single round-trip; doing that through tRPC
 * would mean one HTTP request per pending write. See CLAUDE.md Rule 7.
 *
 * Per-table dispatch lives here. Every handler:
 *   - validates `payload` with the module's Zod schema
 *   - sets facility_id from the resolved profile (Rule 1)
 *   - sets submitted_by from auth.uid() (Rule 1)
 *   - relies on the unique (facility_id, local_id) index for
 *     idempotent replay (a duplicate-key error is treated as success)
 */

const QueuedRecord = z.object({
  localId: z.string().min(1),
  table: z.string().min(1),
  payload: z.unknown(),
  retryCount: z.number().int().min(0),
});

const SyncBody = z.object({
  writes: z.array(QueuedRecord),
});

interface SyncResultRow {
  localId: string;
  serverId?: string | null;
  error?: string | null;
}

export async function POST(req: Request) {
  const json: unknown = await req.json();
  const parsed = SyncBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid sync envelope" },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("facility_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.facility_id) {
    return NextResponse.json(
      { ok: false, error: "No facility for user" },
      { status: 403 },
    );
  }

  const facilityId = profile.facility_id;
  const results: SyncResultRow[] = [];

  for (const w of parsed.data.writes) {
    if (w.table === "daily_reports") {
      const payload = DailyReportSubmissionInput.safeParse(w.payload);
      if (!payload.success) {
        results.push({ localId: w.localId, error: "invalid payload" });
        continue;
      }

      const { data, error } = await supabase
        .from("daily_reports")
        .insert({
          facility_id: facilityId,
          checklist_id: payload.data.checklist_id,
          submitted_by: user.id,
          submitted_at: payload.data.submitted_at,
          answers: payload.data.answers,
          local_id: payload.data.local_id,
        })
        .select("id")
        .single();

      if (error) {
        // Idempotent replay: a second insert with the same
        // (facility_id, local_id) hits the unique index. Treat as
        // success and return the existing server id.
        const isDup = /duplicate key|unique/i.test(error.message);
        if (isDup) {
          const { data: existing } = await supabase
            .from("daily_reports")
            .select("id")
            .eq("facility_id", facilityId)
            .eq("local_id", payload.data.local_id)
            .maybeSingle();
          results.push({
            localId: w.localId,
            serverId: existing?.id ?? null,
          });
        } else {
          results.push({ localId: w.localId, error: error.message });
        }
      } else {
        results.push({ localId: w.localId, serverId: data.id });
      }
      continue;
    }

    if (w.table === "ice_operations") {
      const payload = IceOperationSubmissionInput.safeParse(w.payload);
      if (!payload.success) {
        results.push({ localId: w.localId, error: "invalid payload" });
        continue;
      }

      const { data, error } = await supabase
        .from("ice_operations")
        .insert({
          facility_id: facilityId,
          operation_type_id: payload.data.operation_type_id,
          equipment_id: payload.data.equipment_id,
          submitted_by: user.id,
          submitted_at: payload.data.submitted_at,
          answers: payload.data.answers,
          local_id: payload.data.local_id,
        })
        .select("id")
        .single();

      if (error) {
        const isDup = /duplicate key|unique/i.test(error.message);
        if (isDup) {
          const { data: existing } = await supabase
            .from("ice_operations")
            .select("id")
            .eq("facility_id", facilityId)
            .eq("local_id", payload.data.local_id)
            .maybeSingle();
          results.push({
            localId: w.localId,
            serverId: existing?.id ?? null,
          });
        } else {
          results.push({ localId: w.localId, error: error.message });
        }
      } else {
        results.push({ localId: w.localId, serverId: data.id });
      }
      continue;
    }

    if (w.table === "air_quality_readings") {
      const payload = AirQualityReadingInput.safeParse(w.payload);
      if (!payload.success) {
        results.push({ localId: w.localId, error: "invalid payload" });
        continue;
      }

      // Compute tier server-side from the facility's current
      // working thresholds. The tier is then frozen on the row so
      // historical reports do not shift if thresholds are later
      // retightened.
      const { data: thresholdsRow } = await supabase
        .from("facility_config")
        .select("value")
        .eq("facility_id", facilityId)
        .eq("module", "air-quality")
        .eq("key", "thresholds")
        .maybeSingle();

      const parsedThresholds = ThresholdSet.safeParse(thresholdsRow?.value);
      const thresholds = parsedThresholds.success
        ? parsedThresholds.data
        : EMPTY_THRESHOLDS;

      const tier = computeTier(
        { co_ppm: payload.data.co_ppm, no2_ppm: payload.data.no2_ppm },
        thresholds,
      );

      const { data, error } = await supabase
        .from("air_quality_readings")
        .insert({
          facility_id: facilityId,
          submitted_by: user.id,
          submitted_at: payload.data.submitted_at,
          co_ppm: payload.data.co_ppm,
          no2_ppm: payload.data.no2_ppm,
          notes: payload.data.notes ?? null,
          tier,
          local_id: payload.data.local_id,
        })
        .select("id")
        .single();

      if (error) {
        const isDup = /duplicate key|unique/i.test(error.message);
        if (isDup) {
          const { data: existing } = await supabase
            .from("air_quality_readings")
            .select("id")
            .eq("facility_id", facilityId)
            .eq("local_id", payload.data.local_id)
            .maybeSingle();
          results.push({
            localId: w.localId,
            serverId: existing?.id ?? null,
          });
        } else {
          results.push({ localId: w.localId, error: error.message });
        }
      } else {
        results.push({ localId: w.localId, serverId: data.id });
      }
      continue;
    }

    if (w.table === "refrigeration_readings") {
      const payload = RefrigerationReadingInput.safeParse(w.payload);
      if (!payload.success) {
        results.push({ localId: w.localId, error: "invalid payload" });
        continue;
      }

      const { data, error } = await supabase
        .from("refrigeration_readings")
        .insert({
          facility_id: facilityId,
          submitted_by: user.id,
          submitted_at: payload.data.submitted_at,
          brine_supply: payload.data.brine_supply,
          brine_return: payload.data.brine_return,
          brine_flow: payload.data.brine_flow,
          ice_surface_temp: payload.data.ice_surface_temp,
          condenser_temp: payload.data.condenser_temp,
          compressor_readings:
            payload.data.compressor_readings as unknown as Json,
          local_id: payload.data.local_id,
        })
        .select("id")
        .single();

      if (error) {
        const isDup = /duplicate key|unique/i.test(error.message);
        if (isDup) {
          const { data: existing } = await supabase
            .from("refrigeration_readings")
            .select("id")
            .eq("facility_id", facilityId)
            .eq("local_id", payload.data.local_id)
            .maybeSingle();
          results.push({
            localId: w.localId,
            serverId: existing?.id ?? null,
          });
        } else {
          results.push({ localId: w.localId, error: error.message });
        }
      } else {
        results.push({ localId: w.localId, serverId: data.id });
      }
      continue;
    }

    // Unknown table — surface a clear error so the queue keeps the row
    // around for inspection rather than silently dropping it.
    results.push({
      localId: w.localId,
      error: `unknown table: ${w.table}`,
    });
  }

  return NextResponse.json({ ok: true, results });
}
