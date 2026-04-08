import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { DetectionResult } from "@/server/anomaly/types";

/**
 * Missed Daily Reports Detector
 *
 * Fetches the facility's configured checklists (tabs) from
 * daily_report_checklists. For each of the last 7 days, checks
 * whether a submission exists for each checklist. Missing days
 * trigger alerts:
 *   - 1 missed day  → info
 *   - 2 missed days → warning
 *   - 3+ missed days → critical
 *
 * alertType: "missed_daily_report"
 * targetIdentifier: "{YYYY-MM-DD}-{checklistId}"
 */

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export async function detectMissedReports(
  facilityId: string,
  supabase: SupabaseClient<Database>,
): Promise<DetectionResult[]> {
  // Fetch the facility's checklist tabs
  const { data: checklists, error: checklistErr } = await supabase
    .from("daily_report_checklists")
    .select("id, name")
    .eq("facility_id", facilityId)
    .order("position", { ascending: true });

  if (checklistErr || !checklists || checklists.length === 0) {
    return [];
  }

  // Build the last 7 completed days (not including today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(toDateString(d));
  }

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  // Fetch all submissions in the last 7 days
  const { data: submissions, error: submissionsErr } = await supabase
    .from("daily_reports")
    .select("checklist_id, submitted_at")
    .eq("facility_id", facilityId)
    .gte("submitted_at", sevenDaysAgo.toISOString())
    .lt("submitted_at", today.toISOString());

  if (submissionsErr) {
    return [];
  }

  // Build a set of "checklist_id|date" pairs that have submissions
  const submitted = new Set<string>();
  for (const s of submissions ?? []) {
    const date = s.submitted_at.split("T")[0]!;
    submitted.add(`${s.checklist_id}|${date}`);
  }

  // Per checklist: count consecutive missed days and emit alerts
  const results: DetectionResult[] = [];

  for (const checklist of checklists) {
    let missedCount = 0;
    const missedDays: string[] = [];

    for (const day of days) {
      const key = `${checklist.id}|${day}`;
      if (!submitted.has(key)) {
        missedCount++;
        missedDays.push(day);
      }
    }

    if (missedCount === 0) continue;

    const severity =
      missedCount >= 3 ? "critical" : missedCount === 2 ? "warning" : "info";

    // Emit one alert per missed day so dedup by targetIdentifier works
    for (const missedDay of missedDays) {
      results.push({
        facilityId,
        alertType: "missed_daily_report",
        severity,
        targetIdentifier: `${missedDay}-${checklist.id}`,
        title: `Missed daily report: ${checklist.name} on ${missedDay}`,
        description: `No submission found for the "${checklist.name}" checklist on ${missedDay}. This checklist has ${missedCount} missed day${missedCount === 1 ? "" : "s"} in the last 7 days.`,
        metadata: {
          checklistId: checklist.id,
          checklistName: checklist.name,
          missedDay,
          totalMissedInWindow: missedCount,
        },
      });
    }
  }

  return results;
}
