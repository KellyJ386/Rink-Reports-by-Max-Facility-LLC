import { z } from "zod";

/**
 * Scheduling module schemas + types.
 *
 * The week always begins on Monday and runs Mon..Sun (dow 0..6).
 * Day-of-week and minute-of-day are stored together in availability
 * blocks; concrete shifts use timestamptz columns.
 */

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

// =====================================================================
// Positions & certifications
// =====================================================================

export const PositionSchema = z.object({
  id: z.string().uuid(),
  facility_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  position: z.number().int().nonnegative(),
  color: z.string().regex(HEX_COLOR),
});
export type Position = z.infer<typeof PositionSchema>;

export const CreatePositionInput = z.object({
  name: z.string().min(1).max(120),
  color: z.string().regex(HEX_COLOR).default("#003B6F"),
});

export const UpdatePositionInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  color: z.string().regex(HEX_COLOR).optional(),
});

export const DeletePositionInput = z.object({ id: z.string().uuid() });

export const CertificationSchema = z.object({
  id: z.string().uuid(),
  facility_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  position: z.number().int().nonnegative(),
});
export type Certification = z.infer<typeof CertificationSchema>;

export const CreateCertificationInput = z.object({
  name: z.string().min(1).max(120),
});

export const DeleteCertificationInput = z.object({ id: z.string().uuid() });

export const SetPositionCertsInput = z.object({
  position_id: z.string().uuid(),
  certification_ids: z.array(z.string().uuid()),
});

export const SetStaffCertsInput = z.object({
  user_id: z.string().uuid(),
  certification_ids: z.array(z.string().uuid()),
});

// =====================================================================
// Availability
// =====================================================================

export const AvailabilityStatus = z.enum([
  "available",
  "preferred",
  "unavailable",
]);
export type AvailabilityStatus = z.infer<typeof AvailabilityStatus>;

/**
 * One time block. dow ∈ {0..6} where 0 = Monday. start_minute /
 * end_minute are minutes since midnight (0..1440), end > start.
 */
export const AvailabilityBlockSchema = z
  .object({
    dow: z.number().int().min(0).max(6),
    start_minute: z.number().int().min(0).max(1440),
    end_minute: z.number().int().min(0).max(1440),
    status: AvailabilityStatus,
  })
  .refine((b) => b.end_minute > b.start_minute, {
    message: "end_minute must be > start_minute",
  });
export type AvailabilityBlock = z.infer<typeof AvailabilityBlockSchema>;

export const SaveAvailabilityInput = z.object({
  recurring: z.boolean(),
  // ISO date "YYYY-MM-DD" Monday of the target week, or null when
  // recurring=true.
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  blocks: z.array(AvailabilityBlockSchema),
});
export type SaveAvailabilityInput = z.infer<typeof SaveAvailabilityInput>;

// =====================================================================
// Schedule + shifts
// =====================================================================

export const ScheduleStatus = z.enum(["draft", "published"]);
export type ScheduleStatus = z.infer<typeof ScheduleStatus>;

export const ScheduleSchema = z.object({
  id: z.string().uuid(),
  facility_id: z.string().uuid(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: ScheduleStatus,
  created_by: z.string().uuid(),
  published_at: z.string().nullable(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export const ShiftSchema = z.object({
  id: z.string().uuid(),
  schedule_id: z.string().uuid(),
  user_id: z.string().uuid(),
  position_id: z.string().uuid(),
  start_at: z.string(),
  end_at: z.string(),
  notes: z.string().nullable(),
});
export type Shift = z.infer<typeof ShiftSchema>;

export const CreateShiftInput = z.object({
  schedule_id: z.string().uuid(),
  user_id: z.string().uuid(),
  position_id: z.string().uuid(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  notes: z.string().max(500).nullable().optional(),
});

export const UpdateShiftInput = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  position_id: z.string().uuid().optional(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const DeleteShiftInput = z.object({ id: z.string().uuid() });

// =====================================================================
// Block granularity (admin config)
// =====================================================================

export const BlockMinutes = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(60),
]);
export type BlockMinutes = z.infer<typeof BlockMinutes>;
export const DEFAULT_BLOCK_MINUTES: BlockMinutes = 30;
