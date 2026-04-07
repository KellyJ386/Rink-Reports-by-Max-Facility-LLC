import "server-only";
import {
  AirQualityReadingInput,
  EMPTY_THRESHOLDS,
  ThresholdSet,
  computeTier,
} from "@/modules/air-quality/schema";
import type { SyncHandler, SyncRecord, SyncContext, SyncResultRow } from "../types";

async function handle(record: SyncRecord, ctx: SyncContext): Promise<SyncResultRow> {
  const { facilityId, userId, supabase } = ctx;

  const payload = AirQualityReadingInput.safeParse(record.payload);
  if (!payload.success) {
    return { localId: record.localId, error: "invalid payload" };
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
      submitted_by: userId,
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
      return { localId: record.localId, serverId: existing?.id ?? null };
    }
    return { localId: record.localId, error: error.message };
  }

  return { localId: record.localId, serverId: data.id };
}

const airQualityHandler: SyncHandler = {
  table: "air_quality_readings",
  handle,
};

export default airQualityHandler;
