"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { trpc } from "@/lib/trpc";
import { db } from "@/lib/offline/db";
import type {
  CachedDailyReport,
  CachedIceOperation,
  CachedRefrigerationReading,
  CachedAirQualityReading,
  CachedIceDepthSession,
  CachedIncident,
} from "@/lib/offline/types";
import type { RecentSubmission as DailyReportRow } from "@/server/trpc/routers/daily-reports";
import type { RecentIceOperation as IceOperationRow } from "@/server/trpc/routers/ice-operations";
import type { RecentRefrigerationReading as RefrigerationRow } from "@/server/trpc/routers/refrigeration";
import type { RecentAirQualityReading as AirQualityRow } from "@/server/trpc/routers/air-quality";
import type { RecentIceDepthSession as IceDepthRow } from "@/server/trpc/routers/ice-depth";
import type { RecentIncident as IncidentRow } from "@/server/trpc/routers/incidents";

// ---------------------------------------------------------------------------
// Inline adapters — map snake_case server row → cached interface
// ---------------------------------------------------------------------------

function adaptDailyReport(row: DailyReportRow): CachedDailyReport {
  return {
    id: row.id,
    checklist_id: row.checklist_id,
    submitted_at: row.submitted_at,
    submitted_by: row.submitted_by,
    answers: row.answers as Record<string, unknown>,
    local_id: row.local_id,
  };
}

function adaptIceOperation(row: IceOperationRow): CachedIceOperation {
  return {
    id: row.id,
    operation_type_id: row.operation_type_id,
    equipment_id: row.equipment_id,
    submitted_at: row.submitted_at,
    submitted_by: row.submitted_by,
    answers: row.answers as Record<string, unknown>,
    local_id: row.local_id,
  };
}

function adaptRefrigerationReading(
  row: RefrigerationRow,
): CachedRefrigerationReading {
  return {
    id: row.id,
    submitted_at: row.submitted_at,
    submitted_by: row.submitted_by,
    brine_supply: row.brine_supply,
    brine_return: row.brine_return,
    brine_flow: row.brine_flow,
    ice_surface_temp: row.ice_surface_temp,
    condenser_temp: row.condenser_temp,
    compressor_readings: row.compressor_readings as unknown[],
    local_id: row.local_id,
  };
}

function adaptAirQualityReading(row: AirQualityRow): CachedAirQualityReading {
  return {
    id: row.id,
    submitted_at: row.submitted_at,
    submitted_by: row.submitted_by,
    co_ppm: row.co_ppm,
    no2_ppm: row.no2_ppm,
    notes: row.notes,
    tier: row.tier,
    local_id: row.local_id,
  };
}

function adaptIceDepthSession(row: IceDepthRow): CachedIceDepthSession {
  return {
    id: row.id,
    template_id: row.template_id,
    submitted_at: row.submitted_at,
    submitted_by: row.submitted_by,
    status: row.status,
    resurfacing_status: row.resurfacing_status,
    notes: row.notes,
    measurements: row.measurements as Record<string, unknown>,
    local_id: row.local_id,
  };
}

function adaptIncident(row: IncidentRow): CachedIncident {
  return {
    id: row.id,
    kind: row.kind,
    occurred_at: row.occurred_at,
    location: row.location,
    incident_type: row.incident_type,
    description: row.description,
    data: row.data as Record<string, unknown> | null,
    submitted_at: row.submitted_at,
    submitted_by: row.submitted_by,
    local_id: row.local_id,
  };
}

// ---------------------------------------------------------------------------
// Sentry — optional dynamic import so tree-shaking isn't blocked
// ---------------------------------------------------------------------------

