"use client";

import { useEffect, useState } from "react";

import { trpc } from "@/lib/trpc";
import { db, type QueuedRecord } from "@/lib/offline/db";
import {
  DailyReportSubmissionInput,
  type Checklist,
  type DailyReportAnswers,
} from "@/modules/daily-reports/schema";

/**
 * Recent submissions panel for the active facility.
 *
 * Server rows come from `dailyReports.listRecent`. We additionally
 * read the local Dexie queue to surface anything that has been saved
 * locally but not yet acknowledged by the server. Pending rows get a
 * "Pending sync" badge so the user can see their work is captured
 * even before the network round-trip completes.
 *
 * `dexie-react-hooks` is not in package.json, so we hand-roll a tiny
 * subscription: a 2-second interval plus a refresh on the `online`
 * event. The Dexie queue is small (one row per pending submission),
 * so this is cheap.
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
  const recent = trpc.dailyReports.listRecent.useQuery({ limit: 50 });
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
    const onOnline = () => refresh();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // Build a name lookup. Items are not needed here — the panel only
  // shows the checklist name + a timestamp + an answer count.
  const nameById = new Map(checklists.map((c) => [c.id, c.name]));

  const serverRows = recent.data ?? [];

  // Hide any server row whose local_id is still in the pending set,
  // so a row that races (server returns before the queue refresh)
  // does not appear twice.
  const pendingLocalIds = new Set(pending.map((p) => p.localId));
  const dedupedServer = serverRows.filter(
    (r) => !r.local_id || !pendingLocalIds.has(r.local_id),
  );

  if (recent.isLoading) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <h2 className="text-xl font-semibold text-white">Recent submissions</h2>
        <p className="mt-2 text-sm text-grey">Loading…</p>
      </section>
    );
  }

  if (recent.error) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <h2 className="text-xl font-semibold text-white">Recent submissions</h2>
        <p className="mt-2 text-sm text-red" role="alert">
          {recent.error.message}
        </p>
      </section>
    );
  }

  const isEmpty = pending.length === 0 && dedupedServer.length === 0;

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Recent submissions</h2>

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
