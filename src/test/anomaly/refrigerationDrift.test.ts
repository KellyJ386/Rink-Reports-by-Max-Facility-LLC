import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for detectRefrigerationDrift.
 *
 * Mocks the Supabase client so we can control the data returned by
 * the two queries (7-day recent window, 90-day baseline).
 */

type AnyObj = Record<string, unknown>;

// Shared state for mock control
const mockState = {
  recentRows: [] as AnyObj[],
  recentError: null as { message: string } | null,
  baselineRows: [] as AnyObj[],
  baselineError: null as { message: string } | null,
};

// Chain builder that returns the right data based on the `gte` call sequence
let queryCallCount = 0;

function makeSelectChain(which: "recent" | "baseline") {
  const chain: AnyObj = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);

  // The "then" resolution — vitest awaits the chain
  chain.then = vi.fn((resolve: (v: unknown) => void) => {
    if (which === "recent") {
      resolve({ data: mockState.recentRows, error: mockState.recentError });
    } else {
      resolve({ data: mockState.baselineRows, error: mockState.baselineError });
    }
  });

  return chain;
}

// We need to distinguish the two calls by tracking call order
let selectCallIndex = 0;

const mockSupabase = {
  from: vi.fn(() => {
    const idx = selectCallIndex;
    selectCallIndex++;
    const which = idx === 0 ? "recent" : "baseline";
    return makeSelectChain(which);
  }),
};

vi.mock("@/lib/supabase-server", () => ({}));

import { detectRefrigerationDrift } from "@/server/anomaly/detectors/refrigerationDrift";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

function makeCompressorReading(
  compressorId: string,
  suctionPressure: number | null,
  dischargePressure: number | null = null,
  oilPressure: number | null = null,
) {
  return {
    compressor_id: compressorId,
    suction_pressure: suctionPressure,
    discharge_pressure: dischargePressure,
    oil_pressure: oilPressure,
  };
}

function makeRow(
  submittedAt: string,
  compressorReadings: AnyObj[],
): AnyObj {
  return {
    submitted_at: submittedAt,
    compressor_readings: compressorReadings,
  };
}

beforeEach(() => {
  selectCallIndex = 0;
  mockState.recentRows = [];
  mockState.recentError = null;
  mockState.baselineRows = [];
  mockState.baselineError = null;
  vi.clearAllMocks();
});

describe("detectRefrigerationDrift", () => {
  it("returns no alerts when there are fewer than 3 recent readings", async () => {
    // Only 2 recent rows — below the minimum threshold
    mockState.recentRows = [
      makeRow("2026-04-06T10:00:00Z", [makeCompressorReading("comp-1", 100)]),
      makeRow("2026-04-05T10:00:00Z", [makeCompressorReading("comp-1", 102)]),
    ];
    mockState.baselineRows = [
      makeRow("2026-03-01T10:00:00Z", [makeCompressorReading("comp-1", 98)]),
    ];

    const results = await detectRefrigerationDrift(
      "facility-abc",
      mockSupabase as unknown as SupabaseClient<Database>,
    );

    expect(results).toHaveLength(0);
  });

  it("returns no alerts when recent readings are within 15% of baseline", async () => {
    // baseline avg = 100; recent avg = 110 → 10% above → no alert
    const baseline = Array.from({ length: 5 }, (_, i) =>
      makeRow(
        `2026-02-0${i + 1}T10:00:00Z`,
        [makeCompressorReading("comp-1", 100, 200, 50)],
      ),
    );
    mockState.baselineRows = baseline;

    // Recent 3 readings: suction pressure = 110 (10% above)
    mockState.recentRows = [
      makeRow("2026-04-06T10:00:00Z", [makeCompressorReading("comp-1", 110, 210, 53)]),
      makeRow("2026-04-05T10:00:00Z", [makeCompressorReading("comp-1", 110, 210, 53)]),
      makeRow("2026-04-04T10:00:00Z", [makeCompressorReading("comp-1", 110, 210, 53)]),
    ];

    const results = await detectRefrigerationDrift(
      "facility-abc",
      mockSupabase as unknown as SupabaseClient<Database>,
    );

    expect(results).toHaveLength(0);
  });

  it("returns a warning alert when recent average is 20% above baseline", async () => {
    // baseline avg = 100; recent avg = 120 → 20% above → warning
    const baseline = Array.from({ length: 5 }, (_, i) =>
      makeRow(
        `2026-02-0${i + 1}T10:00:00Z`,
        [makeCompressorReading("comp-1", 100)],
      ),
    );
    mockState.baselineRows = baseline;

    mockState.recentRows = [
      makeRow("2026-04-06T10:00:00Z", [makeCompressorReading("comp-1", 120)]),
      makeRow("2026-04-05T10:00:00Z", [makeCompressorReading("comp-1", 120)]),
      makeRow("2026-04-04T10:00:00Z", [makeCompressorReading("comp-1", 120)]),
    ];

    const results = await detectRefrigerationDrift(
      "facility-abc",
      mockSupabase as unknown as SupabaseClient<Database>,
    );

    expect(results.length).toBeGreaterThanOrEqual(1);
    const alert = results.find(
      (r) =>
        r.alertType === "refrigeration_drift" &&
        r.targetIdentifier === "compressor-comp-1",
    );
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe("warning");
  });

  it("returns a critical alert when recent average is 30% above baseline", async () => {
    // baseline avg = 100; recent avg = 130 → 30% above → critical
    const baseline = Array.from({ length: 5 }, (_, i) =>
      makeRow(
        `2026-02-0${i + 1}T10:00:00Z`,
        [makeCompressorReading("comp-1", 100)],
      ),
    );
    mockState.baselineRows = baseline;

    mockState.recentRows = [
      makeRow("2026-04-06T10:00:00Z", [makeCompressorReading("comp-1", 130)]),
      makeRow("2026-04-05T10:00:00Z", [makeCompressorReading("comp-1", 130)]),
      makeRow("2026-04-04T10:00:00Z", [makeCompressorReading("comp-1", 130)]),
    ];

    const results = await detectRefrigerationDrift(
      "facility-abc",
      mockSupabase as unknown as SupabaseClient<Database>,
    );

    const alert = results.find(
      (r) =>
        r.alertType === "refrigeration_drift" &&
        r.targetIdentifier === "compressor-comp-1",
    );
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe("critical");
  });

  it("returns no alerts when there are no baseline readings", async () => {
    mockState.recentRows = [
      makeRow("2026-04-06T10:00:00Z", [makeCompressorReading("comp-1", 130)]),
      makeRow("2026-04-05T10:00:00Z", [makeCompressorReading("comp-1", 130)]),
      makeRow("2026-04-04T10:00:00Z", [makeCompressorReading("comp-1", 130)]),
    ];
    mockState.baselineRows = [];

    const results = await detectRefrigerationDrift(
      "facility-abc",
      mockSupabase as unknown as SupabaseClient<Database>,
    );

    expect(results).toHaveLength(0);
  });
});
