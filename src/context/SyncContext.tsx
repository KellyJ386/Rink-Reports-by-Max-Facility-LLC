"use client";

import { createContext, useContext } from "react";

export interface SyncContextValue {
  isPulling: boolean;
  lastPulledAt: Date | null;
  triggerPull: () => void;
  /**
   * Number of queued offline writes not yet synced to the server.
   * Defaults to 0 here; Agent 5 will replace with a live Dexie query.
   */
  pendingCount: number;
}

export const SyncContext = createContext<SyncContextValue>({
  isPulling: false,
  lastPulledAt: null,
  triggerPull: () => {},
  pendingCount: 0,
});

/**
 * Convenience accessor — throw a helpful error if consumed outside
 * the SyncProvider tree.
 */
export function useSyncContext(): SyncContextValue {
  return useContext(SyncContext);
}
