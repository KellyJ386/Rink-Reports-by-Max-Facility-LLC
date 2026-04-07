"use client";

import { useCallback, useEffect, useState } from "react";

import { trpc } from "@/lib/trpc";
import { db, type QueuedRecord } from "@/lib/offline/db";
import {
  DailyReportSubmissionInput,
  type Checklist,
  type DailyReportAnswers,
} from "@/modules/daily-reports/schema";
import { useOfflineQuery } from "@/hooks/useOfflineQuery";
import type { RecentSubmission } from "@/server/trpc/routers/daily-reports";

/**
 * Recent submissions panel for the active facility.
 *
 * DATA LAYER (refactored to use useOfflineQuery):
 *   - Reads server-synced rows from the Dexie `dailyReports` cache via
 *     `useOfflineQuery`. This follows the Dexie-first pattern (CLAUDE.md Rule 3):
 *     the component is always backed by local data and the network pull is
 *     an upgrade that happens in the background.
 *   - The fetcher calls `dailyReports.pull` (the same pull procedure that
 *     `usePullChannel` uses) to refresh the cache.
 *   - When `isStale === true`, a small "cached" badge is shown next to the
 *     heading so staff know they may be viewing older data.
 *   - When `error !== null` AND the cache is empty, an error banner is shown
 *     instead of the empty state.
 *
 * PENDING QUEUE:
 *   - In addition to the Dexie cache, we still read the local queue for
 *     submissions that have been saved offline but not yet acknowledged.
 *     These are shown with a "Pending sync" badge (unchanged from before).
 *
 * NOTE: `"dailyReports"` is the Dexie table name added by Agent 1
 * (phase-b/dexie-schema). On this branch that table does not yet exist in
 * the db.ts type, so we cast via `unknown` when passing the table name to
 * `useOfflineQuery`. The cast is safe because `useOfflineQuery` already
 * accesses Dexie through `(db as unknown as Record<...>)[table]`.
 */

interface RecentSubmissionsProps {
  /** Used to look up checklist names without an extra query. */
  checklists: readonly Checklist[];
}

interface PendingRow {
  localId: string;
  checklist_id: string;
  submitted_at: string;
  answers: DailyReportAnswers;
  retryCount: number;
  lastError?: string;
}

function pendingRowsFromQueue(rows: QueuedRecord[]): PendingRow[] {
  const out: PendingRow[] = [];
  for (const row of rows) {
    if (row.table !== "daily_reports") continue;
    const parsed = DailyReportSubmissionInput.safeParse(row.payload);
    if (!parsed.success) continue;
    out.push({
      localId: row.localId,
      checklist_id: parsed.data.checklist_id,
      submitted_at: parsed.data.submitted_at,
      answers: parsed.data.answers,
      retryCount: row.retryCount,
      lastError: row.lastError,
    });
  }
  return out;
}

export function RecentSubmissions({ checklists }: RecentSubmissionsProps) {
  const utils = trpc.useUtils();

  // Build a stable fetcher ref so useOfflineQuery sees a stable callback.
  // Fetches the last 14 days of daily reports from the server.
  const fetcher = useCallback(async (): Promise<RecentSubmission[]> => {
    const since = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();
    return utils.dailyReports.pull.fetch({ since });
  }, [utils]);

  // 30-day cutoff for the local filter.
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: serverRows, isLoading, isStale, error } = useOfflineQuery<RecentSubmission>({
    // Agent 1 adds "dailyReports" to db.ts in phase-b/dexie-schema.
    // Cast to bypass the current branch's keyof constraint.
    table: "dailyReports" as unknown as keyof typeof db,
    filter: (r: RecentSubmission) =>
      (r.submitted_at ?? "") >= thirtyDaysAgo,
    sort: (a: RecentSubmission, b: RecentSubmission) =>
      (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""),
    fetcher,
    staleTime: 5 * 60 * 1000,
  });

  // Pending queue — unsynced offline writes.
  const [pending, setPending] = useState<PendingRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const queued = await db.queue
        .where("table")
        .equals("daily_reports")
        .and((r) => r.syncedAt === 0)
        .toArray();
      if (cancelled) return;
      setPending(pendingRowsFromQueue(queued));
    }

    refresh();
    const id = window.setInterval(refresh, 2000);
    const onOnline = () => { void refresh(); };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // Build a name lookup for checklist display.
  const nameById = new Map(checklists.map((c) => [c.id, c.name]));

  // Hide any server row whose local_id is still in the pending set,
  // so a row that races (server returns before the queue refresh)
  // does not appear twice.
  const pendingLocalIds = new Set(pending.map((p) => p.localId));
  const dedupedServer = serverRows.filter(
    (r) => !r.local_id || !pendingLocalIds.has(r.local_id),
  );

  if (isLoading) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <h2 className="text-xl font-semibold text-white">Recent submissions</h2>
        <p className="mt-2 text-sm text-grey">Loading…</p>
      </section>
    );
  }

  if (error !== null && dedupedServer.length === 0 && pending.length === 0) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <h2 className="text-xl font-semibold text-white">Recent submissions</h2>
        <p className="mt-2 text-sm text-red" role="alert">
          {error.message}
        </p>
      </section>
    );
  }

  const isEmpty = pending.length === 0 && dedupedServer.length === 0;

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold text-white">Recent submissions</h2>
        {isStale && (
          <span className="rounded border border-grey/40 px-1.5 py-0.5 text-xs text-grey">
            cached
          </span>
        )}
      </div>

      {isEmpty ? (
        <p className="mt-2 text-sm text-grey">
          No submissions yet. Fill out a checklist above to get started.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-grey/20">
          {pending.map((row) => (
            <li
              key={`pending:${row.localId}`}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <div className="flex flex-col">
                <span className="text-white">
                  {nameById.get(row.checklist_id) ?? "Unknown checklist"}
                </span>
                <span className="text-grey">
                  {formatTimestamp(row.submitted_at)} ·{" "}
                  {Object.keys(row.answers).length} answer
                  {Object.keys(row.answers).length === 1 ? "" : "s"}
                </span>
                {row.lastError && (
                  <span className="text-red">
                    Sync error: {row.lastError} (retry {row.retryCount})
                  </span>
                )}
              </div>
              <span className="rounded border border-yellow/60 px-2 py-0.5 text-xs text-yellow">
                Pending sync
              </span>
            </li>
          ))}
          {dedupedServer.map((row) => (
            <li
              key={`server:${row.id}`}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <div className="flex flex-col">
                <span className="text-white">
                  {nameById.get(row.checklist_id) ?? "Unknown checklist"}
                </span>
                <span className="text-grey">
                  {formatTimestamp(row.submitted_at)} ·{" "}
                  {Object.keys(row.answers).length} answer
                  {Object.keys(row.answers).length === 1 ? "" : "s"}
                </span>
              </div>
              <span className="rounded border border-grey/40 px-2 py-0.5 text-xs text-grey">
                Synced
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
