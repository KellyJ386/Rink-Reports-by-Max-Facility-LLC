import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export interface IngestLogRow {
  deviceId: string;
  facilityId: string;
  endpoint: string;
  payloadHash: string;
  status: "accepted" | "rejected" | "duplicate";
  rejectionReason?: string;
}

/**
 * Appends a row to ingest_log (audit trail for all ingest attempts).
 * Uses the service-role client — authenticated users cannot insert.
 * Errors are swallowed so a log failure never blocks a successful ingest.
 */
export async function writeIngestLog(
  supabase: SupabaseClient<Database>,
  row: IngestLogRow,
): Promise<void> {
  await supabase.from("ingest_log").insert({
    device_id: row.deviceId,
    facility_id: row.facilityId,
    endpoint: row.endpoint,
    payload_hash: row.payloadHash,
    status: row.status,
    rejection_reason: row.rejectionReason ?? null,
  });
}

/**
 * Returns true if a log entry with the same (deviceId, payloadHash)
 * already exists within the dedup window. Used to reject replay
 * attacks where the same exact payload is re-sent.
 */
export async function findRecentIngestLog(
  supabase: SupabaseClient<Database>,
  deviceId: string,
  payloadHash: string,
  withinSeconds = 60,
): Promise<boolean> {
  const cutoff = new Date(
    Date.now() - withinSeconds * 1000,
  ).toISOString();
  const { data } = await supabase
    .from("ingest_log")
    .select("id")
    .eq("device_id", deviceId)
    .eq("payload_hash", payloadHash)
    .gte("created_at", cutoff)
    .maybeSingle();
  return !!data;
}
