/**
 * Offline cache type definitions.
 *
 * Two complementary sets of interfaces live in this file:
 *
 *   1. `Cached*` (snake_case, server-shaped): mirror the raw rows
 *      returned by tRPC pull procedures. Consumed by `usePullChannel`
 *      while it relays server payloads into Dexie.
 *
 *   2. `*Cache` (camelCase, client-shaped): the strongly-typed shapes
 *      stored in the Dexie module read caches (`db.dailyReports`,
 *      `db.iceOperations`, ...). Consumed by `useOfflineQuery`,
 *      `seedDexie` test helpers, and any UI that reads cached data.
 *
 * Both sets exist because the wire format is server-canonical
 * (snake_case mirroring Postgres) while the Dexie store is the
 * UI-canonical shape (camelCase, sync-tracking fields).
 *
 * NOTE: facility_id / facilityId is intentionally absent from the
 * `Cached*` types — it is resolved server-side from `ctx.facilityId`
 * and never trusted from the client. The `*Cache` types DO include
 * facilityId because it's the index used for client-side filtering
 * across the local store. (CLAUDE.md Rule 1)
 */

// ────────────────────────────────────────────────────────────────
// Server-shaped pull cache rows (consumed by usePullChannel)
// ────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────
// Client-shaped Dexie cache entries (consumed by useOfflineQuery)
// ────────────────────────────────────────────────────────────────

interface BaseCacheEntry {
  serverId: string;
  facilityId: string;
  submittedAt: string | null;
  syncedAt: string | null;
}

export interface DailyReportCache extends BaseCacheEntry {
  reportDate: string;
  tabName: string;
  data: Record<string, unknown>;
  localId?: string;
}

export interface IceOperationCache extends BaseCacheEntry {
  operationDate: string;
  operationType: string;
  equipmentType: string;
  operatorId: string;
  notes: string | null;
}

export interface RefrigerationReadingCache extends BaseCacheEntry {
  readingDate: string;
  shiftLabel: string;
  compressorIndex: number;
  suctionPressure: number | null;
  dischargePressure: number | null;
  oilPressure: number | null;
  amps: number | null;
  oilTemp: number | null;
  brineSupply: number | null;
  brineReturn: number | null;
  brineFlow: number | null;
  iceSurfaceTemp: number | null;
}

export interface AirQualityReadingCache extends BaseCacheEntry {
  readingDate: string;
  co: number | null;
  no2: number | null;
  tier: 1 | 2 | 3 | 4;
  escalationTriggered: boolean;
}

export interface IceDepthSessionCache extends BaseCacheEntry {
  sessionDate: string;
  templateId: string;
  measurements: { pointIndex: number; depth: number }[];
}

export interface IncidentCache extends BaseCacheEntry {
  incidentDate: string;
  incidentType: "incident" | "accident";
  location: string | null;
  description: string;
  bodyDiagramData: Record<string, unknown> | null;
}
