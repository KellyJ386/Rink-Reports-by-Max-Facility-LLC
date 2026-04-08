import { describe, it, expect } from "vitest";
import {
  formatDailyReportRows,
  type DailyReportRow,
} from "@/server/exports/formatters/dailyReport";
import {
  formatIceOperationRows,
  type IceOperationRow,
} from "@/server/exports/formatters/iceOperations";
import {
  formatRefrigerationRows,
  type RefrigerationReadingRow,
} from "@/server/exports/formatters/refrigerationReadings";
import {
  formatAirQualityRows,
  type AirQualityReadingRow,
} from "@/server/exports/formatters/airQualityReadings";
import {
  formatIncidentRows,
  type IncidentRow,
} from "@/server/exports/formatters/incidents";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_ID = "00000000-0000-4000-8000-000000000001";

// ─── Daily Report ─────────────────────────────────────────────────────────────

describe("formatDailyReportRows", () => {
  const baseReport: DailyReportRow = {
    id: BASE_ID,
    facility_id: BASE_ID,
    checklist_id: BASE_ID,
    submitted_at: "2026-01-15T09:30:00Z",
    submitted_by: "user@example.com",
    answers: { "Ice Temperature": "-4", "Resurfacing Done": "yes" },
    checklist: { name: "Morning Check" },
  };

  it("returns the expected 6-column header", () => {
    const { headers } = formatDailyReportRows([baseReport]);
    expect(headers).toHaveLength(6);
    expect(headers[0]).toBe("Date");
    expect(headers[1]).toBe("Tab Name");
    expect(headers[2]).toBe("Field");
    expect(headers[3]).toBe("Value");
    expect(headers[4]).toBe("Submitted By");
    expect(headers[5]).toBe("Submitted At");
  });

  it("fans out answers into one row per field", () => {
    const { rows } = formatDailyReportRows([baseReport]);
    expect(rows).toHaveLength(2);
  });

  it("includes correct date, tab and submittedBy in each row", () => {
    const { rows } = formatDailyReportRows([baseReport]);
    rows.forEach((row) => {
      expect(row[0]).toBe("2026-01-15");
      expect(row[1]).toBe("Morning Check");
      expect(row[4]).toBe("user@example.com");
    });
  });

  it("emits one empty row for a report with no answers", () => {
    const report: DailyReportRow = { ...baseReport, answers: {} };
    const { rows } = formatDailyReportRows([report]);
    expect(rows).toHaveLength(1);
    expect(rows[0]![2]).toBeNull(); // Field column is null
    expect(rows[0]![3]).toBeNull(); // Value column is null
  });

  it("handles null answers field gracefully", () => {
    const report: DailyReportRow = { ...baseReport, answers: null };
    const { rows } = formatDailyReportRows([report]);
    expect(rows).toHaveLength(1);
  });

  it("missing checklist becomes null tab name", () => {
    const report: DailyReportRow = { ...baseReport, checklist: null };
    const { rows } = formatDailyReportRows([report]);
    expect(rows[0]![1]).toBeNull();
  });
});

// ─── Ice Operations ───────────────────────────────────────────────────────────

describe("formatIceOperationRows", () => {
  const baseOp: IceOperationRow = {
    id: BASE_ID,
    facility_id: BASE_ID,
    operation_type_id: BASE_ID,
    equipment_id: BASE_ID,
    submitted_at: "2026-02-10T14:00:00Z",
    submitted_by: "ops@example.com",
    answers: { notes: "Routine flood" },
    operation_type: { name: "Flood" },
    equipment: { name: "Olympia" },
  };

  it("returns the expected 6-column header", () => {
    const { headers } = formatIceOperationRows([baseOp]);
    expect(headers).toHaveLength(6);
    expect(headers[0]).toBe("Date");
    expect(headers[1]).toBe("Operation Type");
    expect(headers[2]).toBe("Equipment Type");
    expect(headers[3]).toBe("Operator");
    expect(headers[4]).toBe("Submitted At");
    expect(headers[5]).toBe("Notes");
  });

  it("returns one row per operation", () => {
    const { rows } = formatIceOperationRows([baseOp, baseOp]);
    expect(rows).toHaveLength(2);
  });

  it("extracts notes from answers JSONB", () => {
    const { rows } = formatIceOperationRows([baseOp]);
    expect(rows[0]![5]).toBe("Routine flood");
  });

  it("null missing fields become null in output", () => {
    const op: IceOperationRow = {
      ...baseOp,
      operation_type: null,
      equipment: null,
      answers: null,
    };
    const { rows } = formatIceOperationRows([op]);
    expect(rows[0]![1]).toBeNull(); // operation type
    expect(rows[0]![2]).toBeNull(); // equipment type
    expect(rows[0]![5]).toBeNull(); // notes
  });
});

// ─── Refrigeration ────────────────────────────────────────────────────────────

