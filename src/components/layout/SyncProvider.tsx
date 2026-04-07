"use client";

import type { ReactNode } from "react";

import { usePullChannel } from "@/hooks/usePullChannel";
import { SyncContext } from "@/context/SyncContext";

interface SyncProviderProps {
  children: ReactNode;
}

/**
 * Wraps the dashboard shell with SyncContext.
 *
 * - Runs the pull channel (boot pull + online-event pull).
 * - Exposes isPulling, lastPulledAt, and triggerPull to the whole
 *   dashboard tree via SyncContext.
 * - pendingCount defaults to 0; Agent 5 will replace it with a live
 *   Dexie liveQuery count of pending queue items.
 */
export function SyncProvider({ children }: SyncProviderProps) {
  const { isPulling, lastPulledAt, triggerPull } = usePullChannel();

  return (
    <SyncContext.Provider
      value={{
        isPulling,
        lastPulledAt,
        triggerPull,
        pendingCount: 0,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}
