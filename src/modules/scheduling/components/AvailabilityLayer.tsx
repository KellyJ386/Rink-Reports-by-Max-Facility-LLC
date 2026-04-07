"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";
import {
  type AvailabilityBlock,
  type AvailabilityStatus,
} from "@/modules/scheduling/schema";
import {
  DAY_LABELS,
  fmtMinute,
} from "@/modules/scheduling/week-utils";

/**
 * Layer 1 — Availability.
 *
 * Each staff member sees their own week-view grid with hourly blocks
 * and toggles each cell between Available / Preferred / Unavailable.
 * The Recurring toggle controls whether the save lands as a per-week
 * override or as the user's weekly template.
 */

interface AvailabilityLayerProps {
  weekIso: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0..23
const STATUS_ORDER: AvailabilityStatus[] = [
  "available",
  "preferred",
  "unavailable",
];
const STATUS_LABELS: Record<AvailabilityStatus, string> = {
  available: "Available",
  preferred: "Preferred",
  unavailable: "Unavailable",
};
const STATUS_CLASSES: Record<AvailabilityStatus | "empty", string> = {
  empty: "bg-darkbg/40 hover:bg-darkbg/60",
  available: "bg-green/30 hover:bg-green/40 text-green",
  preferred: "bg-navy/60 hover:bg-navy/80 text-white",
  unavailable: "bg-red/30 hover:bg-red/40 text-red",
};

type Grid = Record<string, AvailabilityStatus | undefined>; // key: `${dow}:${hour}`

function gridFromBlocks(blocks: readonly AvailabilityBlock[]): Grid {
  const out: Grid = {};
  for (const b of blocks) {
    // Snap to hour granularity for the editor display.
    const startHour = Math.floor(b.start_minute / 60);
    const endHour = Math.ceil(b.end_minute / 60);
    for (let h = startHour; h < endHour; h++) {
      const k = `${b.dow}:${h}`;
      // If a "stronger" status is already set in this cell (e.g.
      // unavailable), don't overwrite with a weaker one.
      const existing = out[k];
      if (existing === "unavailable") continue;
      if (existing === "preferred" && b.status === "available") continue;
      out[k] = b.status;
    }
  }
  return out;
}

function blocksFromGrid(grid: Grid): AvailabilityBlock[] {
  // Coalesce contiguous hours of the same status into one block.
  const out: AvailabilityBlock[] = [];
  for (let dow = 0; dow < 7; dow++) {
    let runStart: number | null = null;
    let runStatus: AvailabilityStatus | null = null;
    for (let h = 0; h <= 24; h++) {
      const status = h < 24 ? grid[`${dow}:${h}`] : undefined;
      if (status !== runStatus) {
        if (runStatus !== null && runStart !== null) {
          out.push({
            dow,
            start_minute: runStart * 60,
            end_minute: h * 60,
            status: runStatus,
          });
        }
        runStart = status ? h : null;
        runStatus = status ?? null;
      }
    }
  }
  return out;
}

export function AvailabilityLayer({ weekIso }: AvailabilityLayerProps) {
  return (
    <AvailabilityLayerInner key={weekIso} weekIso={weekIso} />
  );
}

function AvailabilityLayerInner({ weekIso }: AvailabilityLayerProps) {
  const utils = trpc.useUtils();
  const query = trpc.scheduling.getMyAvailability.useQuery({ week_start: weekIso });
  const save = trpc.scheduling.saveMyAvailability.useMutation({
    onSuccess: () => {
      utils.scheduling.getMyAvailability.invalidate({ week_start: weekIso });
      utils.scheduling.listFacilityAvailability.invalidate({ week_start: weekIso });
    },
  });

  if (query.isLoading) {
    return <p className="text-sm text-grey">Loading…</p>;
  }
  if (query.error) {
    return (
      <p className="text-sm text-red" role="alert">
        {query.error.message}
      </p>
    );
  }

  return (
    <AvailabilityForm
      key={query.data?.source ?? "empty"}
      weekIso={weekIso}
      initialBlocks={query.data?.blocks ?? []}
      initialRecurring={query.data?.source === "recurring"}
      isPending={save.isPending}
      error={save.error?.message ?? null}
      onSave={(blocks, recurring) =>
        save.mutate({
          blocks,
          recurring,
          week_start: recurring ? null : weekIso,
        })
      }
    />
  );
}

function AvailabilityForm({
  weekIso,
  initialBlocks,
  initialRecurring,
  isPending,
  error,
  onSave,
}: {
  weekIso: string;
  initialBlocks: readonly AvailabilityBlock[];
  initialRecurring: boolean;
  isPending: boolean;
  error: string | null;
  onSave: (blocks: AvailabilityBlock[], recurring: boolean) => void;
}) {
  const [grid, setGrid] = useState<Grid>(() => gridFromBlocks(initialBlocks));
  const [recurring, setRecurring] = useState<boolean>(initialRecurring);
  const [paint, setPaint] = useState<AvailabilityStatus>("available");

  function cycleCell(dow: number, hour: number) {
    setGrid((prev) => {
      const key = `${dow}:${hour}`;
      const current = prev[key];
      let next: AvailabilityStatus | undefined;
      if (current === undefined) next = paint;
      else if (current === paint) next = undefined;
      else next = paint;
      const out = { ...prev };
      if (next === undefined) delete out[key];
      else out[key] = next;
      return out;
    });
  }

  function clearAll() {
    setGrid({});
  }

  function onSubmit() {
    onSave(blocksFromGrid(grid), recurring);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-grey">Paint mode:</span>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setPaint(s)}
            className={
              paint === s
                ? "rounded bg-navy px-2 py-1 text-xs font-medium text-white"
                : "rounded border border-grey/40 px-2 py-1 text-xs text-grey hover:text-white"
            }
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-grey">
          <input
            type="checkbox"
            checked={recurring}
            onChange={(e) => setRecurring(e.target.checked)}
            className="h-4 w-4"
          />
          Apply every week (recurring template)
        </label>
      </div>

      <div className="overflow-x-auto rounded border border-grey/30 bg-darkbg/40">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-12 border border-grey/20 bg-darkbg/60 px-1 py-1 text-grey">
                Hr
              </th>
              {DAY_LABELS.map((d) => (
                <th
                  key={d}
                  className="border border-grey/20 bg-darkbg/60 px-1 py-1 text-grey"
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((h) => (
              <tr key={h}>
                <td className="border border-grey/20 bg-darkbg/60 px-1 py-1 text-grey">
                  {fmtMinute(h * 60)}
                </td>
                {DAY_LABELS.map((_, dow) => {
                  const status = grid[`${dow}:${h}`] ?? "empty";
                  return (
                    <td
                      key={dow}
                      onClick={() => cycleCell(dow, h)}
                      className={`cursor-pointer border border-grey/20 px-1 py-2 text-center ${STATUS_CLASSES[status as keyof typeof STATUS_CLASSES]}`}
                    >
                      {status === "empty" ? "" : STATUS_LABELS[status as AvailabilityStatus][0]}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="text-sm text-red" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isPending}
          className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Saving…" : recurring ? "Save weekly template" : `Save week of ${weekIso}`}
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded border border-grey/40 px-3 py-2 text-sm text-grey hover:border-white hover:text-white"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
