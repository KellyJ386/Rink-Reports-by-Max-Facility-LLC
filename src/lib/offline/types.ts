/**
 * Typed cache interfaces for each module's Dexie tables.
 * All share the same base sync-tracking fields.
 */

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
