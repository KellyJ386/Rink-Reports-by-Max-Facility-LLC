"use client";

import { useEffect, useState } from "react";

import { trpc } from "@/lib/trpc";
import { db, type QueuedRecord } from "@/lib/offline/db";
import { usePdfExport } from "@/hooks/usePdfExport";
import * as toast from "@/lib/toast";
import {
  COMPRESSOR_FIELDS,
  FACILITY_FIELDS,
  RefrigerationReadingInput,
  isOutOfRange,
  type Compressor,
  type CompressorReadingRow,
  type FacilityFieldKey,
  type ThresholdMap,
} from "@/modules/refrigeration/schema";

/**
 * Recent refrigeration readings. Server rows + pending Dexie writes,
 * deduped by local_id, with an out-of-range field count badge so the
 * operator can spot bad runs at a glance.
 */

interface RecentReadingsProps {
  compressors: readonly Compressor[];
  thresholds: ThresholdMap;
}

interface PendingRow {
  localId: string;
  submitted_at: string;
  brine_supply: number | null;
  brine_return: number | null;
  brine_flow: number | null;
  ice_surface_temp: number | null;
  condenser_temp: number | null;
  compressor_readings: CompressorReadingRow[];
  retryCount: number;
  lastError?: string;
}

function pendingRowsFromQueue(rows: QueuedRecord[]): PendingRow[] {
  const out: PendingRow[] = [];
  for (const row of rows) {
    if (row.table !== "refrigeration_readings") continue;
    const parsed = RefrigerationReadingInput.safeParse(row.payload);
    if (!parsed.success) continue;
    out.push({
      localId: row.localId,
      submitted_at: parsed.data.submitted_at,
      brine_supply: parsed.data.brine_supply,
      brine_return: parsed.data.brine_return,
      brine_flow: parsed.data.brine_flow,
      ice_surface_temp: parsed.data.ice_surface_temp,
      condenser_temp: parsed.data.condenser_temp,
      compressor_readings: parsed.data.compressor_readings,
      retryCount: row.retryCount,
      lastError: row.lastError,
    });
  }
  return out;
}

export function RecentRefrigerationReadings({
  compressors,
  thresholds,
}: RecentReadingsProps) {
  const recent = trpc.refrigeration.listRecent.useQuery({ limit: 50 });
  const [pending, setPending] = useState<PendingRow[]>([]);
  const { downloadPdf, isExporting, setIsExporting } = usePdfExport();
  const exportMutation = trpc.exports.refrigerationPdf.useMutation();

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const queued = await db.queue
        .where("table")
        .equals("refrigeration_readings")
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

  const compressorNameById = new Map(compressors.map((c) => [c.id, c.name]));
  const serverRows = recent.data ?? [];
  const pendingLocalIds = new Set(pending.map((p) => p.localId));
  const dedupedServer = serverRows.filter(
    (r) => !r.local_id || !pendingLocalIds.has(r.local_id),
  );

  if (recent.isLoading) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <h2 className="text-xl font-semibold text-white">Recent readings</h2>
        <p className="mt-2 text-sm text-grey">Loading…</p>
      </section>
    );
  }
  if (recent.error) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <h2 className="text-xl font-semibold text-white">Recent readings</h2>
        <p className="mt-2 text-sm text-red" role="alert">
          {recent.error.message}
        </p>
      </section>
    );
  }

  const isEmpty = pending.length === 0 && dedupedServer.length === 0;

  async function handleExportPdf() {
    const today = new Date().toISOString().slice(0, 10);
    const oldest = dedupedServer[dedupedServer.length - 1]?.submitted_at?.slice(0, 10) ?? today;
    setIsExporting(true);
    try {
      const result = await exportMutation.mutateAsync({
        startDate: oldest,
        endDate: today,
      });
      downloadPdf(result);
    } catch {
      toast.show({ message: "Export failed — try again", kind: "error" });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Recent readings</h2>
        <button
          type="button"
          onClick={() => { void handleExportPdf(); }}
          disabled={isExporting || isEmpty}
          className="rounded border border-navy px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-navy disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExporting ? "Exporting…" : "Export PDF"}
        </button>
      </div>

      {isEmpty ? (
        <p className="mt-2 text-sm text-grey">
          No readings yet. Use the form above to log your first one.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-grey/20">
          {pending.map((row) => (
            <li
              key={`pending:${row.localId}`}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <div className="flex flex-col">
                <span className="text-white">
                  {formatTimestamp(row.submitted_at)}
                  {summarizeOutOfRange(row, thresholds, compressorNameById)}
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
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <div className="flex flex-col">
                <span className="text-white">
                  {formatTimestamp(row.submitted_at)}
                  {summarizeOutOfRange(row, thresholds, compressorNameById)}
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

interface OutOfRangeSummarySource {
  brine_supply: number | null;
  brine_return: number | null;
  brine_flow: number | null;
  ice_surface_temp: number | null;
  condenser_temp: number | null;
  compressor_readings: CompressorReadingRow[];
}

function summarizeOutOfRange(
  row: OutOfRangeSummarySource,
  thresholds: ThresholdMap,
  compressorNameById: Map<string, string>,
): string {
  let count = 0;

  for (const f of FACILITY_FIELDS) {
    const key = f.key as FacilityFieldKey;
    if (isOutOfRange(row[key], thresholds[f.key])) count++;
  }

  for (const cr of row.compressor_readings) {
    for (const f of COMPRESSOR_FIELDS) {
      // Type-narrow the dynamic key access. We know cr has these
      // numeric/null fields because the Zod schema enforces it.
      const value = (cr as unknown as Record<string, number | null>)[f.key];
      if (isOutOfRange(value ?? null, thresholds[f.key])) count++;
    }
  }

  if (count === 0) {
    const compNames = row.compressor_readings
      .map((cr) => compressorNameById.get(cr.compressor_id) ?? "?")
      .filter((n) => n !== "?")
      .join(", ");
    return compNames ? ` · ${compNames}` : "";
  }

  return ` · ${count} reading${count === 1 ? "" : "s"} out of range`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
