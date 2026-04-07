import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { DetectionResult } from "@/server/anomaly/types";
import { detectRefrigerationDrift } from "@/server/anomaly/detectors/refrigerationDrift";
import { detectMissedReports } from "@/server/anomaly/detectors/missedDailyReports";
import { detectAirQualityEscalation } from "@/server/anomaly/detectors/airQualityEscalation";
import { detectIceDepthThinSpots } from "@/server/anomaly/detectors/iceDepthThinSpots";

/**
 * Run all detectors for a single facility.
 *
 * Uses Promise.allSettled so one failing detector does not prevent
 * the others from running. Rejected detectors are captured to Sentry
 * and excluded from the results; the scan continues.
 */
export async function runAllDetectors(
  facilityId: string,
  supabase: SupabaseClient<Database>,
): Promise<DetectionResult[]> {
  const settled = await Promise.allSettled([
    detectRefrigerationDrift(facilityId, supabase),
    detectMissedReports(facilityId, supabase),
    detectAirQualityEscalation(facilityId, supabase),
    detectIceDepthThinSpots(facilityId, supabase),
  ]);

  const results: DetectionResult[] = [];

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value);
    } else {
      Sentry.captureException(outcome.reason, {
        tags: { facilityId, context: "anomaly-detector" },
      });
    }
  }

  return results;
}
