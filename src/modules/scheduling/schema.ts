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
  is_locked: z.boolean(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export const ShiftStatus = z.enum(["confirmed", "unconfirmed"]);
export type ShiftStatus = z.infer<typeof ShiftStatus>;

export const ShiftSchema = z.object({
  id: z.string().uuid(),
  schedule_id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  position_id: z.string().uuid(),
  area_id: z.string().uuid().nullable(),
  start_at: z.string(),
  end_at: z.string(),
  notes: z.string().nullable(),
  is_mod: z.boolean(),
  is_open: z.boolean(),
  status: ShiftStatus,
});
export type Shift = z.infer<typeof ShiftSchema>;

export const CreateShiftInput = z.object({
  schedule_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  position_id: z.string().uuid(),
  area_id: z.string().uuid().nullable().optional(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  notes: z.string().max(500).nullable().optional(),
  is_mod: z.boolean().default(false),
  is_open: z.boolean().default(false),
});

export const UpdateShiftInput = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  position_id: z.string().uuid().optional(),
  area_id: z.string().uuid().nullable().optional(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().optional(),
  notes: z.string().max(500).nullable().optional(),
  is_mod: z.boolean().optional(),
  is_open: z.boolean().optional(),
  status: ShiftStatus.optional(),
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

// =====================================================================
// Areas
// =====================================================================

export const SchedulingAreaSchema = z.object({
  id: z.string().uuid(),
  facility_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  display_order: z.number().int().nonnegative(),
  is_active: z.boolean(),
});
export type SchedulingArea = z.infer<typeof SchedulingAreaSchema>;

export const CreateAreaInput = z.object({
  name: z.string().min(1).max(120),
});

export const UpdateAreaInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  is_active: z.boolean().optional(),
});

export const DeleteAreaInput = z.object({ id: z.string().uuid() });

export const ReorderAreasInput = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

// =====================================================================
// Employees
// =====================================================================

export const EmploymentType = z.enum(["full_time", "part_time"]);
export type EmploymentType = z.infer<typeof EmploymentType>;

export const SchedulingEmployeeSchema = z.object({
  id: z.string().uuid(),
  facility_id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  employment_type: EmploymentType,
  home_area_id: z.string().uuid().nullable(),
  hire_date: z.string().nullable(),
  is_active: z.boolean(),
  max_hours_week: z.number().nullable(),
  min_hours_week: z.number().nullable(),
});
export type SchedulingEmployee = z.infer<typeof SchedulingEmployeeSchema>;

export const CreateEmployeeInput = z.object({
  user_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  employment_type: EmploymentType.default("full_time"),
  home_area_id: z.string().uuid().nullable().optional(),
  hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  max_hours_week: z.number().min(0).max(168).nullable().optional(),
  min_hours_week: z.number().min(0).max(168).nullable().optional(),
});

export const UpdateEmployeeInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  employment_type: EmploymentType.optional(),
  home_area_id: z.string().uuid().nullable().optional(),
  hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  is_active: z.boolean().optional(),
  max_hours_week: z.number().min(0).max(168).nullable().optional(),
  min_hours_week: z.number().min(0).max(168).nullable().optional(),
});

// =====================================================================
// Templates
// =====================================================================

export const SchedulingTemplateSchema = z.object({
  id: z.string().uuid(),
  facility_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  created_by: z.string().uuid(),
  created_at: z.string(),
});
export type SchedulingTemplate = z.infer<typeof SchedulingTemplateSchema>;

export const CreateTemplateInput = z.object({
  name: z.string().min(1).max(200),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const LoadTemplateInput = z.object({
  template_id: z.string().uuid(),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const DeleteTemplateInput = z.object({ id: z.string().uuid() });

// =====================================================================
// Time-off requests
// =====================================================================

export const TimeOffCategory = z.enum([
  "vacation",
  "sick",
  "personal",
  "unpaid",
]);
export type TimeOffCategory = z.infer<typeof TimeOffCategory>;

export const TimeOffStatus = z.enum(["pending", "approved", "denied"]);
export type TimeOffStatus = z.infer<typeof TimeOffStatus>;

export const TimeOffRequestSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  facility_id: z.string().uuid(),
  start_date: z.string(),
  end_date: z.string(),
  category: TimeOffCategory,
  status: TimeOffStatus,
  reason: z.string().nullable(),
  admin_note: z.string().nullable(),
  requested_at: z.string(),
  reviewed_at: z.string().nullable(),
  reviewed_by: z.string().uuid().nullable(),
});
export type TimeOffRequest = z.infer<typeof TimeOffRequestSchema>;

export const SubmitTimeOffInput = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: TimeOffCategory,
  reason: z.string().max(500).nullable().optional(),
});

export const ReviewTimeOffInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "denied"]),
  admin_note: z.string().max(500).nullable().optional(),
});

// =====================================================================
// Shift swaps
// =====================================================================

export const SwapStatus = z.enum([
  "pending",
  "approved",
  "denied",
  "cancelled",
]);
export type SwapStatus = z.infer<typeof SwapStatus>;

export const RequestSwapInput = z.object({
  requester_shift_id: z.string().uuid(),
  target_shift_id: z.string().uuid().nullable().optional(),
  target_employee_id: z.string().uuid().nullable().optional(),
});

export const ReviewSwapInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "denied"]),
});

export const CancelSwapInput = z.object({ id: z.string().uuid() });

// =====================================================================
// Scheduling notifications
// =====================================================================

export const SchedulingNotificationSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  facility_id: z.string().uuid(),
  event_type: z.string(),
  message: z.string(),
  payload: z.record(z.unknown()),
  is_read: z.boolean(),
  created_at: z.string(),
});
export type SchedulingNotification = z.infer<
  typeof SchedulingNotificationSchema
>;

export const MarkNotificationsReadInput = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

// =====================================================================
// Facility scheduling config
// =====================================================================

export const SchedulingFacilityConfigSchema = z.object({
  facility_id: z.string().uuid(),
  swap_requires_approval: z.boolean(),
  pickup_notice_hours: z.number().int().nonnegative(),
  swap_notice_hours: z.number().int().nonnegative(),
  availability_deadline_day: z.number().int().min(1).max(28),
  email_events: z.array(z.string()),
});
export type SchedulingFacilityConfig = z.infer<
  typeof SchedulingFacilityConfigSchema
>;

export const UpdateFacilityConfigInput = z.object({
  swap_requires_approval: z.boolean().optional(),
  pickup_notice_hours: z.number().int().nonnegative().optional(),
  swap_notice_hours: z.number().int().nonnegative().optional(),
  availability_deadline_day: z.number().int().min(1).max(28).optional(),
  email_events: z.array(z.string()).optional(),
});

// =====================================================================
// Validation warnings (returned alongside shift mutations)
// =====================================================================

export const ShiftWarningType = z.enum([
  "overtime_risk",
  "below_min_hours",
  "availability_conflict",
  "time_off_conflict",
]);
export type ShiftWarningType = z.infer<typeof ShiftWarningType>;

export interface ShiftWarning {
  type: ShiftWarningType;
  message: string;
}
