"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/offline/db";
import { useEffect, useState, useRef } from "react";

export interface SyncStatusResult {
  pendingCount: number;
  lastSyncedAt: Date | null;
}

function readLastSyncedAt(): Date | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("rr_last_synced_at");
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function useSyncStatus(): SyncStatusResult {
  const pendingCount = useLiveQuery(
    () => db.queue.where("syncedAt").equals(0).count(),
    [],
    0,
  );

  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(
    readLastSyncedAt,
  );

  const prevCountRef = useRef<number>(pendingCount ?? 0);

  useEffect(() => {
    function handleAck(e: Event) {
      const detail = (e as CustomEvent<{ syncedAt: string }>).detail;
      const d = new Date(detail.syncedAt);
      setLastSyncedAt(d);
      localStorage.setItem("rr_last_synced_at", detail.syncedAt);
    }

    window.addEventListener("rr:sync-ack", handleAck);
    return () => {
      window.removeEventListener("rr:sync-ack", handleAck);
    };
  }, []);

  useEffect(() => {
    const prev = prevCountRef.current;
    const current = pendingCount ?? 0;

    if (prev > 0 && current === 0) {
      void import("@/lib/toast").then((mod) => {
        mod.show({
          message: "All changes synced \u2713",
          kind: "success",
          durationMs: 3000,
        });
      });
    }

    prevCountRef.current = current;
  }, [pendingCount]);

  return { pendingCount: pendingCount ?? 0, lastSyncedAt };
}
