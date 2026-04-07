import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for persistAlerts.
 *
 * We mock the Supabase client to control SELECT (dedup check) and
 * INSERT behaviour. All tests assert on the returned { inserted,
 * skipped, errors } counters.
 */

vi.mock("@/lib/supabase-server", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { persistAlerts } from "@/server/anomaly/persist";
import type { DetectionResult } from "@/server/anomaly/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Controlled mock state
interface MockState {
  existingAlert: { id: string } | null;
  selectError: { message: string } | null;
  insertError: { message: string } | null;
}

const state: MockState = {
  existingAlert: null,
  selectError: null,
  insertError: null,
};

// Track INSERT calls
const insertSpy = vi.fn();

const INSERTED_ROW = {
  id: "new-alert-uuid",
  facility_id: "facility-123",
  alert_type: "refrigeration_drift",
  severity: "warning",
  target_identifier: "compressor-abc",
  title: "Drift detected",
  description: "Some drift",
  metadata: {},
  resolved_at: null,
  resolved_by: null,
  created_at: new Date().toISOString(),
};

function makeMockSupabase() {
  return {
    from: vi.fn(() => {
      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data: state.existingAlert,
          error: state.selectError,
        })),
        insert: vi.fn((data: unknown) => {
          insertSpy(data);
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({
              data: state.insertError ? null : INSERTED_ROW,
              error: state.insertError,
            })),
          };
        }),
      };
      return selectChain;
    }),
  };
}

const sampleResult: DetectionResult = {
  facilityId: "facility-123",
  alertType: "refrigeration_drift",
  severity: "warning",
  targetIdentifier: "compressor-abc",
  title: "Drift detected",
  description: "Some drift",
  metadata: { field: "suction_pressure" },
};

beforeEach(() => {
  state.existingAlert = null;
  state.selectError = null;
  state.insertError = null;
  insertSpy.mockClear();
  vi.clearAllMocks();
});

describe("persistAlerts", () => {
  it("inserts when no unresolved alert exists for same key", async () => {
    state.existingAlert = null; // no existing alert

    const supabase = makeMockSupabase();
    const result = await persistAlerts(
      [sampleResult],
      supabase as unknown as SupabaseClient<Database>,
    );

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it("skips when an unresolved alert already exists for same key", async () => {
    state.existingAlert = { id: "existing-uuid" };

    const supabase = makeMockSupabase();
    const result = await persistAlerts(
      [sampleResult],
      supabase as unknown as SupabaseClient<Database>,
    );

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(0);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("counts errors but continues processing remaining results", async () => {
    // First result: SELECT returns an error → should count as error
    // Second result: normal success path
    state.selectError = { message: "DB error" };

    const supabase = makeMockSupabase();
    const results: DetectionResult[] = [
      sampleResult,
      { ...sampleResult, targetIdentifier: "compressor-xyz", title: "Other drift" },
    ];

    const result = await persistAlerts(
      results,
      supabase as unknown as SupabaseClient<Database>,
    );

    // Both will error because the same mock state is shared
    expect(result.errors).toBeGreaterThanOrEqual(1);
    expect(result.inserted + result.skipped + result.errors).toBe(2);
  });

  it("returns zeros for empty results array", async () => {
    const supabase = makeMockSupabase();
    const result = await persistAlerts(
      [],
      supabase as unknown as SupabaseClient<Database>,
    );

    expect(result).toMatchObject({ inserted: 0, skipped: 0, errors: 0, insertedAlerts: [] });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("inserts correct fields into the alerts table", async () => {
    state.existingAlert = null;

    const supabase = makeMockSupabase();
    await persistAlerts(
      [sampleResult],
      supabase as unknown as SupabaseClient<Database>,
    );

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        facility_id: "facility-123",
        alert_type: "refrigeration_drift",
        severity: "warning",
        target_identifier: "compressor-abc",
        title: "Drift detected",
      }),
    );
  });
});
