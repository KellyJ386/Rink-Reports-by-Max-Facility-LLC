import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Control useLiveQuery return value per test
const useLiveQueryMock = vi.fn();

vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (...args: Parameters<typeof useLiveQueryMock>) =>
    useLiveQueryMock(...args),
}));

const toastShowMock = vi.fn();

vi.mock("@/lib/toast", () => ({
  show: (...args: unknown[]) => toastShowMock(...args),
}));

// Mock db so the hook can be imported without a real IndexedDB
vi.mock("@/lib/offline/db", () => ({
  db: {
    queue: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

import { useSyncStatus } from "@/hooks/useSyncStatus";

beforeEach(() => {
  useLiveQueryMock.mockReset();
  toastShowMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSyncStatus", () => {
  it("pendingCount reflects the value useLiveQuery returns", () => {
    useLiveQueryMock.mockReturnValue(7);

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.pendingCount).toBe(7);
  });

  it("dispatching rr:sync-ack updates lastSyncedAt and writes to localStorage", () => {
    useLiveQueryMock.mockReturnValue(0);

    const { result } = renderHook(() => useSyncStatus());

    expect(result.current.lastSyncedAt).toBeNull();

    const isoString = "2026-04-07T12:34:56.000Z";

    act(() => {
      window.dispatchEvent(
        new CustomEvent("rr:sync-ack", {
          detail: { syncedAt: isoString },
        }),
      );
    });

    expect(result.current.lastSyncedAt).toBeInstanceOf(Date);
    expect(result.current.lastSyncedAt!.toISOString()).toBe(isoString);
    expect(localStorage.getItem("rr_last_synced_at")).toBe(isoString);
  });

  it("calls toast.show when pendingCount transitions from >0 to 0", async () => {
    // Start with 3 pending
    useLiveQueryMock.mockReturnValue(3);

    const { rerender } = renderHook(() => useSyncStatus());

    // Now simulate count dropping to 0
    useLiveQueryMock.mockReturnValue(0);

    await act(async () => {
      rerender();
      // Allow dynamic import microtask to settle
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toastShowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "All changes synced ✓",
        kind: "success",
      }),
    );
  });
});
