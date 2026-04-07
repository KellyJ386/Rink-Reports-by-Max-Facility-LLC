"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "@/lib/offline/db";

// ---------------------------------------------------------------------------
// Sentry — optional dynamic import so tree-shaking isn't blocked
// ---------------------------------------------------------------------------

async function reportError(err: unknown): Promise<void> {
  console.error("[useOfflineQuery]", err);
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(err);
  } catch {
    // Sentry not available; already logged above
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DexieTable = keyof typeof db;

export interface OfflineQueryOptions<T> {
  /** Which Dexie table to read from. Must be one of the module read caches. */
  table: DexieTable;
  /** Filter applied to the live Dexie result set. */
  filter: (item: T) => boolean;
  /** Optional sort applied after filter. */
  sort?: (a: T, b: T) => number;
  /** Network refresh — typically a tRPC pull procedure call. */
  fetcher: () => Promise<T[]>;
  /** Stale window in ms. Default 5 minutes. */
  staleTime?: number;
}

export interface OfflineQueryResult<T> {
  data: T[];
  isLoading: boolean;
  isStale: boolean;
  error: Error | null;
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEFAULT_STALE_TIME = 5 * 60 * 1000; // 5 minutes

/**
 * useOfflineQuery — Dexie-first, network-upgrade read hook.
 *
 * Flow:
 *   1. Returns live Dexie data immediately (via useLiveQuery).
 *   2. On mount (and on refetch), calls `fetcher()` to refresh from network.
 *   3. On fetcher success: bulkPuts results into Dexie → live query updates.
 *   4. On fetcher failure: captures error, continues rendering Dexie data.
 *
 * Loading state rules:
 *   - `isLoading` is true ONLY while Dexie is empty AND the first fetch
 *     hasn't resolved yet AND no error has been set.
 *
 * Stale state rules:
 *   - `isStale` is true when lastFetchedAt is null OR
 *     (Date.now() - lastFetchedAt) > staleTime.
 */
export function useOfflineQuery<T>(
  options: OfflineQueryOptions<T>,
): OfflineQueryResult<T> {
  const {
    table,
    filter,
    sort,
    fetcher,
    staleTime = DEFAULT_STALE_TIME,
  } = options;

  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Track whether the initial fetch has ever been attempted (regardless of
  // success/failure). Used to determine isLoading.
  const fetchAttemptedRef = useRef(false);

  // AbortController to cancel state updates on unmount.
  const controllerRef = useRef<AbortController | null>(null);

  // Keep a stable ref to fetcher so the effect dep array doesn't change.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // ---------------------------------------------------------------------------
  // Live Dexie read
  // ---------------------------------------------------------------------------

  // useLiveQuery returns `undefined` until Dexie has loaded (async init).
  // Once loaded it returns the full array (possibly empty).
  const rawLive = useLiveQuery(
    () => (db as unknown as Record<string, { toArray: () => Promise<T[]> }>)[table].toArray(),
    [table],
  );

  // Apply filter + optional sort in a memo so we don't recompute on every
  // render unless rawLive, filter, or sort actually changes.
  const liveData = useMemo<T[]>(() => {
    if (rawLive === undefined) return [];
    const filtered = rawLive.filter(filter);
    if (sort) {
      return [...filtered].sort(sort);
    }
    return filtered;
  }, [rawLive, filter, sort]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const isStale =
    lastFetchedAt === null ||
    Date.now() - lastFetchedAt.getTime() > staleTime;

  // Loading: Dexie hasn't resolved yet (rawLive === undefined)
  //          OR (Dexie resolved empty AND no fetch has resolved AND no error yet)
  const isLoading =
    rawLive === undefined ||
    (rawLive.length === 0 && !fetchAttemptedRef.current && error === null);

  // ---------------------------------------------------------------------------
  // Network fetch logic
  // ---------------------------------------------------------------------------

  const runFetch = useCallback((signal: AbortSignal): void => {
    void (async () => {
      try {
        const results = await fetcherRef.current();
        if (signal.aborted) return;
        await (
          db as unknown as Record<string, { bulkPut: (r: T[]) => Promise<unknown> }>
        )[table].bulkPut(results);
        if (signal.aborted) return;
        fetchAttemptedRef.current = true;
        setLastFetchedAt(new Date());
        setError(null);
      } catch (err) {
        if (signal.aborted) return;
        fetchAttemptedRef.current = true;
        const asError = err instanceof Error ? err : new Error(String(err));
        setError(asError);
        void reportError(asError);
      }
    })();
  }, [table]);

  // Boot-time fetch on mount.
  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    runFetch(controller.signal);
    return () => {
      controller.abort();
      controllerRef.current = null;
    };
  }, [runFetch]);

  // ---------------------------------------------------------------------------
  // refetch
  // ---------------------------------------------------------------------------

  const refetch = useCallback((): void => {
    // Cancel any in-flight fetch and start a fresh one.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    runFetch(controller.signal);
  }, [runFetch]);

  return {
    data: liveData,
    isLoading,
    isStale,
    error,
    refetch,
  };
}
