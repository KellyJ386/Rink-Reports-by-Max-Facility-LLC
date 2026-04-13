"use client";

import { trpc } from "@/lib/trpc";
import {
  DAY_LABELS,
  addDays,
  dayLabel,
  parseDate,
} from "@/modules/scheduling/week-utils";
import type { Shift } from "@/modules/scheduling/schema";

interface Props {
  weekIso: string;
  myUserId: string;
}

/**
 * Shows the current week's shifts for the logged-in user.
 * Mobile-optimized stacked card layout, one card per day.
 */
export function WeekAtAGlance({ weekIso, myUserId }: Props) {
  const positions = trpc.scheduling.listPositions.useQuery();
  const schedule = trpc.scheduling.getScheduleForWeek.useQuery({
    week_start: weekIso,
  });

  const utils = trpc.useUtils();

  const updateShift = trpc.scheduling.updateShift.useMutation({
    onSuccess: () => {
      void utils.scheduling.getScheduleForWeek.invalidate({ week_start: weekIso });
    },
  });

  if (positions.isLoading || schedule.isLoading) {
    return <p className="text-sm text-grey">Loading shifts...</p>;
  }

  const sched = schedule.data?.schedule;
  const allShifts = (schedule.data?.shifts ?? []) as Array<
    Shift & Record<string, unknown>
  >;

  if (!sched) {
    return (
      <div className="rounded-lg border border-grey/30 bg-darkbg/40 p-6 text-center">
        <p className="text-sm text-grey">No schedule for this week yet.</p>
      </div>
    );
  }

  if (sched.status !== "published") {
    return (
      <div className="rounded-lg border border-grey/30 bg-darkbg/40 p-6 text-center">
        <p className="text-sm text-grey">
          The schedule for this week has not been published yet.
        </p>
      </div>
    );
  }

  // Filter to only the logged-in user's shifts
  const myShifts = allShifts.filter((s) => s.user_id === myUserId);

  const positionById = new Map(
    (positions.data ?? []).map((p) => [p.id, p]),
  );

  const monday = parseDate(weekIso);

  // Group by day-of-week (0=Mon..6=Sun)
  const byDay: Array<typeof myShifts> = Array.from({ length: 7 }, (_, i) =>
    myShifts
      .filter((s) => {
        const d = new Date(s.start_at);
        const offset = Math.floor(
          (d.getTime() - monday.getTime()) / 86400000,
        );
        return offset === i;
      })
      .sort((a, b) => a.start_at.localeCompare(b.start_at)),
  );

  // Total hours this week
  const totalMinutes = myShifts.reduce((sum, s) => {
    const start = new Date(s.start_at).getTime();
    const end = new Date(s.end_at).getTime();
    return sum + (end - start) / 60000;
  }, 0);
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-grey">
          Week of {dayLabel(monday)}
        </span>
        <span className="text-grey">
          {myShifts.length} shift{myShifts.length !== 1 ? "s" : ""} /{" "}
          {totalHours}h
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {byDay.map((dayShifts, dow) => {
          const day = addDays(monday, dow);
          return (
            <div
              key={dow}
              className="rounded-lg border border-grey/30 bg-darkbg/40 p-4"
            >
              <h3 className="text-sm font-semibold text-white">
                {DAY_LABELS[dow]} &middot; {dayLabel(day)}
              </h3>

              {dayShifts.length === 0 ? (
                <p className="mt-2 text-xs text-grey">No shifts</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {dayShifts.map((s) => {
                    const pos = positionById.get(s.position_id);
                    const isUnconfirmed = s.status === "unconfirmed";
                    const isMod = Boolean(s.is_mod);

                    return (
                      <li
                        key={s.id}
                        className="rounded border border-grey/20 bg-darkbg/60 p-3"
                      >
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
                          {isMod && (
                            <span className="rounded border border-yellow/60 px-2 py-0.5 text-xs text-yellow">
                              MOD
                            </span>
                          )}
                          {isUnconfirmed && (
                            <span className="rounded border border-red/40 px-2 py-0.5 text-xs text-red">
                              Unconfirmed
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-sm text-grey">
                          {new Date(s.start_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          &ndash;{" "}
                          {new Date(s.end_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>

                        {s.notes && (
                          <p className="mt-1 text-xs text-grey">{s.notes}</p>
                        )}

                        {isUnconfirmed && (
                          <button
                            type="button"
                            onClick={() =>
                              updateShift.mutate({
                                id: s.id,
                                status: "confirmed",
                              })
                            }
                            disabled={updateShift.isPending}
                            className="mt-2 rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            style={{ minHeight: 44 }}
                          >
                            {updateShift.isPending
                              ? "Confirming..."
                              : "Confirm Shift"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
