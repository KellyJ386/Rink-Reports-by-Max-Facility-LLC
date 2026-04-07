import { z } from "zod";

/**
 * Shared Zod schemas and TS types for the Ice Operations module.
 * Imported by the admin sub-router, the staff sub-router, the form,
 * and the /api/sync write handler.
 *
 * Field types and constraints stay in lockstep with
 * supabase/migrations/006_ice_operations.sql — any change must be
 * mirrored in a new SQL migration.
 */

// ---------------------------------------------------------------------
// Operation type field shapes (mirror daily_report_items)
// ---------------------------------------------------------------------

export const FieldType = z.enum([
  "text",
  "long_text",
  "number",
  "checkbox",
  "dropdown",
]);
export type FieldType = z.infer<typeof FieldType>;

export const OperationTypeFieldSchema = z.object({
  id: z.string().uuid(),
  operation_type_id: z.string().uuid(),
  position: z.number().int().nonnegative(),
  label: z.string().min(1).max(200),
  type: FieldType,
  required: z.boolean(),
  options: z.array(z.string().min(1)).nullable(),
});
export type OperationTypeField = z.infer<typeof OperationTypeFieldSchema>;

export const OperationTypeSchema = z.object({
  id: z.string().uuid(),
  facility_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  position: z.number().int().nonnegative(),
  fields: z.array(OperationTypeFieldSchema),
});
export type OperationType = z.infer<typeof OperationTypeSchema>;

// ---------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------

export const EquipmentSchema = z.object({
  id: z.string().uuid(),
  facility_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  position: z.number().int().nonnegative(),
  active: z.boolean(),
});
export type Equipment = z.infer<typeof EquipmentSchema>;

// ---------------------------------------------------------------------
// Admin mutation inputs — operation types
// ---------------------------------------------------------------------

export const CreateOperationTypeInput = z.object({
  name: z.string().min(1).max(120),
});

export const UpdateOperationTypeInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
});

export const DeleteOperationTypeInput = z.object({
  id: z.string().uuid(),
});

export const ReorderOperationTypesInput = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

// ---------------------------------------------------------------------
// Admin mutation inputs — fields
// ---------------------------------------------------------------------

const optionsShape = (
  type: FieldType,
  options: readonly string[] | undefined,
): boolean => {
  if (type === "dropdown") {
    return Array.isArray(options) && options.length >= 1;
  }
  return options === undefined || options === null;
};

export const CreateFieldInput = z
  .object({
    operation_type_id: z.string().uuid(),
    label: z.string().min(1).max(200),
    type: FieldType,
    required: z.boolean(),
    options: z.array(z.string().min(1)).optional(),
  })
  .refine((v) => optionsShape(v.type, v.options), {
    message:
      "Dropdown fields need at least one option; non-dropdown fields must not carry options.",
    path: ["options"],
  });

export const UpdateFieldInput = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1).max(200).optional(),
    type: FieldType.optional(),
    required: z.boolean().optional(),
    options: z.array(z.string().min(1)).nullable().optional(),
  })
  .refine(
    (v) => {
      if (v.type !== undefined && v.options !== undefined) {
        return optionsShape(v.type, v.options ?? undefined);
      }
      return true;
    },
    {
      message:
        "Dropdown fields need at least one option; non-dropdown fields must clear options.",
      path: ["options"],
    },
  );

export const DeleteFieldInput = z.object({
  id: z.string().uuid(),
});

export const ReorderFieldsInput = z.object({
  operation_type_id: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1),
});

// ---------------------------------------------------------------------
// Admin mutation inputs — equipment
// ---------------------------------------------------------------------

export const CreateEquipmentInput = z.object({
  name: z.string().min(1).max(120),
});

export const UpdateEquipmentInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  active: z.boolean().optional(),
});

export const DeleteEquipmentInput = z.object({
  id: z.string().uuid(),
});

export const ReorderEquipmentInput = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

// ---------------------------------------------------------------------
// Submission schema (form → Dexie queue → /api/sync → ice_operations)
// ---------------------------------------------------------------------

export const AnswerValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export type AnswerValue = z.infer<typeof AnswerValue>;

export const IceOperationAnswers = z.record(
  z.string().uuid(),
  AnswerValue,
);
export type IceOperationAnswers = z.infer<typeof IceOperationAnswers>;

export const IceOperationSubmissionInput = z.object({
  local_id: z.string().uuid(),
  operation_type_id: z.string().uuid(),
  equipment_id: z.string().uuid(),
  submitted_at: z.string().datetime(),
  answers: IceOperationAnswers,
});
export type IceOperationSubmissionInput = z.infer<
  typeof IceOperationSubmissionInput
>;

// ---------------------------------------------------------------------
// JSONB → OperationTypeField boundary helper
// ---------------------------------------------------------------------

export function toOperationTypeField(row: {
  id: string;
  operation_type_id: string;
  position: number;
  label: string;
  type: string;
  required: boolean;
  options: unknown;
}): OperationTypeField {
  let options: string[] | null = null;
  if (Array.isArray(row.options)) {
    options = row.options.filter((v): v is string => typeof v === "string");
  }
  return OperationTypeFieldSchema.parse({
    id: row.id,
    operation_type_id: row.operation_type_id,
    position: row.position,
    label: row.label,
    type: row.type,
    required: row.required,
    options,
  });
}
