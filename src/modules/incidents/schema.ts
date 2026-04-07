import { z } from "zod";

/**
 * Incidents module schemas + types.
 *
 * Two report kinds — INCIDENT and ACCIDENT — share a common header
 * (when, where, who, type, description) and diverge on the variable
 * tail. The tail is modeled as a discriminated union via the `kind`
 * field, validated server-side at insert time by /api/sync.
 *
 * Per CLAUDE.md Rule 2 the dropdown choices for incident types,
 * locations, injured-person types, and body-region labels are all
 * admin-configurable per facility (stored in `facility_config` under
 * module='incidents').
 */

// =====================================================================
// Common header (both kinds)
// =====================================================================

const CommonFields = {
  occurred_at: z.string().datetime(),
  reported_by: z.string().min(1).max(120),
  location: z.string().min(1).max(120),
  incident_type: z.string().min(1).max(120),
  persons_involved: z.string().max(2000).optional(),
  witnesses: z.string().max(2000).optional(),
  description: z.string().min(1).max(5000),
  immediate_action: z.string().max(5000).optional(),
  follow_up_required: z.boolean(),
  follow_up_notes: z.string().max(5000).optional(),
};

// =====================================================================
// Body region marker (used by accident form)
// =====================================================================

/**
 * One marker placed on the body diagram. `view` is which side of
 * the figure the user clicked; (x, y) are normalized to [0, 1] over
 * the body SVG viewbox; `label` is the closest admin-defined region
 * label, OR free-text if the user types one in.
 */
export const BodyMarkerSchema = z.object({
  view: z.enum(["front", "back"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  label: z.string().min(1).max(120),
});
export type BodyMarker = z.infer<typeof BodyMarkerSchema>;

// =====================================================================
// Discriminated union
// =====================================================================

export const IncidentInput = z.object({
  kind: z.literal("incident"),
  ...CommonFields,
});
export type IncidentInput = z.infer<typeof IncidentInput>;

export const AccidentInput = z.object({
  kind: z.literal("accident"),
  ...CommonFields,
  injured_name: z.string().min(1).max(200),
  injured_type: z.string().min(1).max(120),
  injured_age: z.number().int().min(0).max(120).nullable(),
  nature_of_injury: z.string().min(1).max(5000),
  body_markers: z.array(BodyMarkerSchema).max(20),
  first_aid_administered: z.boolean(),
  first_aid_details: z.string().max(2000).optional(),
  ems_called: z.boolean(),
  ems_details: z.string().max(2000).optional(),
  transported_to_hospital: z.boolean(),
  hospital_name: z.string().max(200).optional(),
});
export type AccidentInput = z.infer<typeof AccidentInput>;

export const ReportInput = z.discriminatedUnion("kind", [
  IncidentInput,
  AccidentInput,
]);
export type ReportInput = z.infer<typeof ReportInput>;

// =====================================================================
// Submission payload (form → Dexie queue → /api/sync → DB)
//
// Wraps the report in a `local_id` envelope for idempotent replay.
// =====================================================================

export const IncidentSubmissionInput = z.object({
  local_id: z.string().uuid(),
  report: ReportInput,
});
export type IncidentSubmissionInput = z.infer<typeof IncidentSubmissionInput>;

// =====================================================================
// Admin-configurable list shapes (stored in facility_config)
// =====================================================================

/**
 * Each facility_config row under module='incidents' stores one list
 * of strings:
 *
 *   key='locations'        → [string, ...]  (Lobby, Ice Surface, ...)
 *   key='incident_types'   → [string, ...]  (Property Damage, Near-Miss, ...)
 *   key='injured_types'    → [string, ...]  (Staff, Skater, Spectator, ...)
 *   key='body_regions'     → [string, ...]  (Head, Shoulder, Knee, ...)
 *
 * Each list is validated by the admin sub-router with this schema.
 */
export const StringList = z.array(z.string().min(1).max(120)).max(60);
export type StringList = z.infer<typeof StringList>;

export const INCIDENTS_CONFIG_KEYS = [
  "locations",
  "incident_types",
  "injured_types",
  "body_regions",
] as const;
export type IncidentsConfigKey = (typeof INCIDENTS_CONFIG_KEYS)[number];

export const INCIDENTS_CONFIG_LABELS: Record<IncidentsConfigKey, string> = {
  locations: "Locations",
  incident_types: "Incident types",
  injured_types: "Injured-person types",
  body_regions: "Body regions",
};

export const INCIDENTS_CONFIG_HINTS: Record<IncidentsConfigKey, string> = {
  locations:
    "Where on the premises an incident can happen (e.g. Ice Surface, Lobby, Locker Room, Pro Shop).",
  incident_types:
    "Categories of incident (e.g. Property Damage, Near-Miss, Behavioral, Equipment, Other).",
  injured_types:
    "Who got hurt — accident form only (e.g. Staff, Skater, Spectator, Contractor, Other).",
  body_regions:
    "Optional list of canonical body region labels for accident reports. Tap-to-place markers will snap to the nearest one.",
};
