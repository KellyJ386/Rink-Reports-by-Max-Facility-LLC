import "server-only";
import { IceDepthSessionInput } from "@/modules/ice-depth/schema";
import type { Json } from "@/lib/database.types";
import type { SyncHandler, SyncRecord, SyncContext, SyncResultRow } from "../types";

async function handle(record: SyncRecord, ctx: SyncContext): Promise<SyncResultRow> {
  const { facilityId, userId, supabase } = ctx;

  const payload = IceDepthSessionInput.safeParse(record.payload);
  if (!payload.success) {
    return { localId: record.localId, error: "invalid payload" };
  }

  // Upsert path: a draft can be re-saved many times before the
  // operator hits "Complete & Export". On the first save we
  // INSERT; on subsequent saves we UPDATE the existing row by
  // (facility_id, local_id). The DB freeze trigger refuses any
  // UPDATE on a row whose existing status is 'completed', so a
  // racing client cannot rewrite a finalized session.
  const { data: existing } = await supabase
    .from("ice_depth_sessions")
    .select("id, status")
    .eq("facility_id", facilityId)
    .eq("local_id", payload.data.local_id)
    .maybeSingle();

  if (existing) {
    if (existing.status === "completed") {
      // Treat as idempotent success — the client just needs the
      // server id back so it can clear the queue entry.
      return { localId: record.localId, serverId: existing.id };
    }

    const { error } = await supabase
      .from("ice_depth_sessions")
      .update({
        template_id: payload.data.template_id,
        submitted_at: payload.data.submitted_at,
        status: payload.data.status,
        resurfacing_status: payload.data.resurfacing_status,
        notes: payload.data.notes,
        measurements: payload.data.measurements as unknown as Json,
      })
      .eq("id", existing.id);
    if (error) {
      return { localId: record.localId, error: error.message };
    }
    return { localId: record.localId, serverId: existing.id };
  }

  const { data, error } = await supabase
    .from("ice_depth_sessions")
    .insert({
      facility_id: facilityId,
      template_id: payload.data.template_id,
      submitted_by: userId,
      submitted_at: payload.data.submitted_at,
      status: payload.data.status,
      resurfacing_status: payload.data.resurfacing_status,
      notes: payload.data.notes,
      measurements: payload.data.measurements as unknown as Json,
      local_id: payload.data.local_id,
    })
    .select("id")
    .single();

  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    if (isDup) {
      // Racing replay: another POST already inserted this local_id
      // between our maybeSingle() check above and the insert.
      // Look it up and treat as success.
      const { data: raced } = await supabase
        .from("ice_depth_sessions")
        .select("id")
        .eq("facility_id", facilityId)
        .eq("local_id", payload.data.local_id)
        .maybeSingle();
      return { localId: record.localId, serverId: raced?.id ?? null };
    }
    return { localId: record.localId, error: error.message };
  }

  return { localId: record.localId, serverId: data.id };
}

const iceDepthHandler: SyncHandler = {
  table: "ice_depth_sessions",
  handle,
};

export default iceDepthHandler;
