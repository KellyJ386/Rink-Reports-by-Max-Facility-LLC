"use client";

import { useEffect, useState } from "react";

import { trpc } from "@/lib/trpc";
import { db, type QueuedRecord } from "@/lib/offline/db";
import {
  AirQualityReadingInput,
  TIER_LABELS,
  type Tier,
} from "@/modules/air-quality/schema";

/**
 * Recent air quality readings. Server rows + pending Dexie writes,
 * deduped by local_id, with a colored tier badge per row. Pending
 * rows show "Pending sync" because the server hasn't computed their
 * tier yet — once synced, the server-computed tier appears.
 */

interface PendingRow {
  localId: string;
  submitted_at: string;
  co_ppm: number;
  no2_ppm: number;
  notes: string | null;
  retryCount: number;
  lastError?: string;
}

function pendingRowsFromQueue(rows: QueuedRecord[]): PendingRow[] {
  const out: PendingRow[] = [];
  for (const row of rows) {
    if (row.table !== "air_quality_readings") continue;
    const parsed = AirQualityReadingInput.safeParse(row.payload);
    if (!parsed.success) continue;
    out.push({
      localId: row.localId,
      submitted_at: parsed.data.submitted_at,
      co_ppm: parsed.data.co_ppm,
      no2_ppm: parsed.data.no2_ppm,
      notes: parsed.data.notes ?? null,
      retryCount: row.retryCount,
      lastError: row.lastError,
    });
  }
  return out;
}

export function RecentAirQualityReadings() {
  const recent = trpc.airQuality.listRecent.useQuery({ limit: 50 });
  const [pending, setPending] = useState<PendingRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const queued = await db.queue
        .where("table")
        .equals("air_quality_readings")
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

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Recent readings</h2>

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
                  {formatTimestamp(row.submitted_at)} · CO {row.co_ppm} ppm ·
                  NO₂ {row.no2_ppm} ppm
                </span>
                {row.notes && (
                  <span className="text-grey">{row.notes}</span>
                )}
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
          {dedupedServer.map((row) => {
            const cls = tierBadgeClasses(row.tier);
            return (
              <li
                key={`server:${row.id}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="flex flex-col">
                  <span className="text-white">
                    {formatTimestamp(row.submitted_at)} · CO {row.co_ppm} ppm ·
                    NO₂ {row.no2_ppm} ppm
                  </span>
                  {row.notes && (
                    <span className="text-grey">{row.notes}</span>
                  )}
                </div>
                <span
                  className={`rounded border px-2 py-0.5 text-xs ${cls.border} ${cls.text}`}
                >
                  {TIER_LABELS[row.tier]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function tierBadgeClasses(tier: Tier): { border: string; text: string } {
  switch (tier) {
    case "normal":
      return { border: "border-green/40", text: "text-green" };
    case "caution":
      return { border: "border-yellow/60", text: "text-yellow" };
    case "action":
      return { border: "border-yellow/80", text: "text-yellow" };
    case "evacuate":
      return { border: "border-red/70", text: "text-red" };
  }
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
