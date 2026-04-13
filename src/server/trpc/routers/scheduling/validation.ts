import "server-only";

import { TRPCError } from "@trpc/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ShiftWarning, ShiftWarningType } from "@/modules/scheduling/schema";

type Supabase = SupabaseClient<Database>;

/**
 * Check if a user already has an overlapping shift in the given time range.
 * Overlap condition: existing.start_at < endAt AND existing.end_at > startAt.
 *
 * @returns true if a conflicting shift exists.
 */
export async function checkDoubleBooking(
  supabase: Supabase,
  userId: string,
  startAt: string,
  endAt: string,
  excludeShiftId?: string,
): Promise<boolean> {
  let query = supabase
    .from("scheduling_shifts")
    .select("id")
    .eq("user_id", userId)
    .lt("start_at", endAt)
    .gt("end_at", startAt)
    .limit(1);

  if (excludeShiftId) {
    query = query.neq("id", excludeShiftId);
  }

  const { data } = await query;
  return (data ?? []).length > 0;
}

/**
 * Sum the hours an employee is scheduled for in a given week and compare
 * against their max_hours_week / min_hours_week limits from
 * scheduling_employees.
 *
 * @returns Array of ShiftWarning (may be empty).
 */
export async function checkHoursWarnings(
  supabase: Supabase,
  facilityId: string,
  userId: string,
  weekStart: string,
): Promise<ShiftWarning[]> {
  const warnings: ShiftWarning[] = [];

  // Compute week end (weekStart + 7 days)
  const weekStartDate = new Date(`${weekStart}T00:00:00Z`);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);
  const weekEnd = weekEndDate.toISOString();

  // Get all shifts for this user during the week, joining through schedules
  // to filter by facility_id.
  const { data: schedules } = await supabase
    .from("scheduling_schedules")
    .select("id")
    .eq("facility_id", facilityId)
    .gte("week_start", weekStart)
    .lt("week_start", weekEnd);

  const scheduleIds = (schedules ?? []).map((s) => s.id);
  if (scheduleIds.length === 0) return warnings;

  const { data: shifts } = await supabase
    .from("scheduling_shifts")
    .select("start_at, end_at")
    .eq("user_id", userId)
    .in("schedule_id", scheduleIds);

  let totalHours = 0;
  for (const shift of shifts ?? []) {
    const start = new Date(shift.start_at).getTime();
    const end = new Date(shift.end_at).getTime();
    totalHours += (end - start) / (1000 * 60 * 60);
  }

  // Look up employee record for hour limits
  const { data: employee } = await supabase
    .from("scheduling_employees" as never)
    .select("max_hours_week, min_hours_week" as never)
    .eq("facility_id" as never, facilityId as never)
    .eq("user_id" as never, userId as never)
    .maybeSingle();

  if (employee) {
    const emp = employee as unknown as {
      max_hours_week: number | null;
      min_hours_week: number | null;
    };
    if (emp.max_hours_week !== null && totalHours > emp.max_hours_week) {
      warnings.push({
        type: "overtime_risk" as ShiftWarningType,
        message: `Employee is scheduled for ${totalHours.toFixed(1)}h this week (max: ${emp.max_hours_week}h)`,
      });
    }
    if (emp.min_hours_week !== null && totalHours < emp.min_hours_week) {
      warnings.push({
        type: "below_min_hours" as ShiftWarningType,
        message: `Employee is only scheduled for ${totalHours.toFixed(1)}h this week (min: ${emp.min_hours_week}h)`,
      });
    }
  }

  return warnings;
}

/**
 * Check if a shift's time range conflicts with the employee's availability
 * blocks for the relevant day-of-week.
 *
 * @returns A ShiftWarning if an availability conflict exists, null otherwise.
 */
export async function checkAvailabilityConflict(
  supabase: Supabase,
  userId: string,
  facilityId: string,
  startAt: string,
  endAt: string,
  weekStart: string,
): Promise<ShiftWarning | null> {
  // Try per-week override first, then recurring fallback
  const { data: override } = await supabase
    .from("scheduling_availability")
    .select("blocks")
    .eq("user_id", userId)
    .eq("facility_id", facilityId)
    .eq("week_start", weekStart)
    .maybeSingle();

  let blocks: unknown = null;
  if (override) {
    blocks = override.blocks;
  } else {
    const { data: recurring } = await supabase
      .from("scheduling_availability")
      .select("blocks")
      .eq("user_id", userId)
      .eq("facility_id", facilityId)
      .eq("recurring", true)
      .maybeSingle();
    blocks = recurring?.blocks;
  }

  if (!blocks || !Array.isArray(blocks)) return null;

  // Determine day of week (0=Monday in the schema)
  const shiftStart = new Date(startAt);
  const jsDay = shiftStart.getUTCDay(); // 0=Sunday
  const dow = jsDay === 0 ? 6 : jsDay - 1; // Convert to 0=Monday

  // Get shift time in minutes since midnight
  const shiftStartMinute =
    shiftStart.getUTCHours() * 60 + shiftStart.getUTCMinutes();
  const shiftEnd = new Date(endAt);
  const shiftEndMinute =
    shiftEnd.getUTCHours() * 60 + shiftEnd.getUTCMinutes();

  // Check if any block for this dow marks the employee as unavailable
  // during the shift window
  for (const block of blocks) {
    if (
      typeof block !== "object" ||
      block === null ||
      !("dow" in block) ||
      !("status" in block) ||
      !("start_minute" in block) ||
      !("end_minute" in block)
    ) {
      continue;
    }
    const b = block as {
      dow: number;
      start_minute: number;
      end_minute: number;
      status: string;
    };
    if (b.dow !== dow) continue;
    if (b.status !== "unavailable") continue;

    // Check for overlap between unavailable block and shift
    if (b.start_minute < shiftEndMinute && b.end_minute > shiftStartMinute) {
      return {
        type: "availability_conflict" as ShiftWarningType,
        message: `Shift conflicts with employee's unavailable block on day ${dow}`,
      };
    }
  }

  return null;
}

/**
 * Check if the schedule is locked. Throws FORBIDDEN if locked.
 */
export async function checkScheduleLock(
  supabase: Supabase,
  scheduleId: string,
): Promise<void> {
  const { data: schedule } = await supabase
    .from("scheduling_schedules")
    .select("id, status")
    .eq("id", scheduleId)
    .maybeSingle();

  if (!schedule) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Schedule not found",
    });
  }

  // Check for is_locked via a separate query since the column may not be
  // in the generated types yet. We select the raw row and check.
  const { data: raw } = await supabase
    .from("scheduling_schedules")
    .select("*")
    .eq("id", scheduleId)
    .maybeSingle();

  const isLocked = (raw as unknown as Record<string, unknown> | null)
    ?.is_locked;
  if (isLocked === true) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Schedule is locked and cannot be modified",
    });
  }
}
