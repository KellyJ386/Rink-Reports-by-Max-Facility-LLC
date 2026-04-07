import "server-only";
import { DailyReportSubmissionInput } from "@/modules/daily-reports/schema";
import type { SyncHandler, SyncRecord, SyncContext, SyncResultRow } from "../types";

async function handle(record: SyncRecord, ctx: SyncContext): Promise<SyncResultRow> {
  const { facilityId, userId, supabase } = ctx;

  const payload = DailyReportSubmissionInput.safeParse(record.payload);
  if (!payload.success) {
    return { localId: record.localId, error: "invalid payload" };
  }

  const { data, error } = await supabase
    .from("daily_reports")
    .insert({
      facility_id: facilityId,
      checklist_id: payload.data.checklist_id,
      submitted_by: userId,
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
      return { localId: record.localId, serverId: existing?.id ?? null };
    }
    return { localId: record.localId, error: error.message };
  }

  return { localId: record.localId, serverId: data.id };
}

const dailyReportsHandler: SyncHandler = {
  table: "daily_reports",
  handle,
};

export default dailyReportsHandler;
