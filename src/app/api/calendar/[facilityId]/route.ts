import { NextResponse } from "next/server";
import ical from "ical-generator";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ facilityId: string }> },
) {
  const { facilityId } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify the token matches the facility's calendar_feed_token and is enabled
  const { data: config, error: configError } = await supabase
    .from("facility_config")
    .select("calendar_feed_token, calendar_feed_enabled")
    .eq("facility_id", facilityId)
    .maybeSingle();

  if (configError || !config) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!config.calendar_feed_enabled || config.calendar_feed_token !== token) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Get facility name for the calendar
  const { data: facility, error: facilityError } = await supabase
    .from("facilities")
    .select("name")
    .eq("id", facilityId)
    .maybeSingle();

  if (facilityError || !facility) {
    return new NextResponse("Not found", { status: 404 });
  }

  const facilityName = facility.name ?? "RinkReports";

  // Fetch shifts for next 90 days
  const now = new Date();
  const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const { data: shifts, error: shiftsError } = await supabase
    .from("scheduling_shifts")
    .select(
      `
      id,
      start_at,
      end_at,
      user_id,
      position_id,
      notes,
      schedule_id,
      schedule:schedule_id (facility_id),
      staff:user_id (full_name),
      position:position_id (name)
    `,
    )
    .eq("schedule:facility_id", facilityId)
    .gte("start_at", now.toISOString())
    .lte("start_at", in90.toISOString())
    .order("start_at", { ascending: true });

  if (shiftsError) {
    return new NextResponse("Internal error", { status: 500 });
  }

  const cal = ical({
    name: `${facilityName} Schedule`,
    prodId: "//RinkReports//Schedule//EN",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const shift of shifts ?? []) {
    const shiftData = shift as any;
    const staffName = shiftData.staff?.full_name ?? "Unassigned";
    const positionName = shiftData.position?.name ?? "";

    cal.createEvent({
      id: `${shiftData.id}@rinkreports.com`,
      summary: positionName ? `${staffName} — ${positionName}` : staffName,
      start: new Date(shiftData.start_at),
      end: new Date(shiftData.end_at),
      location: facilityName,
      description: shiftData.notes ?? undefined,
    });
  }

  return new NextResponse(cal.toString(), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="schedule.ics"',
      "Cache-Control": "no-cache",
    },
  });
}
