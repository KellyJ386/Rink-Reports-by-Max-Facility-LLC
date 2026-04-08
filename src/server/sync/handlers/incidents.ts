import "server-only";
import { IncidentSubmissionInput } from "@/modules/incidents/schema";
import type { Json } from "@/lib/database.types";
import type { SyncHandler, SyncRecord, SyncContext, SyncResultRow } from "../types";

async function handle(record: SyncRecord, ctx: SyncContext): Promise<SyncResultRow> {
  const { facilityId, userId, supabase } = ctx;

  const payload = IncidentSubmissionInput.safeParse(record.payload);
  if (!payload.success) {
    return { localId: record.localId, error: "invalid payload" };
  }

  const report = payload.data.report;

  const { data, error } = await supabase
    .from("incidents")
    .insert({
      facility_id: facilityId,
      submitted_by: userId,
      kind: report.kind,
      occurred_at: report.occurred_at,
      location: report.location,
      incident_type: report.incident_type,
      description: report.description,
      // Store the entire validated report shape as JSONB so the
      // read view can rehydrate every variable per-kind field.
      data: report as unknown as Json,
      local_id: payload.data.local_id,
    })
    .select("id")
    .single();

  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    if (isDup) {
      const { data: existing } = await supabase
        .from("incidents")
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

const incidentsHandler: SyncHandler = {
  table: "incidents",
  handle,
};

export default incidentsHandler;
