import { z } from "zod";

/**
 * Refrigeration module schemas, types, and the canonical field
 * catalog. The field set is industry-standard at every ice rink, so
 * the catalog itself is fixed in TypeScript. What varies per facility
 * — and what therefore lives in `facility_config` per CLAUDE.md
 * Rule 2 — is:
 *
 *   * the COMPRESSOR COUNT and per-compressor names (separate table:
 *     refrigeration_compressors)
 *   * the NORMAL OPERATING RANGE (min, max) for each field
 *
 * The /api/sync handler validates submissions against
 * `RefrigerationReadingInput` before insert. Per-compressor readings
 * land as a JSONB array; facility-wide readings land as numeric
 * columns so they're easy to chart later.
 */

// =====================================================================
// Compressor (admin-configured list)
// =====================================================================

export const CompressorSchema = z.object({
  id: z.string().uuid(),
  facility_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  position: z.number().int().nonnegative(),
  active: z.boolean(),
});
export type Compressor = z.infer<typeof CompressorSchema>;

export const CreateCompressorInput = z.object({
  name: z.string().min(1).max(120),
});

export const UpdateCompressorInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  active: z.boolean().optional(),
});

export const DeleteCompressorInput = z.object({
  id: z.string().uuid(),
});

export const ReorderCompressorsInput = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

// =====================================================================
// Field catalog (fixed)
// =====================================================================

/**
 * Per-compressor field keys. Every compressor row in a reading
 * captures the same five measurements.
 */
export const COMPRESSOR_FIELD_KEYS = [
  "suction_pressure",
  "discharge_pressure",
  "oil_pressure",
  "amps",
  "oil_temperature",
] as const;
export type CompressorFieldKey = (typeof COMPRESSOR_FIELD_KEYS)[number];

/**
 * Facility-wide field keys. Each maps 1:1 to a numeric column on
 * refrigeration_readings.
 */
export const FACILITY_FIELD_KEYS = [
  "brine_supply",
  "brine_return",
  "brine_flow",
  "ice_surface_temp",
  "condenser_temp",
] as const;
export type FacilityFieldKey = (typeof FACILITY_FIELD_KEYS)[number];

export type RefrigerationFieldKey = CompressorFieldKey | FacilityFieldKey;

export interface RefrigerationFieldDef {
  key: RefrigerationFieldKey;
  label: string;
  unit: string;
  scope: "compressor" | "facility";
}

/**
 * The single source of truth for the field catalog. Order matters —
 * the form renders fields in this order.
 */
export const REFRIGERATION_FIELDS: readonly RefrigerationFieldDef[] = [
  // Per-compressor
  { key: "suction_pressure",   label: "Suction pressure",     unit: "PSI", scope: "compressor" },
  { key: "discharge_pressure", label: "Discharge pressure",   unit: "PSI", scope: "compressor" },
  { key: "oil_pressure",       label: "Oil pressure",         unit: "PSI", scope: "compressor" },
  { key: "amps",               label: "Amps",                 unit: "A",   scope: "compressor" },
  { key: "oil_temperature",    label: "Oil temperature",      unit: "°F",  scope: "compressor" },
  // Facility-wide
  { key: "brine_supply",       label: "Brine supply temp",    unit: "°F",  scope: "facility" },
  { key: "brine_return",       label: "Brine return temp",    unit: "°F",  scope: "facility" },
  { key: "brine_flow",         label: "Brine flow",           unit: "GPM", scope: "facility" },
  { key: "ice_surface_temp",   label: "Ice surface temp",     unit: "°F",  scope: "facility" },
  { key: "condenser_temp",     label: "Condenser temp",       unit: "°F",  scope: "facility" },
] as const;

export const COMPRESSOR_FIELDS: readonly RefrigerationFieldDef[] =
  REFRIGERATION_FIELDS.filter((f) => f.scope === "compressor");
export const FACILITY_FIELDS: readonly RefrigerationFieldDef[] =
  REFRIGERATION_FIELDS.filter((f) => f.scope === "facility");

// =====================================================================
// Thresholds (stored in facility_config)
// =====================================================================

/**
 * One field's normal operating range. Both ends are optional so an
 * admin can set just a max or just a min if only one direction is
 * meaningful (e.g. brine flow has a min but no useful max).
 */
export const ThresholdRange = z
  .object({
    min: z.number().nullable(),
    max: z.number().nullable(),
  })
  .refine(
    (v) => {
      if (v.min === null || v.max === null) return true;
      return v.min <= v.max;
    },
    { message: "Min must be ≤ max" },
  );
export type ThresholdRange = z.infer<typeof ThresholdRange>;

/**
 * The whole threshold map: one entry per field key. Stored in
 * facility_config as a single row with key='thresholds'. We keep it
 * as one row (rather than ten) so the admin save is atomic.
 */
export const ThresholdMap = z.record(z.string(), ThresholdRange);
export type ThresholdMap = z.infer<typeof ThresholdMap>;

export function isOutOfRange(
  value: number | null,
  range: ThresholdRange | undefined,
): boolean {
  if (value === null || range === undefined) return false;
  if (range.min !== null && value < range.min) return true;
  if (range.max !== null && value > range.max) return true;
  return false;
}

// =====================================================================
// Submission schema (form → Dexie queue → /api/sync → DB)
// =====================================================================

const NumericReading = z.number().nullable();

export const CompressorReadingRow = z.object({
  compressor_id: z.string().uuid(),
  suction_pressure: NumericReading,
  discharge_pressure: NumericReading,
  oil_pressure: NumericReading,
  amps: NumericReading,
  oil_temperature: NumericReading,
});
export type CompressorReadingRow = z.infer<typeof CompressorReadingRow>;

export const RefrigerationReadingInput = z.object({
  local_id: z.string().uuid(),
  submitted_at: z.string().datetime(),
  brine_supply: NumericReading,
  brine_return: NumericReading,
  brine_flow: NumericReading,
  ice_surface_temp: NumericReading,
  condenser_temp: NumericReading,
  compressor_readings: z.array(CompressorReadingRow),
});
export type RefrigerationReadingInput = z.infer<
  typeof RefrigerationReadingInput
>;

// =====================================================================
// JSONB → CompressorReadingRow boundary helper
// =====================================================================

export function toCompressorReadings(value: unknown): CompressorReadingRow[] {
  if (!Array.isArray(value)) return [];
  const out: CompressorReadingRow[] = [];
  for (const row of value) {
    const parsed = CompressorReadingRow.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
