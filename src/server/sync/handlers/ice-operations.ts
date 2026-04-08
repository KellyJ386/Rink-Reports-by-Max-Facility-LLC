import "server-only";
import { IceOperationSubmissionInput } from "@/modules/ice-operations/schema";
import type { SyncHandler, SyncRecord, SyncContext, SyncResultRow } from "../types";

async function handle(record: SyncRecord, ctx: SyncContext): Promise<SyncResultRow> {
  const { facilityId, userId, supabase } = ctx;

  const payload = IceOperationSubmissionInput.safeParse(record.payload);
  if (!payload.success) {
    return { localId: record.localId, error: "invalid payload" };
  }

  const { data, error } = await supabase
    .from("ice_operations")
    .insert({
      facility_id: facilityId,
      operation_type_id: payload.data.operation_type_id,
      equipment_id: payload.data.equipment_id,
      submitted_by: userId,
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
      return { localId: record.localId, serverId: existing?.id ?? null };
    }
    return { localId: record.localId, error: error.message };
  }

  return { localId: record.localId, serverId: data.id };
}

const iceOperationsHandler: SyncHandler = {
  table: "ice_operations",
  handle,
};

export default iceOperationsHandler;
