"use client";

import Dexie, { type EntityTable } from "dexie";

/**
 * Offline-first store. CLAUDE.md Rule 3:
 *   form submit → write here → show success → nudge sync engine.
 *
 * Module-specific tables are added in their own phase migrations.
 * Phase 0 only ships the cross-cutting tables: the pending-writes
 * queue used by every module, and a config cache for when the
 * client is offline.
 */

export type PendingWriteStatus = "pending" | "syncing" | "done" | "error";

export interface PendingWrite {
  id: string;
  module: string;
  payload: unknown;
  createdAt: number;
  status: PendingWriteStatus;
  lastError?: string;
}

export interface CachedConfigEntry {
  key: string; // `${module}:${key}`
  module: string;
  value: unknown;
  updatedAt: number;
}

export class RinkReportsDB extends Dexie {
  pendingWrites!: EntityTable<PendingWrite, "id">;
  cachedConfig!: EntityTable<CachedConfigEntry, "key">;

  constructor() {
    super("rink-reports");
    this.version(1).stores({
      pendingWrites: "id, module, status, createdAt",
      cachedConfig: "key, module, updatedAt",
    });
  }
}

export const db = new RinkReportsDB();