async function reportError(err: unknown): Promise<void> {
  console.error("[usePullChannel]", err);
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(err);
  } catch {
    // Sentry not available; already logged above
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface PullChannelState {
  isPulling: boolean;
  lastPulledAt: Date | null;
  error: Error | null;
  triggerPull: () => void;
}

/**
 * usePullChannel — boot-time and online-event-driven pull of all 6
 * module tables into Dexie.
 *
 * - Calls pullAll() once on mount.
 * - Re-calls on window `online` (debounced 2000ms).
 * - AbortController lets us bail between awaits on unmount.
 * - Each module's pull is isolated in try/catch — one failure does not
 *   abort the others.
 * - Pull failures are silent to the user (logged + Sentry only).
 */
export function usePullChannel(): PullChannelState {
  const [isPulling, setIsPulling] = useState(false);
  const [lastPulledAt, setLastPulledAt] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Store utils in a ref so pullAll doesn't need it in its dep array.
  // trpc.useUtils() is stable within a React Query provider but the
  // returned object reference can change; a ref lets us always use the
  // latest without re-creating pullAll on every render.
  const utils = trpc.useUtils();
  const utilsRef = useRef(utils);
  utilsRef.current = utils;

  // Keep a ref to the current AbortController so unmount can cancel.
  const controllerRef = useRef<AbortController | null>(null);
  // Debounce timer for the online event.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pullAll = useCallback(async (signal: AbortSignal): Promise<void> => {
    const since = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();

    setIsPulling(true);
    setError(null);

    const u = utilsRef.current;

    // --- dailyReports ---
    try {
      if (!signal.aborted) {
        const rows = await u.dailyReports.pull.fetch({ since });
        if (!signal.aborted) {
          // Agent 1 adds the `dailyReports` table to db in parallel.
          // Cast through unknown so TypeScript doesn't fail when the
          // table doesn't exist in db yet; the runtime will surface an
          // error if the table is missing, which is correct behaviour.
          await (
            db as unknown as {
              dailyReports: {
                bulkPut: (r: CachedDailyReport[]) => Promise<unknown>;
              };
            }
          ).dailyReports.bulkPut(rows.map(adaptDailyReport));
        }
      }
    } catch (err) {
      void reportError(err);
      if (err instanceof Error) setError(err);
    }

    if (signal.aborted) {
      setIsPulling(false);
      return;
    }

    // --- iceOperations ---
    try {
      if (!signal.aborted) {
        const rows = await u.iceOperations.pull.fetch({ since });
        if (!signal.aborted) {
          await (
            db as unknown as {
              iceOperations: {
                bulkPut: (r: CachedIceOperation[]) => Promise<unknown>;
              };
            }
          ).iceOperations.bulkPut(rows.map(adaptIceOperation));
        }
      }
    } catch (err) {
      void reportError(err);
      if (err instanceof Error) setError(err);
    }

    if (signal.aborted) {
      setIsPulling(false);
      return;
    }

    // --- refrigeration ---
    try {
      if (!signal.aborted) {
        const rows = await u.refrigeration.pull.fetch({ since });
        if (!signal.aborted) {
          await (
            db as unknown as {
              refrigerationReadings: {
                bulkPut: (
                  r: CachedRefrigerationReading[],
                ) => Promise<unknown>;
              };
            }
          ).refrigerationReadings.bulkPut(rows.map(adaptRefrigerationReading));
        }
      }
    } catch (err) {
      void reportError(err);
      if (err instanceof Error) setError(err);
    }

    if (signal.aborted) {
      setIsPulling(false);
      return;
    }

    // --- airQuality ---
    try {
      if (!signal.aborted) {
        const rows = await u.airQuality.pull.fetch({ since });
        if (!signal.aborted) {
          await (
            db as unknown as {
              airQualityReadings: {
                bulkPut: (r: CachedAirQualityReading[]) => Promise<unknown>;
              };
            }
          ).airQualityReadings.bulkPut(rows.map(adaptAirQualityReading));
        }
      }
    } catch (err) {
      void reportError(err);
      if (err instanceof Error) setError(err);
    }

    if (signal.aborted) {
      setIsPulling(false);
      return;
    }

    // --- iceDepth ---
    try {
      if (!signal.aborted) {
        const rows = await u.iceDepth.pull.fetch({ since });
        if (!signal.aborted) {
          await (
            db as unknown as {
              iceDepthSessions: {
                bulkPut: (r: CachedIceDepthSession[]) => Promise<unknown>;
              };
            }
          ).iceDepthSessions.bulkPut(rows.map(adaptIceDepthSession));
        }
      }
    } catch (err) {
      void reportError(err);
      if (err instanceof Error) setError(err);
    }

    if (signal.aborted) {
      setIsPulling(false);
      return;
    }

    // --- incidents ---
    try {
      if (!signal.aborted) {
        const rows = await u.incidents.pull.fetch({ since });
        if (!signal.aborted) {
          await (
            db as unknown as {
              incidents: {
                bulkPut: (r: CachedIncident[]) => Promise<unknown>;
              };
            }
          ).incidents.bulkPut(rows.map(adaptIncident));
        }
      }
    } catch (err) {
      void reportError(err);
      if (err instanceof Error) setError(err);
    }

    if (!signal.aborted) {
      setIsPulling(false);
      setLastPulledAt(new Date());
    }
  }, []); // stable — reads utils via ref, no deps needed

  const triggerPull = useCallback((): void => {
    // Cancel any in-flight pull and start a fresh one.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    void pullAll(controller.signal);
  }, [pullAll]);

  // Boot-time pull on mount.
  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    void pullAll(controller.signal);

    return () => {
      controller.abort();
      controllerRef.current = null;
    };
  }, [pullAll]);

  // Online event pull (debounced 2000ms).
  useEffect(() => {
    const handleOnline = (): void => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        triggerPull();
      }, 2000);
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [triggerPull]);

  return { isPulling, lastPulledAt, error, triggerPull };
}
