import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { DetectionResult } from "@/server/anomaly/types";

/**
 * Refrigeration Drift Detector
 *
 * Compares the last 7 days of refrigeration readings against a 90-day
 * rolling baseline per compressor per pressure field. Flags when the
 * recent average is > 15% above baseline (warning) or > 25% (critical).
 *
 * alertType: "refrigeration_drift"
 * targetIdentifier: "compressor-{compressor_id}"
 */

const PRESSURE_FIELDS = [
  "suction_pressure",
  "discharge_pressure",
  "oil_pressure",
] as const;

type PressureField = (typeof PRESSURE_FIELDS)[number];

interface CompressorReading {
  compressor_id?: string;
  suction_pressure?: number | null;
  discharge_pressure?: number | null;
  oil_pressure?: number | null;
  amps?: number | null;
  oil_temperature?: number | null;
}

function isCompressorReading(v: unknown): v is CompressorReading {
  return typeof v === "object" && v !== null && "compressor_id" in v;
}

function parseCompressorReadings(raw: unknown): CompressorReading[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isCompressorReading);
}

export async function detectRefrigerationDrift(
  facilityId: string,
  supabase: SupabaseClient<Database>,
): Promise<DetectionResult[]> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Fetch last 7 days of readings (recent window)
  const { data: recentRows, error: recentErr } = await supabase
    .from("refrigeration_readings")
    .select("submitted_at, compressor_readings")
    .eq("facility_id", facilityId)
    .gte("submitted_at", sevenDaysAgo.toISOString())
    .order("submitted_at", { ascending: false });

  if (recentErr || !recentRows || recentRows.length < 3) {
    // Need at least 3 readings to flag "last 3 averaging above baseline"
    return [];
  }

  // Fetch last 90 days of readings (baseline window)
  const { data: baselineRows, error: baselineErr } = await supabase
    .from("refrigeration_readings")
    .select("submitted_at, compressor_readings")
    .eq("facility_id", facilityId)
    .gte("submitted_at", ninetyDaysAgo.toISOString())
    .lte("submitted_at", sevenDaysAgo.toISOString())
    .order("submitted_at", { ascending: false });

  if (baselineErr || !baselineRows || baselineRows.length === 0) {
    // No baseline data — can't detect drift
    return [];
  }

  // Build baseline: per-compressor per-field averages over 90 days
  type CompressorBaseline = Record<PressureField, { sum: number; count: number }>;
  const baseline = new Map<string, CompressorBaseline>();

  for (const row of baselineRows) {
    const readings = parseCompressorReadings(row.compressor_readings);
    for (const r of readings) {
      if (!r.compressor_id) continue;
      if (!baseline.has(r.compressor_id)) {
        baseline.set(r.compressor_id, {
          suction_pressure: { sum: 0, count: 0 },
          discharge_pressure: { sum: 0, count: 0 },
          oil_pressure: { sum: 0, count: 0 },
        });
      }
      const b = baseline.get(r.compressor_id)!;
      for (const field of PRESSURE_FIELDS) {
        const val = r[field];
        if (typeof val === "number" && isFinite(val)) {
          b[field].sum += val;
          b[field].count += 1;
        }
      }
    }
  }

  // Build recent: per-compressor per-field averages over last 3 readings
  // Use up to the 3 most recent rows (already ordered desc)
  const last3 = recentRows.slice(0, 3);
  type CompressorRecent = Record<PressureField, { sum: number; count: number }>;
  const recent = new Map<string, CompressorRecent>();

  for (const row of last3) {
    const readings = parseCompressorReadings(row.compressor_readings);
    for (const r of readings) {
      if (!r.compressor_id) continue;
      if (!recent.has(r.compressor_id)) {
        recent.set(r.compressor_id, {
          suction_pressure: { sum: 0, count: 0 },
          discharge_pressure: { sum: 0, count: 0 },
          oil_pressure: { sum: 0, count: 0 },
        });
      }
      const rec = recent.get(r.compressor_id)!;
      for (const field of PRESSURE_FIELDS) {
        const val = r[field];
        if (typeof val === "number" && isFinite(val)) {
          rec[field].sum += val;
          rec[field].count += 1;
        }
      }
    }
  }

  const results: DetectionResult[] = [];

  for (const [compressorId, recentData] of recent.entries()) {
    const baselineData = baseline.get(compressorId);
    if (!baselineData) continue;

    for (const field of PRESSURE_FIELDS) {
      const rec = recentData[field];
      const base = baselineData[field];

      if (rec.count === 0 || base.count === 0) continue;

      const recentAvg = rec.sum / rec.count;
      const baselineAvg = base.sum / base.count;

      if (baselineAvg === 0) continue;

      const driftRatio = (recentAvg - baselineAvg) / baselineAvg;

      if (driftRatio > 0.25) {
        results.push({
          facilityId,
          alertType: "refrigeration_drift",
          severity: "critical",
          targetIdentifier: `compressor-${compressorId}`,
          title: `Critical refrigeration drift: ${field.replace(/_/g, " ")}`,
          description: `Compressor ${compressorId} ${field.replace(/_/g, " ")} is averaging ${Math.round(driftRatio * 100)}% above the 90-day baseline (recent avg: ${recentAvg.toFixed(1)}, baseline avg: ${baselineAvg.toFixed(1)}).`,
          metadata: {
            compressorId,
            field,
            recentAvg,
            baselineAvg,
            driftPercent: Math.round(driftRatio * 100),
          },
        });
      } else if (driftRatio > 0.15) {
        results.push({
          facilityId,
          alertType: "refrigeration_drift",
          severity: "warning",
          targetIdentifier: `compressor-${compressorId}`,
          title: `Refrigeration drift detected: ${field.replace(/_/g, " ")}`,
          description: `Compressor ${compressorId} ${field.replace(/_/g, " ")} is averaging ${Math.round(driftRatio * 100)}% above the 90-day baseline (recent avg: ${recentAvg.toFixed(1)}, baseline avg: ${baselineAvg.toFixed(1)}).`,
          metadata: {
            compressorId,
            field,
            recentAvg,
            baselineAvg,
            driftPercent: Math.round(driftRatio * 100),
          },
        });
      }
    }
  }

  return results;
}
