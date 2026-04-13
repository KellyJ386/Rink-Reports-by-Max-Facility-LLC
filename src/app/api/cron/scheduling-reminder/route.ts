import "server-only";

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/cron/scheduling-reminder
 *
 * Daily cron (8 AM UTC). Finds all scheduling shifts starting in the
 * next 24 hours where the employee has not yet confirmed, and creates
 * a scheduling_notifications reminder row for each.
 *
 * Security: requires CRON_SECRET Bearer token.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find shifts in the next 24 hours that are unconfirmed and assigned
    const { data: shifts, error: shiftsErr } = await supabase
      .from("scheduling_shifts")
      .select(
        "id, user_id, start_at, end_at, position_id, schedule_id, status",
      )
      .not("user_id", "is", null)
      .eq("status", "unconfirmed")
      .gte("start_at", now.toISOString())
      .lte("start_at", in24h.toISOString());

    if (shiftsErr) {
      Sentry.captureException(new Error(shiftsErr.message), {
        tags: { context: "scheduling-reminder-shifts" },
      });
      return NextResponse.json(
        { error: shiftsErr.message },
        { status: 500 },
      );
    }

    if (!shifts || shifts.length === 0) {
      return NextResponse.json({ ok: true, reminders: 0 });
    }

    // Get the facility_id for each shift through its schedule
    const scheduleIds = [...new Set(shifts.map((s) => s.schedule_id))];
    const { data: schedules } = await supabase
      .from("scheduling_schedules")
      .select("id, facility_id")
      .in("id", scheduleIds);

    const scheduleToFacility = new Map<string, string>();
    for (const s of schedules ?? []) {
      scheduleToFacility.set(s.id, s.facility_id);
    }

    // Look up scheduling_employees for each user_id to get employee_id
    const userIds = [...new Set(shifts.map((s) => s.user_id).filter(Boolean))] as string[];
    const { data: employees } = await supabase
      .from("scheduling_employees")
      .select("id, user_id, facility_id")
      .in("user_id", userIds);

    const userToEmployee = new Map<string, { id: string; facility_id: string }>();
    for (const e of employees ?? []) {
      userToEmployee.set(e.user_id, { id: e.id, facility_id: e.facility_id });
    }

    let reminders = 0;

    for (const shift of shifts) {
      if (!shift.user_id) continue;

      const employee = userToEmployee.get(shift.user_id);
      const facilityId = scheduleToFacility.get(shift.schedule_id);

      if (!employee || !facilityId) continue;

      const startTime = new Date(shift.start_at).toLocaleTimeString(
        undefined,
        { hour: "2-digit", minute: "2-digit" },
      );
      const startDate = new Date(shift.start_at).toLocaleDateString(
        undefined,
        { weekday: "short", month: "short", day: "numeric" },
      );

      const { error: insertErr } = await supabase
        .from("scheduling_notifications")
        .insert({
          employee_id: employee.id,
          facility_id: facilityId,
          event_type: "shift_reminder",
          message: `Reminder: You have a shift starting at ${startTime} on ${startDate}. Please confirm.`,
          payload: { shift_id: shift.id },
        });

      if (insertErr) {
        Sentry.captureException(new Error(insertErr.message), {
          tags: { context: "scheduling-reminder-insert" },
        });
      } else {
        reminders++;
      }
    }

    return NextResponse.json({ ok: true, reminders });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { context: "scheduling-reminder-unexpected" },
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
