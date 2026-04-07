import { z } from "zod";

/**
 * Air Quality module schemas, types, tier definitions, and the
 * tier-from-reading helper that runs both client-side (live preview
 * on the form) and server-side (the canonical tier stored on the
 * row at insert time).
 *
 * The pollutant catalog is fixed (CO and NO₂). What varies per
 * facility — and lives in `facility_config` per CLAUDE.md Rule 2 —
 * is the regulatory limits, the working thresholds, and the per-tier
 * action protocol text.
 */

// =====================================================================
// Tier definitions (fixed)
// =====================================================================

export const TIERS = ["normal", "caution", "action", "evacuate"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_RANK: Record<Tier, number> = {
  normal: 0,
  caution: 1,
  action: 2,
  evacuate: 3,
};

export const TIER_LABELS: Record<Tier, string> = {
  normal: "Normal",
  caution: "Caution",
  action: "Action required",
  evacuate: "Evacuate",
};

export const TierSchema = z.enum(TIERS);

// =====================================================================
// Pollutants (fixed catalog)
// =====================================================================

export const POLLUTANTS = ["co", "no2"] as const;
export type Pollutant = (typeof POLLUTANTS)[number];

export const POLLUTANT_LABELS: Record<Pollutant, string> = {
  co: "Carbon monoxide (CO)",
  no2: "Nitrogen dioxide (NO₂)",
};

export const POLLUTANT_UNITS: Record<Pollutant, string> = {
  co: "ppm",
  no2: "ppm",
};

// =====================================================================
// Threshold map (stored in facility_config)
// =====================================================================

/**
 * One row per pollutant × tier-with-action. The `normal` tier needs
 * no threshold — it's "below the caution threshold". So three numbers
 * per pollutant: caution / action / evacuate.
 */
export const ThresholdSet = z.object({
  co_caution: z.number().nonnegative().nullable(),
  co_action: z.number().nonnegative().nullable(),
  co_evacuate: z.number().nonnegative().nullable(),
  no2_caution: z.number().nonnegative().nullable(),
  no2_action: z.number().nonnegative().nullable(),
  no2_evacuate: z.number().nonnegative().nullable(),
});
export type ThresholdSet = z.infer<typeof ThresholdSet>;

export const EMPTY_THRESHOLDS: ThresholdSet = {
  co_caution: null,
  co_action: null,
  co_evacuate: null,
  no2_caution: null,
  no2_action: null,
  no2_evacuate: null,
};

export const ActionProtocol = z.object({
  caution: z.string().max(500),
  action: z.string().max(500),
  evacuate: z.string().max(500),
});
export type ActionProtocol = z.infer<typeof ActionProtocol>;

export const EMPTY_ACTIONS: ActionProtocol = {
  caution: "",
  action: "",
  evacuate: "",
};

// =====================================================================
// Threshold validation: working ≤ regulatory limit per cell
// =====================================================================

export interface ThresholdValidationIssue {
  cell: keyof ThresholdSet;
  message: string;
}

/**
 * Returns issues if any working threshold exceeds the corresponding
 * regulatory limit (i.e. is "looser" than the legal floor). An empty
 * array means the working set is compliant.
 *
 * Skips comparisons where either side is null.
 */
export function validateAgainstLimits(
  working: ThresholdSet,
  limits: ThresholdSet,
): ThresholdValidationIssue[] {
  const issues: ThresholdValidationIssue[] = [];
  const cells = Object.keys(working) as (keyof ThresholdSet)[];
  for (const cell of cells) {
    const w = working[cell];
    const l = limits[cell];
    if (w === null || l === null) continue;
    if (w > l) {
      issues.push({
        cell,
        message: `Working ${cell} (${w}) exceeds regulatory limit (${l})`,
      });
    }
  }

  // Sanity: caution ≤ action ≤ evacuate within each pollutant.
  // Tighter alerts must trigger sooner (at lower readings).
  function checkOrder(
    p: "co" | "no2",
  ): ThresholdValidationIssue | null {
    const c = working[`${p}_caution` as keyof ThresholdSet];
    const a = working[`${p}_action` as keyof ThresholdSet];
    const e = working[`${p}_evacuate` as keyof ThresholdSet];
    if (c !== null && a !== null && c > a) {
      return {
        cell: `${p}_action` as keyof ThresholdSet,
        message: `${p.toUpperCase()}: caution must be ≤ action`,
      };
    }
    if (a !== null && e !== null && a > e) {
      return {
        cell: `${p}_evacuate` as keyof ThresholdSet,
        message: `${p.toUpperCase()}: action must be ≤ evacuate`,
      };
    }
    return null;
  }
  const co = checkOrder("co");
  if (co) issues.push(co);
  const no2 = checkOrder("no2");
  if (no2) issues.push(no2);

  return issues;
}

// =====================================================================
// Tier computation (used both client-side and server-side)
// =====================================================================

function tierForPollutant(
  value: number,
  caution: number | null,
  action: number | null,
  evacuate: number | null,
): Tier {
  if (evacuate !== null && value >= evacuate) return "evacuate";
  if (action !== null && value >= action) return "action";
  if (caution !== null && value >= caution) return "caution";
  return "normal";
}

/**
 * The overall tier is the worst of the per-pollutant tiers.
 */
export function computeTier(
  reading: { co_ppm: number; no2_ppm: number },
  thresholds: ThresholdSet,
): Tier {
  const co = tierForPollutant(
    reading.co_ppm,
    thresholds.co_caution,
    thresholds.co_action,
    thresholds.co_evacuate,
  );
  const no2 = tierForPollutant(
    reading.no2_ppm,
    thresholds.no2_caution,
    thresholds.no2_action,
    thresholds.no2_evacuate,
  );
  return TIER_RANK[co] >= TIER_RANK[no2] ? co : no2;
}

// =====================================================================
// Submission schema (form → Dexie queue → /api/sync → DB)
// =====================================================================

export const AirQualityReadingInput = z.object({
  local_id: z.string().uuid(),
  submitted_at: z.string().datetime(),
  co_ppm: z.number().nonnegative(),
  no2_ppm: z.number().nonnegative(),
  notes: z.string().max(1000).optional(),
});
export type AirQualityReadingInput = z.infer<typeof AirQualityReadingInput>;
