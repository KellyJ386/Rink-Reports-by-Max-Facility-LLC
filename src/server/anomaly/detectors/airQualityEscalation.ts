import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { DetectionResult } from "@/server/anomaly/types";

/**
 * Air Quality Escalation Detector
 *
 * Fetches the last 24 hours of air_quality_readings. Flags readings
 * whose tier is "action" (tier 3) or "evacuate" (tier 4):
 *   - tier "action"   → warning
 *   - tier "evacuate" → critical
 *
 * Tier mapping (from 008_air_quality.sql):
 *   normal   → tier 1
 *   caution  → tier 2
 *   action   → tier 3
 *   evacuate → tier 4
 *
 * alertType: "air_quality_escalation"
 * targetIdentifier: reading submitted_at ISO timestamp
 */

const TIER_SEVERITY = {
  action: "warning",
  evacuate: "critical",
} as const;

function isEscalatedTier(tier: string): tier is "action" | "evacuate" {
  return tier === "action" || tier === "evacuate";
}

export async function detectAirQualityEscalation(
  facilityId: string,
  supabase: SupabaseClient<Database>,
): Promise<DetectionResult[]> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const { data: readings, error } = await supabase
    .from("air_quality_readings")
    .select("id, submitted_at, co_ppm, no2_ppm, tier, notes")
    .eq("facility_id", facilityId)
    .gte("submitted_at", twentyFourHoursAgo.toISOString())
    .order("submitted_at", { ascending: false });

  if (error || !readings || readings.length === 0) {
    return [];
  }

  const results: DetectionResult[] = [];

  for (const reading of readings) {
    if (!isEscalatedTier(reading.tier)) continue;

    const severity = TIER_SEVERITY[reading.tier];
    const tierLabel = reading.tier === "evacuate" ? "Evacuate" : "Action Required";

    results.push({
      facilityId,
      alertType: "air_quality_escalation",
      severity,
      targetIdentifier: reading.submitted_at,
      title: `Air quality escalation — ${tierLabel} tier at ${new Date(reading.submitted_at).toLocaleTimeString()}`,
      description: `A reading at ${reading.submitted_at} triggered the "${reading.tier}" tier. CO: ${reading.co_ppm} ppm, NO₂: ${reading.no2_ppm} ppm.${reading.notes ? ` Notes: ${reading.notes}` : ""}`,
      metadata: {
        readingId: reading.id,
        submittedAt: reading.submitted_at,
        coPpm: reading.co_ppm,
        no2Ppm: reading.no2_ppm,
        tier: reading.tier,
      },
    });
  }

  return results;
}
