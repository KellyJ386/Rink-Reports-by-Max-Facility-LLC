import { z } from "zod";

/**
 * Ice Depth module schemas + types.
 *
 * The rink SVG itself is fixed (standard NHL ice surface, hand-coded
 * in src/modules/ice-depth/components/RinkSurface.tsx). What's
 * admin-configurable per facility is:
 *
 *   * up to 8 measurement TEMPLATES, each with a name, a unit
 *     ('in' or 'mm'), and up to 60 numbered (x, y) point positions
 *     in normalized coordinates over the rink viewport.
 *
 * Sessions are append-then-finalize: a session starts as a draft
 * that the operator can keep updating, and flips to 'completed' when
 * the Complete & Export button is hit. Completed sessions are
 * immutable (enforced by both an RLS policy and a freeze trigger).
 */

// =====================================================================
// Templates
// =====================================================================

export const Unit = z.enum(["in", "mm"]);
export type Unit = z.infer<typeof Unit>;

export const MAX_POINTS_PER_TEMPLATE = 60;
export const MAX_TEMPLATES_PER_FACILITY = 8;

/**
 * One numbered measurement point. n is 1-based and unique within
 * a template; (x, y) are normalized to [0, 1] over the rink viewport
 * (x = horizontal, y = vertical, top-left origin).
 */
export const PointSchema = z.object({
  n: z.number().int().min(1).max(MAX_POINTS_PER_TEMPLATE),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type Point = z.infer<typeof PointSchema>;

export const PointsArray = z.array(PointSchema).max(MAX_POINTS_PER_TEMPLATE);

export const TemplateSchema = z.object({
  id: z.string().uuid(),
  facility_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  position: z.number().int().nonnegative(),
  unit: Unit,
  points: PointsArray,
});
export type Template = z.infer<typeof TemplateSchema>;

// ---------------------------------------------------------------------
// Admin mutation inputs
// ---------------------------------------------------------------------

export const CreateTemplateInput = z.object({
  name: z.string().min(1).max(120),
  unit: Unit,
});

export const UpdateTemplateInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  unit: Unit.optional(),
  points: PointsArray.optional(),
});

export const DeleteTemplateInput = z.object({
  id: z.string().uuid(),
});

export const ReorderTemplatesInput = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

// =====================================================================
// Sessions
// =====================================================================

export const ResurfacingStatus = z.enum(["pre", "mid", "post"]);
export type ResurfacingStatus = z.infer<typeof ResurfacingStatus>;

export const RESURFACING_LABELS: Record<ResurfacingStatus, string> = {
  pre: "Pre-resurface",
  mid: "Mid-session",
  post: "Post-resurface",
};

export const SessionStatus = z.enum(["draft", "completed"]);
export type SessionStatus = z.infer<typeof SessionStatus>;

/**
 * Map of point number → measurement value (in the template's unit).
 * Values are positive numbers; an absent key means the point hasn't
 * been measured yet.
 */
export const Measurements = z.record(
  z
    .string()
    .regex(/^[1-9]\d*$/, "Point number must be a positive integer string"),
  z.number().positive(),
);
export type Measurements = z.infer<typeof Measurements>;

/**
 * Submission payload pushed onto the Dexie queue and replayed by
 * /api/sync. The same shape covers both "save draft" and "complete":
 * the difference is the `status` field.
 *
 * The /api/sync handler upserts on (facility_id, local_id):
 *   - new local_id → INSERT
 *   - existing draft → UPDATE (allowed by RLS + freeze trigger)
 *   - existing completed → bounced by the freeze trigger
 */
export const IceDepthSessionInput = z.object({
  local_id: z.string().uuid(),
  template_id: z.string().uuid(),
  submitted_at: z.string().datetime(),
  status: SessionStatus,
  resurfacing_status: ResurfacingStatus.nullable(),
  notes: z.string().max(2000).nullable(),
  measurements: Measurements,
});
export type IceDepthSessionInput = z.infer<typeof IceDepthSessionInput>;

// =====================================================================
// JSONB → typed boundary helpers
// =====================================================================

export function toPoints(value: unknown): Point[] {
  if (!Array.isArray(value)) return [];
  const out: Point[] = [];
  for (const row of value) {
    const parsed = PointSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out.sort((a, b) => a.n - b.n);
}

export function toMeasurements(value: unknown): Measurements {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: Measurements = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      out[k] = v;
    }
  }
  return out;
}
