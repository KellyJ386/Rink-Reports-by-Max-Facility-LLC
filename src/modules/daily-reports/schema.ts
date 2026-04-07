import { z } from "zod";

/**
 * Shared Zod schemas and TS types for the Daily Reports module.
 * Imported by the admin sub-router, the checklist editor, and
 * (in Plan 2B) the module page + /api/sync write handler.
 *
 * Field types and constraints are kept in lockstep with the
 * corresponding SQL CHECK constraints in
 * supabase/migrations/005_daily_reports.sql — any change must
 * be mirrored in a new SQL migration.
 */

export const ItemType = z.enum([
  "text",
  "long_text",
  "number",
  "checkbox",
  "dropdown",
]);
export type ItemType = z.infer<typeof ItemType>;

export const ChecklistItemSchema = z.object({
  id: z.string().uuid(),
  checklist_id: z.string().uuid(),
  position: z.number().int().nonnegative(),
  label: z.string().min(1).max(200),
  type: ItemType,
  required: z.boolean(),
  options: z.array(z.string().min(1)).nullable(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const ChecklistSchema = z.object({
  id: z.string().uuid(),
  facility_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  position: z.number().int().nonnegative(),
  items: z.array(ChecklistItemSchema),
});
export type Checklist = z.infer<typeof ChecklistSchema>;

// ---------------------------------------------------------------------
// Admin mutation input schemas
// ---------------------------------------------------------------------

export const CreateChecklistInput = z.object({
  name: z.string().min(1).max(120),
});

export const UpdateChecklistInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
});

export const DeleteChecklistInput = z.object({
  id: z.string().uuid(),
});

export const ReorderChecklistsInput = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

/**
 * Refinement: dropdown items must carry at least one non-empty option;
 * all other types must not carry any options. Mirrors the SQL
 * daily_report_items_options_shape CHECK constraint.
 */
const optionsShape = (
  type: ItemType,
  options: readonly string[] | undefined,
): boolean => {
  if (type === "dropdown") {
    return Array.isArray(options) && options.length >= 1;
  }
  return options === undefined || options === null;
};

export const CreateItemInput = z
  .object({
    checklist_id: z.string().uuid(),
    label: z.string().min(1).max(200),
    type: ItemType,
    required: z.boolean(),
    options: z.array(z.string().min(1)).optional(),
  })
  .refine((v) => optionsShape(v.type, v.options), {
    message:
      "Dropdown items need at least one option; non-dropdown items must not carry options.",
    path: ["options"],
  });

export const UpdateItemInput = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1).max(200).optional(),
    type: ItemType.optional(),
    required: z.boolean().optional(),
    options: z.array(z.string().min(1)).nullable().optional(),
  })
  .refine(
    (v) => {
      // If type is being changed AND options is being set, they must agree.
      // If only one of them is set, defer the invariant to the server which
      // will have the current row to cross-check.
      if (v.type !== undefined && v.options !== undefined) {
        return optionsShape(v.type, v.options ?? undefined);
      }
      return true;
    },
    {
      message:
        "Dropdown items need at least one option; non-dropdown items must clear options.",
      path: ["options"],
    },
  );

export const DeleteItemInput = z.object({
  id: z.string().uuid(),
});

export const ReorderItemsInput = z.object({
  checklist_id: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1),
});

// ---------------------------------------------------------------------
// Submission payload (staff-facing)
// ---------------------------------------------------------------------

/**
 * One answered field. The discriminator is the renderer's `type`; we
 * keep the value loosely typed because the runtime answer for a
 * dropdown is a string, for a checkbox a boolean, for a number a
 * finite number, and for the two text variants a string. The
 * server-side handler does its own per-item shape check against the
 * checklist definition before insert.
 */
export const AnswerValue = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export type AnswerValue = z.infer<typeof AnswerValue>;

export const SubmitDailyReportInput = z.object({
  checklist_id: z.string().uuid(),
  /** Map of item_id -> answer value. */
  answers: z.record(z.string().uuid(), AnswerValue),
});
export type SubmitDailyReportInput = z.infer<typeof SubmitDailyReportInput>;

/**
 * Wire shape that the offline queue posts to /api/sync for the
 * `daily_reports` table. `local_id` is the Dexie primary key, used
 * server-side as an idempotency token (see the unique index in
 * migration 005). `submitted_at` is the wall-clock time of the
 * original local write so retries don't drift to the server clock.
 */
export const DailyReportSyncPayload = z.object({
  checklist_id: z.string().uuid(),
  answers: z.record(z.string().uuid(), AnswerValue),
  submitted_at: z.string().datetime(),
  local_id: z.string().min(1),
});
export type DailyReportSyncPayload = z.infer<typeof DailyReportSyncPayload>;
