"use client";

import { db, type PendingWrite } from "@/lib/offline/db";

/**
 * Background sync worker. Never blocks the UI. Per CLAUDE.md Rule 3,
 * the form submit path is:
 *
 *   await db.pendingWrites.add(write)   // local first
 *   showSuccess()                        // immediately
 *   nudgeSync()                          // best-effort, fire-and-forget
 *
 * Phase 0 ships only the queue plumbing. Per-module reducers are
 * added in their respective phases.
 */

let inFlight: Promise<void> | null = null;

async function flush(): Promise<void> {
  const pending = await db.pendingWrites
    .where("status")
    .equals("pending")
    .toArray();

  if (pending.length === 0) {
    return;
  }

  // Mark optimistically so a re-entrant nudge does not double-send.
  await db.pendingWrites.bulkPut(
    pending.map((w): PendingWrite => ({ ...w, status: "syncing" })),
  );

  let res: Response;
  try {
    res = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ writes: pending }),
    });
  } catch (err) {
    await db.pendingWrites.bulkPut(
      pending.map((w): PendingWrite => ({
        ...w,
        status: "pending",
        lastError: err instanceof Error ? err.message : "network",
      })),
    );
    return;
  }

  if (!res.ok) {
    await db.pendingWrites.bulkPut(
      pending.map((w): PendingWrite => ({
        ...w,
        status: "error",
        lastError: `HTTP ${res.status}`,
      })),
    );
    return;
  }

  await db.pendingWrites.bulkPut(
    pending.map((w): PendingWrite => ({ ...w, status: "done" })),
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
