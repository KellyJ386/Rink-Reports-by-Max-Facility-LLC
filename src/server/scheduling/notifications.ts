import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Supabase = SupabaseClient<Database>;

interface CreateScheduleNotificationOpts {
  employeeId: string;
  facilityId: string;
  eventType: string;
  message: string;
  payload?: Record<string, unknown>;
}

/**
 * Insert a row into scheduling_notifications. Fire-and-forget: errors
 * are caught and logged to console so the calling procedure never fails
 * on a notification write failure.
 */
export async function createScheduleNotification(
  supabase: Supabase,
  opts: CreateScheduleNotificationOpts,
): Promise<void> {
  try {
    await (supabase.from("scheduling_notifications" as never) as unknown as {
      insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
    }).insert({
      employee_id: opts.employeeId,
      facility_id: opts.facilityId,
      event_type: opts.eventType,
      message: opts.message,
      payload: opts.payload ?? {},
      is_read: false,
    });
  } catch (err) {
    // Fire-and-forget: log but don't throw
    console.error("[scheduling/notifications] Failed to create notification:", err);
  }
}
