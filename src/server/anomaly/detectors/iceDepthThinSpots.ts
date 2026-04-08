import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { DetectionResult } from "@/server/anomaly/types";

/**
 * Ice Depth Thin Spots Detector
 *
 * Fetches the last 3 completed ice_depth_sessions and a 90-day
 * rolling baseline. Compares per-point average depth across the
 * 3 most recent sessions against the baseline. Flags points where
 * the current average is more than 20% below baseline:
 *   - 20–35% below → warning
 *   - > 35% below  → critical
 *
 * alertType: "ice_depth_thin_spot"
 * targetIdentifier: "point-{pointNumber}"
 */

function parseMeasurements(raw: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (typeof raw !== "object" || raw === null) return out;
  const obj = raw as Record<string, unknown>;
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "number" && isFinite(val)) {
      out.set(key, val);
    }
  }
  return out;
}

export async function detectIceDepthThinSpots(
  facilityId: string,
  supabase: SupabaseClient<Database>,
): Promise<DetectionResult[]> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Fetch last 3 completed sessions (most recent first)
  const { data: recentSessions, error: recentErr } = await supabase
    .from("ice_depth_sessions")
    .select("id, submitted_at, measurements, template_id")
    .eq("facility_id", facilityId)
    .eq("status", "completed")
    .order("submitted_at", { ascending: false })
    .limit(3);

  if (recentErr || !recentSessions || recentSessions.length === 0) {
    return [];
  }

  // Need at least 1 recent session to compare
  const oldestRecentDate = recentSessions[recentSessions.length - 1]!.submitted_at;

  // Fetch baseline sessions (completed, 90 days back, older than oldest recent)
  const { data: baselineSessions, error: baselineErr } = await supabase
    .from("ice_depth_sessions")
    .select("measurements, template_id")
    .eq("facility_id", facilityId)
    .eq("status", "completed")
    .gte("submitted_at", ninetyDaysAgo.toISOString())
    .lt("submitted_at", oldestRecentDate)
    .order("submitted_at", { ascending: false });

  if (baselineErr || !baselineSessions || baselineSessions.length === 0) {
    return [];
  }

  // Build baseline per-point averages
  const baselineTotals = new Map<string, { sum: number; count: number }>();

  for (const session of baselineSessions) {
    const measurements = parseMeasurements(session.measurements);
    for (const [pointKey, depth] of measurements.entries()) {
      if (!baselineTotals.has(pointKey)) {
        baselineTotals.set(pointKey, { sum: 0, count: 0 });
      }
      const entry = baselineTotals.get(pointKey)!;
      entry.sum += depth;
      entry.count += 1;
    }
  }

  // Build recent per-point averages across last 3 sessions
  const recentTotals = new Map<string, { sum: number; count: number }>();

  for (const session of recentSessions) {
    const measurements = parseMeasurements(session.measurements);
    for (const [pointKey, depth] of measurements.entries()) {
      if (!recentTotals.has(pointKey)) {
        recentTotals.set(pointKey, { sum: 0, count: 0 });
      }
      const entry = recentTotals.get(pointKey)!;
      entry.sum += depth;
      entry.count += 1;
    }
  }

  const results: DetectionResult[] = [];

  for (const [pointKey, recentData] of recentTotals.entries()) {
    const baselineData = baselineTotals.get(pointKey);
    if (!baselineData || baselineData.count === 0) continue;

    const recentAvg = recentData.sum / recentData.count;
    const baselineAvg = baselineData.sum / baselineData.count;

    if (baselineAvg === 0) continue;

    const thinRatio = (baselineAvg - recentAvg) / baselineAvg;

    if (thinRatio <= 0.2) continue;

    const severity = thinRatio > 0.35 ? "critical" : "warning";
    const pct = Math.round(thinRatio * 100);

    results.push({
      facilityId,
      alertType: "ice_depth_thin_spot",
      severity,
      targetIdentifier: `point-${pointKey}`,
      title: `${severity === "critical" ? "Critical" : "Warning"}: Thin ice at point ${pointKey}`,
      description: `Point ${pointKey} is averaging ${pct}% below the 90-day baseline (recent avg: ${recentAvg.toFixed(2)}, baseline avg: ${baselineAvg.toFixed(2)}).`,
      metadata: {
        pointKey,
        recentAvg,
        baselineAvg,
        thinPercent: pct,
        recentSessionCount: recentSessions.length,
      },
    });
  }

  return results;
}
