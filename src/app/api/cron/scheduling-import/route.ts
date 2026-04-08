import "server-only";

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase-server";
import { parseIcsToShifts } from "@/server/scheduling/importers/icsParser";
import {
  matchStaff,
  type StaffMember,
} from "@/server/scheduling/importers/matchStaff";
import type { ParsedShift } from "@/server/scheduling/importers/types";

/**
 * GET /api/cron/scheduling-import
 *
 * Vercel cron endpoint (see vercel.json). Runs nightly at 3am UTC.
 * Vercel sends `Authorization: Bearer {CRON_SECRET}` automatically.
 *
 * For each facility with a scheduling_feed_url:
 *   1. Fetches the ICS URL.
 *   2. Parses it via parseIcsToShifts.
 *   3. Runs staff matching against the facility roster.
 *   4. Auto-commits shifts where confidence >= 0.9 AND no overlap.
 *   5. For conflicting shifts: inserts a deduped alert row.
 *   6. Updates scheduling_feed_last_imported_at.
 *
 * facility_id always comes from the database, never from request input
 * (CLAUDE.md Rule 1).
 */
export async function GET(req: Request) {
  // 1. Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("Authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceRoleClient();

  // 2. Fetch facilities with a scheduling_feed_url set
  const { data: configs, error: configsErr } = await supabase
    .from("facility_config")
    .select("facility_id, scheduling_feed_url")
    .not("scheduling_feed_url", "is", null);

  if (configsErr) {
    Sentry.captureException(configsErr, {
      tags: { context: "scheduling-import-cron-fetch-facilities" },
    });
    return NextResponse.json(
      { ok: false, error: "Failed to fetch facility configs" },
      { status: 500 },
    );
  }

  if (!configs || configs.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, imported: 0, conflicts: 0 });
  }

  // Deduplicate by facility_id — pick first row per facility
  const facilityMap = new Map<string, string>();
  for (const cfg of configs) {
    if (cfg.scheduling_feed_url && !facilityMap.has(cfg.facility_id)) {
      facilityMap.set(cfg.facility_id, cfg.scheduling_feed_url);
    }
  }

  let totalImported = 0;
  let totalConflicts = 0;

  const results = await Promise.allSettled(
    Array.from(facilityMap.entries()).map(async ([facilityId, feedUrl]) => {
      // 3. Fetch the ICS feed
      let icsText: string;
      try {
        const res = await fetch(feedUrl, {
          headers: { Accept: "text/calendar, text/plain, */*" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          throw new Error(`Feed responded with HTTP ${res.status}`);
        }
        icsText = await res.text();
      } catch (err) {
        Sentry.captureException(err, {
          tags: { context: "scheduling-import-cron-fetch-feed", facilityId },
        });
        return { imported: 0, conflicts: 0 };
      }

      // 4. Parse shifts
      const shifts = parseIcsToShifts(icsText);
      if (shifts.length === 0) {
        return { imported: 0, conflicts: 0 };
      }

      // 5. Fetch roster for staff matching
      const { data: rosterData } = await supabase
        .from("user_profiles")
        .select("user_id, full_name, email")
        .eq("facility_id", facilityId)
        .neq("role", "viewer");

      const roster: StaffMember[] = (rosterData ?? []).map((r) => ({
        id: r.user_id,
        name: r.full_name ?? "",
        email: r.email ?? null,
      }));

      // 6. Fetch existing schedule IDs for this facility
      const { data: scheduleRows } = await supabase
        .from("scheduling_schedules")
        .select("id")
        .eq("facility_id", facilityId);

      const scheduleIds = (scheduleRows ?? []).map((s) => s.id);

      // 7. Fetch first position for the facility (required by scheduling_shifts)
      const { data: firstPositionRow } = await supabase
        .from("scheduling_positions")
        .select("id")
        .eq("facility_id", facilityId)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();

      // If no schedule or no position, we can't import — record 0
      if (scheduleIds.length === 0 || !firstPositionRow) {
        return { imported: 0, conflicts: 0 };
      }

      const defaultScheduleId = scheduleIds[0]!;
      const defaultPositionId = firstPositionRow.id;

      let facilityImported = 0;
      let facilityConflicts = 0;

      await Promise.allSettled(
        shifts.map(async (shift: ParsedShift) => {
          // Match staff
          const identifier =
            shift.attendees.length > 0 ? shift.attendees[0]! : shift.title;
          const staffMatch = matchStaff(identifier, roster);

          if (!staffMatch.matched || staffMatch.confidence < 0.9) {
            // Low-confidence match — skip silently
            return;
          }

          // Check for overlapping shifts in this facility's schedules
          const { data: overlapping } = await supabase
            .from("scheduling_shifts")
            .select("id, start_at, end_at")
            .in("schedule_id", scheduleIds)
            .lt("start_at", shift.endAt.toISOString())
            .gt("end_at", shift.startAt.toISOString())
            .limit(1);

          if (overlapping && overlapping.length > 0) {
            // Conflict — insert a deduped alert
            const existingAlert = await supabase
              .from("alerts")
              .select("id")
              .eq("facility_id", facilityId)
              .eq("alert_type", "scheduling_import_conflict")
              .eq("target_identifier", shift.externalId)
              .is("resolved_at", null)
              .maybeSingle();

            if (!existingAlert.data) {
              await supabase.from("alerts").insert({
                facility_id: facilityId,
                alert_type: "scheduling_import_conflict",
                severity: "warning",
                target_identifier: shift.externalId,
                title: "Scheduling conflict in imported feed",
                description: `Shift "${shift.title}" (${shift.startAt.toISOString()} – ${shift.endAt.toISOString()}) conflicts with an existing shift.`,
                metadata: {
                  source: "scheduling_feed",
                  externalId: shift.externalId,
                  feedUrl,
                } as Record<string, unknown>,
              });
            }
            facilityConflicts++;
            return;
          }

          // No conflict — auto-commit
          const { error: insertErr } = await supabase
            .from("scheduling_shifts")
            .insert({
              schedule_id: defaultScheduleId,
              user_id: staffMatch.matched.id,
              position_id: defaultPositionId,
              start_at: shift.startAt.toISOString(),
              end_at: shift.endAt.toISOString(),
              notes: shift.location ?? null,
            });

          if (!insertErr) {
            facilityImported++;
          } else {
            Sentry.captureException(insertErr, {
              tags: {
                context: "scheduling-import-cron-insert-shift",
                facilityId,
              },
            });
          }
        }),
      );

      // 8. Update last imported timestamp
      await supabase
        .from("facility_config")
        .update({ scheduling_feed_last_imported_at: new Date().toISOString() })
        .eq("facility_id", facilityId)
        .not("scheduling_feed_url", "is", null);

      return { imported: facilityImported, conflicts: facilityConflicts };
    }),
  );

  for (const outcome of results) {
    if (outcome.status === "fulfilled") {
      totalImported += outcome.value.imported;
      totalConflicts += outcome.value.conflicts;
    } else {
      Sentry.captureException(outcome.reason, {
        tags: { context: "scheduling-import-cron-per-facility" },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: facilityMap.size,
    imported: totalImported,
    conflicts: totalConflicts,
  });
}
