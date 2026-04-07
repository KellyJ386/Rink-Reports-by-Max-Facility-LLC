import { db } from "@/lib/offline";
import type {
  DailyReportCache,
  IceOperationCache,
  RefrigerationReadingCache,
  AirQualityReadingCache,
  IceDepthSessionCache,
  IncidentCache,
} from "@/lib/offline";

export async function seedDailyReports(
  overrides: Partial<DailyReportCache>[],
): Promise<void> {
  const filled: DailyReportCache[] = overrides.map((o) => ({
    serverId: crypto.randomUUID(),
    facilityId: "test-facility",
    submittedAt: null,
    syncedAt: null,
    reportDate: "2026-01-01",
    tabName: "default",
    data: {},
    ...o,
  }));
  await db.dailyReports.bulkPut(filled);
}

export async function seedIceOperations(
  overrides: Partial<IceOperationCache>[],
): Promise<void> {
  const filled: IceOperationCache[] = overrides.map((o) => ({
    serverId: crypto.randomUUID(),
    facilityId: "test-facility",
    submittedAt: null,
    syncedAt: null,
    operationDate: "2026-01-01",
    operationType: "default",
    equipmentType: "default",
    operatorId: "default",
    notes: null,
    ...o,
  }));
  await db.iceOperations.bulkPut(filled);
}

export async function seedRefrigerationReadings(
  overrides: Partial<RefrigerationReadingCache>[],
): Promise<void> {
  const filled: RefrigerationReadingCache[] = overrides.map((o) => ({
    serverId: crypto.randomUUID(),
    facilityId: "test-facility",
    submittedAt: null,
    syncedAt: null,
    readingDate: "2026-01-01",
    shiftLabel: "default",
    compressorIndex: 0,
    suctionPressure: null,
    dischargePressure: null,
    oilPressure: null,
    amps: null,
    oilTemp: null,
    brineSupply: null,
    brineReturn: null,
    brineFlow: null,
    iceSurfaceTemp: null,
    ...o,
  }));
  await db.refrigerationReadings.bulkPut(filled);
}

export async function seedAirQualityReadings(
  overrides: Partial<AirQualityReadingCache>[],
): Promise<void> {
  const filled: AirQualityReadingCache[] = overrides.map((o) => ({
    serverId: crypto.randomUUID(),
    facilityId: "test-facility",
    submittedAt: null,
    syncedAt: null,
    readingDate: "2026-01-01",
    co: null,
    no2: null,
    tier: 1 as const,
    escalationTriggered: false,
    ...o,
  }));
  await db.airQualityReadings.bulkPut(filled);
}

export async function seedIceDepthSessions(
  overrides: Partial<IceDepthSessionCache>[],
): Promise<void> {
  const filled: IceDepthSessionCache[] = overrides.map((o) => ({
    serverId: crypto.randomUUID(),
    facilityId: "test-facility",
    submittedAt: null,
    syncedAt: null,
    sessionDate: "2026-01-01",
    templateId: "default",
    measurements: [],
    ...o,
  }));
  await db.iceDepthSessions.bulkPut(filled);
}

export async function seedIncidents(
  overrides: Partial<IncidentCache>[],
): Promise<void> {
  const filled: IncidentCache[] = overrides.map((o) => ({
    serverId: crypto.randomUUID(),
    facilityId: "test-facility",
    submittedAt: null,
    syncedAt: null,
    incidentDate: "2026-01-01",
    incidentType: "incident" as const,
    location: null,
    description: "",
    bodyDiagramData: null,
    ...o,
  }));
  await db.incidents.bulkPut(filled);
}
