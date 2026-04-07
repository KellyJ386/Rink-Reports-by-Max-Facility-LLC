"use client";

import { useEffect, useState } from "react";

import { trpc } from "@/lib/trpc";
import { db, type QueuedRecord } from "@/lib/offline/db";
import {
  IceOperationSubmissionInput,
  type Equipment,
  type IceOperationAnswers,
  type OperationType,
} from "@/modules/ice-operations/schema";

/**
 * Recent operations panel for the active facility.
 *
 * Server rows come from `iceOperations.listRecent`. We additionally
 * read the local Dexie queue to surface anything that has been saved
 * locally but not yet acknowledged by the server. Pending rows get a
 * "Pending sync" badge so the operator can see their work is captured
 * even before the network round-trip completes.
 */

interface RecentOperationsProps {
  operationTypes: readonly OperationType[];
  equipment: readonly Equipment[];
}

interface PendingRow {
  localId: string;
  operation_type_id: string;
  equipment_id: string;
  submitted_at: string;
  answers: IceOperationAnswers;
  retryCount: number;
  lastError?: string;
}

function pendingRowsFromQueue(rows: QueuedRecord[]): PendingRow[] {
  const out: PendingRow[] = [];
  for (const row of rows) {
    if (row.table !== "ice_operations") continue;
    const parsed = IceOperationSubmissionInput.safeParse(row.payload);
    if (!parsed.success) continue;
    out.push({
      localId: row.localId,
      operation_type_id: parsed.data.operation_type_id,
      equipment_id: parsed.data.equipment_id,
      submitted_at: parsed.data.submitted_at,
      answers: parsed.data.answers,
      retryCount: row.retryCount,
      lastError: row.lastError,
    });
  }
  return out;
}

export function RecentOperations({
  operationTypes,
  equipment,
}: RecentOperationsProps) {
  const recent = trpc.iceOperations.listRecent.useQuery({ limit: 50 });
  const [pending, setPending] = useState<PendingRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const queued = await db.queue
        .where("table")
        .equals("ice_operations")
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

  const opTypeNameById = new Map(operationTypes.map((t) => [t.id, t.name]));
  const equipmentNameById = new Map(equipment.map((e) => [e.id, e.name]));

  const serverRows = recent.data ?? [];
  const pendingLocalIds = new Set(pending.map((p) => p.localId));
  const dedupedServer = serverRows.filter(
    (r) => !r.local_id || !pendingLocalIds.has(r.local_id),
  );

  if (recent.isLoading) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <h2 className="text-xl font-semibold text-white">Recent operations</h2>
        <p className="mt-2 text-sm text-grey">Loading…</p>
      </section>
    );
  }

  if (recent.error) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <h2 className="text-xl font-semibold text-white">Recent operations</h2>
        <p className="mt-2 text-sm text-red" role="alert">
          {recent.error.message}
        </p>
      </section>
    );
  }

  const isEmpty = pending.length === 0 && dedupedServer.length === 0;

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Recent operations</h2>

      {isEmpty ? (
        <p className="mt-2 text-sm text-grey">
          No operations logged yet. Use the form above to log your first
          one.
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
                  {opTypeNameById.get(row.operation_type_id) ??
                    "Unknown operation"}
                  {" · "}
                  {equipmentNameById.get(row.equipment_id) ??
                    "Unknown equipment"}
                </span>
                <span className="text-grey">
                  {formatTimestamp(row.submitted_at)}
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
                  {opTypeNameById.get(row.operation_type_id) ??
                    "Unknown operation"}
                  {" · "}
                  {equipmentNameById.get(row.equipment_id) ??
                    "Unknown equipment"}
                </span>
                <span className="text-grey">
                  {formatTimestamp(row.submitted_at)}
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
