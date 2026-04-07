/**
 * Cached-read interfaces for the Dexie pull cache.
 *
 * These interfaces mirror the server-side return types but are
 * named/shaped for local storage. Agent 1 (Phase B) owns the Dexie
 * table definitions that use these types. Agent 2 (Pull Channel) writes
 * them here so the usePullChannel hook has stable type targets.
 *
 * NOTE: facility_id is intentionally absent — it is resolved server-side
 * from ctx.facilityId and never stored on the client. (CLAUDE.md Rule 1)
 */

export interface CachedDailyReport {
  id: string;
  checklist_id: string;
  submitted_at: string;
  submitted_by: string;
  answers: Record<string, unknown>;
  local_id: string | null;
}

export interface CachedIceOperation {
  id: string;
  operation_type_id: string;
  equipment_id: string;
  submitted_at: string;
  submitted_by: string;
  answers: Record<string, unknown>;
  local_id: string | null;
}

export interface CachedRefrigerationReading {
  id: string;
  submitted_at: string;
  submitted_by: string;
  brine_supply: number | null;
  brine_return: number | null;
  brine_flow: number | null;
  ice_surface_temp: number | null;
  condenser_temp: number | null;
  compressor_readings: unknown[];
  local_id: string | null;
}

export interface CachedAirQualityReading {
  id: string;
  submitted_at: string;
  submitted_by: string;
  co_ppm: number;
  no2_ppm: number;
  notes: string | null;
  tier: string;
  local_id: string | null;
}

export interface CachedIceDepthSession {
  id: string;
  template_id: string;
  submitted_at: string;
  submitted_by: string;
  status: "draft" | "completed";
  resurfacing_status: "pre" | "mid" | "post" | null;
  notes: string | null;
  measurements: Record<string, unknown>;
  local_id: string | null;
}

export interface CachedIncident {
  id: string;
  kind: "incident" | "accident";
  occurred_at: string;
  location: string;
  incident_type: string;
  description: string;
  data: Record<string, unknown> | null;
  submitted_at: string;
  submitted_by: string;
  local_id: string | null;
}
