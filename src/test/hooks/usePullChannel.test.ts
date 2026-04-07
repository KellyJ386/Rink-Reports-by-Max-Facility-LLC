/**
 * usePullChannel tests.
 *
 * Strategy:
 *  - vi.mock '@/lib/trpc'  → stub trpc.useUtils() with per-module
 *    pull.fetch mocks.
 *  - vi.mock '@/lib/offline/db' → spy on bulkPut for each table.
 *  - vi.useFakeTimers for the online-event debounce test.
 *
 * SKIPPED / NOTES:
 *  - The Dexie table names (dailyReports, iceOperations, etc.) are
 *    stubbed here via the db mock. Agent 1 adds the real tables; the
 *    hook casts through `unknown` so we can stub without a full Dexie
 *    instance.
 *  - We do not test the Sentry dynamic import path — it is a fire-and-
 *    forget side effect and would require complex async module mocking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock: offline db — spies for each table's bulkPut
// ---------------------------------------------------------------------------

const bulkPutSpies = {
  dailyReports: vi.fn().mockResolvedValue(undefined),
  iceOperations: vi.fn().mockResolvedValue(undefined),
  refrigerationReadings: vi.fn().mockResolvedValue(undefined),
  airQualityReadings: vi.fn().mockResolvedValue(undefined),
  iceDepthSessions: vi.fn().mockResolvedValue(undefined),
  incidents: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/lib/offline/db", () => ({
  db: {
    dailyReports: { bulkPut: (...args: unknown[]) => bulkPutSpies.dailyReports(...args) },
    iceOperations: { bulkPut: (...args: unknown[]) => bulkPutSpies.iceOperations(...args) },
    refrigerationReadings: { bulkPut: (...args: unknown[]) => bulkPutSpies.refrigerationReadings(...args) },
    airQualityReadings: { bulkPut: (...args: unknown[]) => bulkPutSpies.airQualityReadings(...args) },
    iceDepthSessions: { bulkPut: (...args: unknown[]) => bulkPutSpies.iceDepthSessions(...args) },
    incidents: { bulkPut: (...args: unknown[]) => bulkPutSpies.incidents(...args) },
  },
}));

// ---------------------------------------------------------------------------
// Mock: tRPC client — stub useUtils() with per-module pull.fetch
// ---------------------------------------------------------------------------

const pullFetches = {
  dailyReports: vi.fn().mockResolvedValue([]),
  iceOperations: vi.fn().mockResolvedValue([]),
  refrigeration: vi.fn().mockResolvedValue([]),
  airQuality: vi.fn().mockResolvedValue([]),
  iceDepth: vi.fn().mockResolvedValue([]),
  incidents: vi.fn().mockResolvedValue([]),
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      dailyReports: { pull: { fetch: (...args: unknown[]) => pullFetches.dailyReports(...args) } },
      iceOperations: { pull: { fetch: (...args: unknown[]) => pullFetches.iceOperations(...args) } },
      refrigeration: { pull: { fetch: (...args: unknown[]) => pullFetches.refrigeration(...args) } },
      airQuality: { pull: { fetch: (...args: unknown[]) => pullFetches.airQuality(...args) } },
      iceDepth: { pull: { fetch: (...args: unknown[]) => pullFetches.iceDepth(...args) } },
      incidents: { pull: { fetch: (...args: unknown[]) => pullFetches.incidents(...args) } },
    }),
  },
}));

// Import AFTER mocks are declared
import { usePullChannel } from "@/hooks/usePullChannel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetAllMocks() {
  for (const spy of Object.values(bulkPutSpies)) {
    spy.mockReset().mockResolvedValue(undefined);
  }
  for (const spy of Object.values(pullFetches)) {
    spy.mockReset().mockResolvedValue([]);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePullChannel", () => {
  beforeEach(() => {
    resetAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Test 1: on mount → all 6 pull.fetch called with since ~14 days ago
  // -------------------------------------------------------------------------
  it("calls all 6 pull procedures on mount with since ~14 days ago", async () => {
    const before = Date.now();
    const { unmount } = renderHook(() => usePullChannel());

    await waitFor(() => {
      // All 6 fetches should have been called
      for (const spy of Object.values(pullFetches)) {
        expect(spy).toHaveBeenCalledTimes(1);
      }
    });

    // Verify the `since` argument is within 5 seconds of 14 days ago
    const fourteenDaysAgo = new Date(before - 14 * 24 * 60 * 60 * 1000);
    const tolerance = 5000; // 5 seconds

    for (const spy of Object.values(pullFetches)) {
      const calledWith = spy.mock.calls[0]?.[0] as { since: string };
      expect(calledWith).toBeDefined();
      const calledAt = new Date(calledWith.since).getTime();
      expect(Math.abs(calledAt - fourteenDaysAgo.getTime())).toBeLessThan(
        tolerance,
      );
    }

    unmount();
  });

  // -------------------------------------------------------------------------
  // Test 2: dispatching online event → after 2000ms, pull triggered again
  // -------------------------------------------------------------------------
  it("triggers pull again after window online event (2000ms debounce)", async () => {
    vi.useFakeTimers();

    const { unmount } = renderHook(() => usePullChannel());

    // Wait for initial pull to settle (fake timers, so advance past any
    // pending microtasks by flushing async ops).
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const callsBefore = pullFetches.dailyReports.mock.calls.length;
    expect(callsBefore).toBeGreaterThanOrEqual(1);

    // Dispatch online event
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    // Debounce hasn't fired yet — no new call
    expect(pullFetches.dailyReports.mock.calls.length).toBe(callsBefore);

    // Advance 2000ms to fire the debounce
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync();
    });

    expect(pullFetches.dailyReports.mock.calls.length).toBeGreaterThan(
      callsBefore,
    );

    unmount();
  });

  // -------------------------------------------------------------------------
  // Test 3: pull results → corresponding db.<table>.bulkPut called
  // -------------------------------------------------------------------------
  it("writes pull results into the correct Dexie table via bulkPut", async () => {
    const fakeReport = {
      id: "r1",
      checklist_id: "cl1",
      submitted_at: new Date().toISOString(),
      submitted_by: "user-1",
      answers: {},
      local_id: null,
    };
    const fakeOperation = {
      id: "op1",
      operation_type_id: "ot1",
      equipment_id: "eq1",
      submitted_at: new Date().toISOString(),
      submitted_by: "user-1",
      answers: {},
      local_id: null,
    };
    const fakeRefrig = {
      id: "rf1",
      submitted_at: new Date().toISOString(),
      submitted_by: "user-1",
      brine_supply: 10,
      brine_return: 11,
      brine_flow: 5,
      ice_surface_temp: -3,
      condenser_temp: 20,
      compressor_readings: [],
      local_id: null,
    };
    const fakeAir = {
      id: "aq1",
      submitted_at: new Date().toISOString(),
      submitted_by: "user-1",
      co_ppm: 5,
      no2_ppm: 1,
      notes: null,
      tier: "normal" as const,
      local_id: null,
    };
    const fakeIceDepth = {
      id: "id1",
      template_id: "t1",
      submitted_at: new Date().toISOString(),
      submitted_by: "user-1",
      status: "completed" as const,
      resurfacing_status: null,
      notes: null,
      measurements: {},
      local_id: null,
    };
    const fakeIncident = {
      id: "inc1",
      kind: "incident" as const,
      occurred_at: new Date().toISOString(),
      location: "rink A",
      incident_type: "slip",
      description: "Someone slipped",
      data: null,
      submitted_at: new Date().toISOString(),
      submitted_by: "user-1",
      local_id: null,
    };

    pullFetches.dailyReports.mockResolvedValue([fakeReport]);
    pullFetches.iceOperations.mockResolvedValue([fakeOperation]);
    pullFetches.refrigeration.mockResolvedValue([fakeRefrig]);
    pullFetches.airQuality.mockResolvedValue([fakeAir]);
    pullFetches.iceDepth.mockResolvedValue([fakeIceDepth]);
    pullFetches.incidents.mockResolvedValue([fakeIncident]);

    const { unmount } = renderHook(() => usePullChannel());

    await waitFor(() => {
      expect(bulkPutSpies.dailyReports).toHaveBeenCalledTimes(1);
      expect(bulkPutSpies.iceOperations).toHaveBeenCalledTimes(1);
      expect(bulkPutSpies.refrigerationReadings).toHaveBeenCalledTimes(1);
      expect(bulkPutSpies.airQualityReadings).toHaveBeenCalledTimes(1);
      expect(bulkPutSpies.iceDepthSessions).toHaveBeenCalledTimes(1);
      expect(bulkPutSpies.incidents).toHaveBeenCalledTimes(1);
    });

    // Verify data was passed through the adapters correctly
    expect(bulkPutSpies.dailyReports).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "r1" })]),
    );
    expect(bulkPutSpies.iceOperations).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "op1" })]),
    );
    expect(bulkPutSpies.refrigerationReadings).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "rf1" })]),
    );
    expect(bulkPutSpies.airQualityReadings).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "aq1" })]),
    );
    expect(bulkPutSpies.iceDepthSessions).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "id1" })]),
    );
    expect(bulkPutSpies.incidents).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "inc1" })]),
    );

    unmount();
  });

  // -------------------------------------------------------------------------
  // Test 4: one pull throws → isPulling resets, error is set, others ran
  // -------------------------------------------------------------------------
  it("isolates module failures — error state set, other 5 still ran", async () => {
    const boom = new Error("dailyReports network failure");
    pullFetches.dailyReports.mockRejectedValue(boom);
    // All others resolve normally
    pullFetches.iceOperations.mockResolvedValue([]);
    pullFetches.refrigeration.mockResolvedValue([]);
    pullFetches.airQuality.mockResolvedValue([]);
    pullFetches.iceDepth.mockResolvedValue([]);
    pullFetches.incidents.mockResolvedValue([]);

    const { result, unmount } = renderHook(() => usePullChannel());

    await waitFor(() => {
      // All other 5 fetches should have run despite dailyReports throwing
      expect(pullFetches.iceOperations).toHaveBeenCalledTimes(1);
      expect(pullFetches.refrigeration).toHaveBeenCalledTimes(1);
      expect(pullFetches.airQuality).toHaveBeenCalledTimes(1);
      expect(pullFetches.iceDepth).toHaveBeenCalledTimes(1);
      expect(pullFetches.incidents).toHaveBeenCalledTimes(1);
      // isPulling should be false once pullAll has completed
      expect(result.current.isPulling).toBe(false);
    });

    // Error state should be set to the caught error
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("dailyReports network failure");

    unmount();
  });
});