describe("formatRefrigerationRows", () => {
  const makeReading = (
    compressors: RefrigerationReadingRow["compressor_readings"],
  ): RefrigerationReadingRow => ({
    id: BASE_ID,
    facility_id: BASE_ID,
    submitted_by: "tech@example.com",
    submitted_at: "2026-03-01T06:00:00Z",
    brine_supply: 28,
    brine_return: 32,
    brine_flow: 120,
    ice_surface_temp: -5,
    condenser_temp: null,
    compressor_readings: compressors,
  });

  it("returns the expected 12-column header", () => {
    const { headers } = formatRefrigerationRows([makeReading([])]);
    expect(headers).toHaveLength(12);
    expect(headers[0]).toBe("Date");
    expect(headers[2]).toBe("Compressor #");
  });

  it("fans out 3 compressors into 3 output rows", () => {
    const reading = makeReading([
      { compressor_id: "1", suction_pressure: 60, discharge_pressure: 180 },
      { compressor_id: "2", suction_pressure: 62, discharge_pressure: 182 },
      { compressor_id: "3", suction_pressure: 58, discharge_pressure: 178 },
    ]);
    const { rows } = formatRefrigerationRows([reading]);
    expect(rows).toHaveLength(3);
    // Compressor # is column index 2
    expect(rows[0]![2]).toBe(1);
    expect(rows[1]![2]).toBe(2);
    expect(rows[2]![2]).toBe(3);
  });

  it("emits one row when compressor_readings is empty", () => {
    const { rows } = formatRefrigerationRows([makeReading([])]);
    expect(rows).toHaveLength(1);
    expect(rows[0]![2]).toBeNull(); // no compressor number
  });

  it("brine fields are repeated for each compressor row", () => {
    const reading = makeReading([
      { compressor_id: "1" },
      { compressor_id: "2" },
    ]);
    const { rows } = formatRefrigerationRows([reading]);
    // brine_supply is column index 8
    rows.forEach((row) => {
      expect(row[8]).toBe(28);
      expect(row[9]).toBe(32);
    });
  });

  it("null compressor fields become null in output", () => {
    const reading = makeReading([
      {
        compressor_id: "1",
        suction_pressure: null,
        discharge_pressure: null,
        oil_pressure: null,
        amps: null,
        oil_temperature: null,
      },
    ]);
    const { rows } = formatRefrigerationRows([reading]);
    // suction PSI = col 3
    expect(rows[0]![3]).toBeNull();
  });
});

// ─── Air Quality ──────────────────────────────────────────────────────────────

describe("formatAirQualityRows", () => {
  const baseReading: AirQualityReadingRow = {
    id: BASE_ID,
    facility_id: BASE_ID,
    submitted_by: "inspector@example.com",
    submitted_at: "2026-04-01T10:45:00Z",
    co_ppm: 3.2,
    no2_ppm: 0.05,
    tier: "green",
  };

  it("returns the expected 6-column header", () => {
    const { headers } = formatAirQualityRows([baseReading]);
    expect(headers).toHaveLength(6);
    expect(headers[0]).toBe("Date");
    expect(headers[1]).toBe("Time");
    expect(headers[2]).toBe("CO (ppm)");
    expect(headers[4]).toBe("Tier");
    expect(headers[5]).toBe("Submitted By");
  });

  it("returns non-empty rows array", () => {
    const { rows } = formatAirQualityRows([baseReading]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("splits submitted_at into Date and Time columns", () => {
    const { rows } = formatAirQualityRows([baseReading]);
    expect(rows[0]![0]).toBe("2026-04-01");
    expect(rows[0]![1]).toBe("10:45");
  });

  it("null/missing submitted_at yields null date and time", () => {
    const reading: AirQualityReadingRow = {
      ...baseReading,
      submitted_at: "" as string,
    };
    const { rows } = formatAirQualityRows([reading]);
    expect(rows[0]![0]).toBeNull();
    expect(rows[0]![1]).toBeNull();
  });

  it("co_ppm and no2_ppm are preserved as numbers", () => {
    const { rows } = formatAirQualityRows([baseReading]);
    expect(rows[0]![2]).toBe(3.2);
    expect(rows[0]![3]).toBe(0.05);
  });
});

// ─── Incidents ────────────────────────────────────────────────────────────────

describe("formatIncidentRows", () => {
  const baseIncident: IncidentRow = {
    id: BASE_ID,
    facility_id: BASE_ID,
    kind: "injury",
    occurred_at: "2026-04-05T18:00:00Z",
    location: "Rink A",
    incident_type: "Slip and Fall",
    description: "Player slipped near boards",
    data: null,
    submitted_at: "2026-04-05T18:10:00Z",
    submitted_by: "staff@example.com",
  };

  it("returns the expected 5-column header", () => {
    const { headers } = formatIncidentRows([baseIncident]);
    expect(headers).toHaveLength(5);
    expect(headers[0]).toBe("Date");
    expect(headers[1]).toBe("Type");
    expect(headers[2]).toBe("Location");
    expect(headers[3]).toBe("Description");
    expect(headers[4]).toBe("Reported By");
  });

  it("returns non-empty rows array", () => {
    const { rows } = formatIncidentRows([baseIncident]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("maps columns correctly from typed fields", () => {
    const { rows } = formatIncidentRows([baseIncident]);
    expect(rows[0]![0]).toBe("2026-04-05");
    expect(rows[0]![1]).toBe("Slip and Fall");
    expect(rows[0]![2]).toBe("Rink A");
    expect(rows[0]![3]).toBe("Player slipped near boards");
    expect(rows[0]![4]).toBe("staff@example.com");
  });

  it("falls back to data JSONB when typed fields are absent", () => {
    const incident: IncidentRow = {
      ...baseIncident,
      incident_type: null as unknown as string,
      description: null as unknown as string,
      data: {
        incident_type: "Equipment Failure",
        description: "Zamboni broke down",
      },
    };
    const { rows } = formatIncidentRows([incident]);
    expect(rows[0]![1]).toBe("Equipment Failure");
    expect(rows[0]![3]).toBe("Zamboni broke down");
  });

  it("null occurred_at yields null date", () => {
    const incident: IncidentRow = {
      ...baseIncident,
      occurred_at: null as unknown as string,
    };
    const { rows } = formatIncidentRows([incident]);
    expect(rows[0]![0]).toBeNull();
  });
});
