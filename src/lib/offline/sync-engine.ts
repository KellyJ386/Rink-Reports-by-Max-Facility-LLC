"use client";

import { db, type QueuedRecord } from "@/lib/offline/db";

/**
 * Background sync worker. Never blocks the UI. Per CLAUDE.md Rule 3,
 * the form submit path is:
 *
 *   await db.queue.add(record)   // local first
 *   showSuccess()                 // immediately
 *   nudgeSync()                   // best-effort, fire-and-forget
 *
 * A queued record is "pending" iff `syncedAt === 0`. Success sets
 * `syncedAt` to the wall-clock ms and `serverId` to the assigned id.
 * Failure bumps `retryCount` and stores `lastError`.
 *
 * Phase 0 ships only the queue plumbing. Per-module write reducers
 * are added in their respective phases.
 */

let inFlight: Promise<void> | null = null;

interface SyncResultRow {
  localId: string;
  serverId?: string | null;
  error?: string | null;
}

interface SyncResponseBody {
  ok: boolean;
  results?: SyncResultRow[];
  error?: string;
}

async function flush(): Promise<void> {
  const pending = await db.queue.where("syncedAt").equals(0).toArray();
  if (pending.length === 0) return;

  // Upload only the fields the server is allowed to see. `syncedAt`,
  // `serverId`, and `lastError` are server-controlled and must not
  // be set by the client.
  const envelope = {
    writes: pending.map((r) => ({
      localId: r.localId,
      table: r.table,
      payload: r.payload,
      retryCount: r.retryCount,
    })),
  };

  let res: Response;
  try {
    res = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "network";
    await markFailed(pending, message);
    return;
  }

  if (!res.ok) {
    await markFailed(pending, `HTTP ${res.status}`);
    return;
  }

  const body = (await res.json()) as SyncResponseBody;
  const byId = new Map<string, SyncResultRow>();
  for (const row of body.results ?? []) {
    byId.set(row.localId, row);
  }

  const now = Date.now();
  const updated: QueuedRecord[] = pending.map((r) => {
    const result = byId.get(r.localId);
    if (!result || result.error) {
      return {
        ...r,
        retryCount: r.retryCount + 1,
        lastError: result?.error ?? "no result",
      };
    }
    return {
      ...r,
      syncedAt: now,
      serverId: result.serverId ?? null,
      lastError: undefined,
    };
  });

  // If the server returned no per-record results at all (Phase 0
  // sync route is a stub), treat the whole batch as acknowledged so
  // local development does not loop forever on the same rows.
  if ((body.results ?? []).length === 0 && body.ok) {
    const acked: QueuedRecord[] = pending.map((r) => ({
      ...r,
      syncedAt: now,
    }));
    await db.queue.bulkPut(acked);
    return;
  }

  await db.queue.bulkPut(updated);
}

async function markFailed(
  records: ReadonlyArray<QueuedRecord>,
  reason: string,
): Promise<void> {
  await db.queue.bulkPut(
    records.map((r): QueuedRecord => ({
      ...r,
      retryCount: r.retryCount + 1,
      lastError: reason,
    })),
  );
}

/**
 * Best-effort, fire-and-forget. Safe to call from anywhere.
 * Multiple concurrent callers share the same in-flight pass.
 */
export function nudgeSync(): void {
  if (inFlight) return;
  inFlight = flush().finally(() => {
    inFlight = null;
  });
}

/**
 * Start a periodic background pass. Call once from the providers tree.
 * Returns a teardown fn for the React effect.
 */
export function startSyncEngine(intervalMs = 15_000): () => void {
  if (typeof window === "undefined") return () => {};
  const tick = () => nudgeSync();
  tick();
  const id = window.setInterval(tick, intervalMs);
  const onOnline = () => nudgeSync();
  window.addEventListener("online", onOnline);
  return () => {
    window.clearInterval(id);
    window.removeEventListener("online", onOnline);
  };
}
