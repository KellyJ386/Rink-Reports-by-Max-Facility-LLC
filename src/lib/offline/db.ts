"use client";

import Dexie, { type EntityTable } from "dexie";

/**
 * Offline-first store. CLAUDE.md Rule 3:
 *   form submit → write here → show success → nudge sync engine.
 *
 * Module-specific tables are added in their own phase migrations.
 * Phase 0 only ships the cross-cutting tables: the queued-write
 * store used by every module, and a config cache for when the
 * client is offline.
 */

/**
 * One queued offline write. Modules push these into `db.queue`
 * after the local Dexie write succeeds; the sync engine drains the
 * queue against `/api/sync`.
 *
 * Note: `facility_id` is intentionally absent from this type. The
 * server resolves the caller's facility from `user_profiles` —
 * see CLAUDE.md Rule 1.
 */
export interface QueuedRecord {
  /** Client-generated UUID; primary key. */
  localId: string;
  /** Logical destination ("daily_reports", "incidents", ...). */
  table: string;
  /** Row to write. Opaque to the queue; never contains facility_id. */
  payload: unknown;
  /**
   * Sync timestamp in ms. `0` means "still pending" (Dexie cannot
   * index null, so we use 0 as the pending sentinel and any value
   * `> 0` as the wall-clock time the server acknowledged the write).
   */
  syncedAt: number;
  /** Server-assigned id once the write has landed; null until then. */
  serverId: string | null;
  /** Number of replay attempts so far. */
  retryCount: number;
  /** Most recent failure message, if any. */
  lastError?: string;
}

export interface CachedConfigEntry {
  key: string; // `${module}:${key}`
  module: string;
  value: unknown;
  updatedAt: number;
}

export class RinkReportsDB extends Dexie {
  queue!: EntityTable<QueuedRecord, "localId">;
  cachedConfig!: EntityTable<CachedConfigEntry, "key">;

  constructor() {
    super("rink-reports");
    this.version(1).stores({
      queue: "localId, table, syncedAt, retryCount",
      cachedConfig: "key, module, updatedAt",
    });
  }
}

export const db = new RinkReportsDB();
