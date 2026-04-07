/**
 * useOfflineQuery tests.
 *
 * Strategy:
 *  - vi.mock 'dexie-react-hooks' → control `useLiveQuery` return value per test.
 *  - vi.mock '@/lib/offline/db' → spy on `bulkPut` for the dailyReports table.
 *  - Verify Dexie-first behavior: data from live query is returned immediately,
 *    isLoading rules, fetcher calls bulkPut, errors captured without throw.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Types used in tests
// ---------------------------------------------------------------------------

interface FakeReport {
  id: string;
  checklist_id: string;
  submitted_at: string;
  submitted_by: string;
  answers: Record<string, unknown>;
  local_id: string | null;
}

// ---------------------------------------------------------------------------
// Mock: dexie-react-hooks
// We control `useLiveQuery` per test via mockImplementation.
// ---------------------------------------------------------------------------

const mockUseLiveQuery = vi.fn();

vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (...args: unknown[]) => mockUseLiveQuery(...args),
}));

// ---------------------------------------------------------------------------
// Mock: offline db — spies for the dailyReports table
// ---------------------------------------------------------------------------

const bulkPutSpy = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/offline/db", () => ({
  db: {
    dailyReports: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: (...args: unknown[]) => bulkPutSpy(...args),
    },
  },
}));

// Import AFTER mocks are declared.
import { useOfflineQuery } from "@/hooks/useOfflineQuery";
import { db } from "@/lib/offline/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(id: string, submittedAt?: string): FakeReport {
  return {
    id,
    checklist_id: "cl1",
    submitted_at: submittedAt ?? new Date().toISOString(),
    submitted_by: "user-1",
    answers: { q1: "a1" },
    local_id: null,
  };
}

function resetMocks() {
  bulkPutSpy.mockReset().mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useOfflineQuery", () => {
  beforeEach(() => {
    resetMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: Dexie has 3 items, fetcher resolves with same 3
  //         → returns data immediately, isLoading false
  // -------------------------------------------------------------------------
  it("returns live Dexie data immediately; isLoading false when Dexie is non-empty", async () => {
    const items = [makeReport("r1"), makeReport("r2"), makeReport("r3")];

    // useLiveQuery resolves immediately with 3 items (non-empty → not loading)
    mockUseLiveQuery.mockImplementation(
      (querier: () => Promise<FakeReport[]>) => {
        // Simulate useLiveQuery: call the querier to register, return items
        void querier();
        return items;
      },
    );

    const fetcher = vi.fn().mockResolvedValue(items);

    const { result } = renderHook(() =>
      useOfflineQuery<FakeReport>({
        table: "dailyReports" as never,
        filter: () => true,
        fetcher,
        staleTime: 5 * 60 * 1000,
      }),
    );

    // Data is immediately available from Dexie (rawLive is non-undefined & non-empty)
    expect(result.current.data).toHaveLength(3);
    expect(result.current.isLoading).toBe(false);

    // Wait for fetcher to be called and bulkPut to be invoked
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(bulkPutSpy).toHaveBeenCalledWith(items);
    });
  });

  // -------------------------------------------------------------------------
  // Test 2: Dexie empty, fetcher pending → isLoading true.
  //         After fetcher resolves with 2 items → bulkPut called, isLoading false.
  // -------------------------------------------------------------------------
  it("shows isLoading=true while Dexie is empty and fetch is pending; clears after resolve", async () => {
    // useLiveQuery initially returns an empty array (Dexie is empty, db initialised)
    mockUseLiveQuery.mockImplementation(
      (querier: () => Promise<FakeReport[]>) => {
        void querier();
        return [];
      },
    );

    let resolveFetcher!: (value: FakeReport[]) => void;
    const pendingPromise = new Promise<FakeReport[]>((resolve) => {
      resolveFetcher = resolve;
    });
    const fetcher = vi.fn().mockReturnValue(pendingPromise);

    const { result } = renderHook(() =>
      useOfflineQuery<FakeReport>({
        table: "dailyReports" as never,
        filter: () => true,
        fetcher,
        staleTime: 5 * 60 * 1000,
      }),
    );

    // While Dexie is empty and fetcher hasn't resolved: isLoading = true
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);

    // Resolve the fetcher with 2 items
    const newItems = [makeReport("r1"), makeReport("r2")];
    resolveFetcher(newItems);

    // After fetcher resolves: bulkPut called with the 2 items
    await waitFor(() => {
      expect(bulkPutSpy).toHaveBeenCalledWith(newItems);
    });

    // isLoading becomes false once fetchAttemptedRef is set
    // (the live query update would be triggered separately by Dexie, but
    // since our mock doesn't re-render, we check isLoading via fetchAttempted)
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Test 3: Dexie has 1 item, fetcher resolves with 2 fresher items
  //         → bulkPut called with the 2 items
  // -------------------------------------------------------------------------
  it("calls bulkPut with fresher server items when fetcher returns more than Dexie", async () => {
    const existing = [makeReport("r1", "2026-01-01T00:00:00.000Z")];

    mockUseLiveQuery.mockImplementation(
      (querier: () => Promise<FakeReport[]>) => {
        void querier();
        return existing;
      },
    );

    const fresherItems = [
      makeReport("r1", "2026-03-01T00:00:00.000Z"),
      makeReport("r2", "2026-03-15T00:00:00.000Z"),
    ];
    const fetcher = vi.fn().mockResolvedValue(fresherItems);

    renderHook(() =>
      useOfflineQuery<FakeReport>({
        table: "dailyReports" as never,
        filter: () => true,
        fetcher,
        staleTime: 5 * 60 * 1000,
      }),
    );

    await waitFor(() => {
      expect(bulkPutSpy).toHaveBeenCalledWith(fresherItems);
    });

    // bulkPut receives the 2 fresher items (upsert idempotency handled by Dexie)
    expect(bulkPutSpy).toHaveBeenCalledTimes(1);
    const called = bulkPutSpy.mock.calls[0]![0] as FakeReport[];
    expect(called).toHaveLength(2);
    expect(called.find((r) => r.id === "r2")).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Test 4: Offline (fetcher rejects) → error set, data still reflects
  //         Dexie value, isStale true
  // -------------------------------------------------------------------------
  it("sets error state when fetcher rejects; still returns Dexie data; isStale=true", async () => {
    const dexieItem = makeReport("cached-1");

    mockUseLiveQuery.mockImplementation(
      (querier: () => Promise<FakeReport[]>) => {
        void querier();
        return [dexieItem];
      },
    );

    const boom = new Error("Network offline");
    const fetcher = vi.fn().mockRejectedValue(boom);

    const { result } = renderHook(() =>
      useOfflineQuery<FakeReport>({
        table: "dailyReports" as never,
        filter: () => true,
        fetcher,
        staleTime: 5 * 60 * 1000,
      }),
    );

    // Should still show the cached Dexie item
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0]!.id).toBe("cached-1");

    // Wait for error to be captured
    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });

    expect(result.current.error?.message).toBe("Network offline");

    // isStale = true because lastFetchedAt was never set (fetch failed)
    expect(result.current.isStale).toBe(true);

    // bulkPut was never called (fetch failed before it could write)
    expect(bulkPutSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 5: refetch() called → fetcher called again regardless of staleTime
  // -------------------------------------------------------------------------
  it("calls fetcher again on refetch() regardless of staleTime", async () => {
    const items = [makeReport("r1")];

    mockUseLiveQuery.mockImplementation(
      (querier: () => Promise<FakeReport[]>) => {
        void querier();
        return items;
      },
    );

    const fetcher = vi.fn().mockResolvedValue(items);

    const { result } = renderHook(() =>
      useOfflineQuery<FakeReport>({
        table: "dailyReports" as never,
        filter: () => true,
        fetcher,
        // Very long staleTime so isStale would normally be false
        staleTime: 60 * 60 * 1000,
      }),
    );

    // Initial fetch on mount
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    // Call refetch explicitly
    result.current.refetch();

    // Should have been called a second time regardless of staleTime
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Silence the db mock warning (db is imported for type reference only in tests)
// ---------------------------------------------------------------------------
// Ensure the mock is set up before any describe block runs.
void db;
