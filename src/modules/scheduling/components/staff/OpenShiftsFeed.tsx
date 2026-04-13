"use client";

import { useMemo } from "react";

import { trpc } from "@/lib/trpc";
import {
  addDays,
  dayLabel,
  isoMondayOf,
  parseDate,
} from "@/modules/scheduling/week-utils";
import type { Shift } from "@/modules/scheduling/schema";

interface Props {
  weekIso: string;
  myUserId: string;
}

/**
 * List of open/claimable shifts for the facility. Shows current + next
 * week. Each card displays date, time range, position, and a "Claim"
 * button.
 */
export function OpenShiftsFeed({ weekIso, myUserId }: Props) {
  const nextWeekIso = useMemo(() => {
    const d = addDays(parseDate(weekIso), 7);
    return isoMondayOf(d);
  }, [weekIso]);

  const positions = trpc.scheduling.listPositions.useQuery();
  const thisWeek = trpc.scheduling.getScheduleForWeek.useQuery({
    week_start: weekIso,
  });
  const nextWeek = trpc.scheduling.getScheduleForWeek.useQuery({
    week_start: nextWeekIso,
  });

  const utils = trpc.useUtils();

  const claimShift = trpc.scheduling.updateShift.useMutation({
    onSuccess: () => {
      void utils.scheduling.getScheduleForWeek.invalidate({
        week_start: weekIso,
      });
      void utils.scheduling.getScheduleForWeek.invalidate({
        week_start: nextWeekIso,
      });
    },
  });

  if (positions.isLoading || thisWeek.isLoading || nextWeek.isLoading) {
    return <p className="text-sm text-grey">Loading open shifts...</p>;
  }

  const positionById = new Map(
    (positions.data ?? []).map((p) => [p.id, p]),
  );

  // Collect open shifts from both weeks
  const allShifts = [
    ...(thisWeek.data?.shifts ?? []),
    ...(nextWeek.data?.shifts ?? []),
  ] as Array<Shift & Record<string, unknown>>;

  const openShifts = allShifts
    .filter((s) => s.is_open === true && s.user_id === null)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  if (openShifts.length === 0) {
    return (
      <div className="rounded-lg border border-grey/30 bg-darkbg/40 p-6 text-center">
        <p className="text-sm text-grey">
          No open shifts available right now.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-grey">
        {openShifts.length} open shift{openShifts.length !== 1 ? "s" : ""}{" "}
        available
      </p>

      <ul className="flex flex-col gap-3">
        {openShifts.map((s) => {
          const pos = positionById.get(s.position_id);
          const shiftDate = new Date(s.start_at);

          return (
            <li
              key={s.id}
              className="rounded-lg border border-grey/30 bg-darkbg/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{
                        backgroundColor: pos?.color ?? "#003B6F",
                      }}
                      aria-hidden
                    />
                    <span className="text-sm font-medium text-white">
                      {pos?.name ?? "Position"}
                    </span>
                  </div>

                  <p className="text-sm text-grey">
                    {dayLabel(shiftDate)}
                  </p>

                  <p className="text-sm text-grey">
                    {shiftDate.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    &ndash;{" "}
                    {new Date(s.end_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>

                  {s.notes && (
                    <p className="text-xs text-grey">{s.notes}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    claimShift.mutate({
                      id: s.id,
                      user_id: myUserId,
                      is_open: false,
                    })
                  }
                  disabled={claimShift.isPending}
                  className="shrink-0 rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  style={{ minHeight: 44 }}
                >
                  {claimShift.isPending ? "Claiming..." : "Claim"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
