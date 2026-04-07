import "server-only";
import { RefrigerationReadingInput } from "@/modules/refrigeration/schema";
import type { Json } from "@/lib/database.types";
import type { SyncHandler, SyncRecord, SyncContext, SyncResultRow } from "../types";

async function handle(record: SyncRecord, ctx: SyncContext): Promise<SyncResultRow> {
  const { facilityId, userId, supabase } = ctx;

  const payload = RefrigerationReadingInput.safeParse(record.payload);
  if (!payload.success) {
    return { localId: record.localId, error: "invalid payload" };
  }

  const { data, error } = await supabase
    .from("refrigeration_readings")
    .insert({
      facility_id: facilityId,
      submitted_by: userId,
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
      return { localId: record.localId, serverId: existing?.id ?? null };
    }
    return { localId: record.localId, error: error.message };
  }

  return { localId: record.localId, serverId: data.id };
}

const refrigerationHandler: SyncHandler = {
  table: "refrigeration_readings",
  handle,
};

export default refrigerationHandler;
