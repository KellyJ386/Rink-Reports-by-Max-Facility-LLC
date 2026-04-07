/**
 * Tests for the Monthly Board Pack PDF generator.
 *
 * Verifies:
 *   1. All-empty / zero-data input → generates without throwing and returns
 *      a valid base64 PDF string.
 *   2. With active alerts → the decoded PDF contains the alert count and
 *      severity markers (CRITICAL / WARNING / INFO) as expected.
 *
 * jsPDF runs fine in jsdom. The server-only stub suppresses the import guard.
 */

import { describe, it, expect } from "vitest";
import {
  generateMonthlyBoardPack,
  type ActiveAlert,
  type AirQualitySummary,
  type RefrigerationSummary,
  type IncidentSummary,
  type CompletionRate,
} from "@/server/pdf/packs/monthlyBoardPack";

// ── Fixtures ───────────────────────────────────────────────────────────────

const EMPTY_AQ: AirQualitySummary = {
  avgCoPpm: null,
  avgNo2Ppm: null,
  daysNormal: 0,
  daysCaution: 0,
  daysAction: 0,
  daysEvacuate: 0,
  trend: "no_data",
};

const EMPTY_REF: RefrigerationSummary = {
  avgBrineDeltaT: null,
  daysOutsideNormal: 0,
  totalReadingDays: 0,
  trend: "no_data",
};

const EMPTY_INC: IncidentSummary = {
  byType: {},
  total: 0,
  accidents: 0,
};

const BASE_OPTS = {
  facilityName: "Test Arena",
  month: "March 2026",
  airQualitySummary: EMPTY_AQ,
  refrigerationSummary: EMPTY_REF,
  incidentSummary: EMPTY_INC,
  completionRates: [] as CompletionRate[],
  alerts: [] as ActiveAlert[],
};

// ── Helpers ────────────────────────────────────────────────────────────────

function base64ToString(b64: string): string {
  return atob(b64);
}

function isValidBase64(s: string): boolean {
  if (!s || s.length === 0) return false;
  return /^[A-Za-z0-9+/]+=*$/.test(s);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("generateMonthlyBoardPack", () => {
  it("all-empty data → generates without throwing, returns valid base64 PDF", async () => {
    const result = await generateMonthlyBoardPack(BASE_OPTS);

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(isValidBase64(result)).toBe(true);

    const decoded = base64ToString(result);
    expect(decoded.startsWith("%PDF")).toBe(true);
  });

  it("facility name appears in decoded PDF", async () => {
    const result = await generateMonthlyBoardPack({
      ...BASE_OPTS,
      facilityName: "Polar Ice Palace",
    });

    const decoded = base64ToString(result);
    expect(decoded).toContain("Polar Ice Palace");
  });

  it("month label appears in decoded PDF", async () => {
    const result = await generateMonthlyBoardPack({
      ...BASE_OPTS,
      month: "January 2026",
    });

    const decoded = base64ToString(result);
    expect(decoded).toContain("January 2026");
  });

  it("with critical alerts → decoded PDF contains CRITICAL severity marker", async () => {
    const alerts: ActiveAlert[] = [
      {
        title: "Refrigeration drift detected",
        severity: "critical",
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        alertType: "refrigeration_drift",
      },
      {
        title: "Missed daily reports",
        severity: "warning",
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        alertType: "missed_daily_reports",
      },
    ];

    const result = await generateMonthlyBoardPack({
      ...BASE_OPTS,
      alerts,
    });

    expect(typeof result).toBe("string");
    expect(isValidBase64(result)).toBe(true);

    const decoded = base64ToString(result);
    // Severity labels are uppercased in the table (alert.severity.toUpperCase())
    expect(decoded).toContain("CRITICAL");
    expect(decoded).toContain("WARNING");
  });

  it("active alerts count reflected in executive summary text", async () => {
    const alerts: ActiveAlert[] = [
      {
        title: "Ice thin spot",
        severity: "critical",
        createdAt: new Date().toISOString(),
        alertType: "ice_depth_thin_spot",
      },
    ];

    const result = await generateMonthlyBoardPack({
      ...BASE_OPTS,
      alerts,
    });

    const decoded = base64ToString(result);
    // Executive summary says "1 unresolved alert(s)" and includes CRITICAL marker
    expect(decoded).toContain("1 unresolved alert");
    expect(decoded).toContain("CRITICAL");
  });

  it("with incident data → decoded PDF contains incident counts in executive summary", async () => {
    // jsPDF may letter-space text in the raw content stream for monospace bar
    // chart rows (Courier font), but the executive summary uses Helvetica
    // which encodes text as a plain string. Check the total count which appears
    // in the executive summary paragraph (unspaced).
    const result = await generateMonthlyBoardPack({
      ...BASE_OPTS,
      incidentSummary: {
        byType: { "Property Damage": 2, "Near-Miss": 1 },
        total: 3,
        accidents: 1,
      },
    });

    expect(typeof result).toBe("string");
    expect(isValidBase64(result)).toBe(true);

    const decoded = base64ToString(result);
    // Executive summary line contains "3 total incident(s)" — unescaped in raw PDF
    // (jsPDF escapes parens in text strings, so check for the count value)
    expect(decoded).toContain("Total incidents: 3");
  });

  it("with completion rates → decoded PDF contains checklist names", async () => {
    const completionRates: CompletionRate[] = [
      {
        checklistName: "Morning Opening",
        submitted: 28,
        missed: 3,
        totalDays: 31,
      },
      {
        checklistName: "Evening Closing",
        submitted: 31,
        missed: 0,
        totalDays: 31,
      },
    ];

    const result = await generateMonthlyBoardPack({
      ...BASE_OPTS,
      completionRates,
    });

    const decoded = base64ToString(result);
    expect(decoded).toContain("Morning Opening");
    expect(decoded).toContain("Evening Closing");
  });
});
