"use client";

import { trpc } from "@/lib/trpc";
import type { Shift } from "@/modules/scheduling/schema";
import { addDays, dayLabel, parseDate } from "@/modules/scheduling/week-utils";

interface Props {
  weekIso: string;
  dayOffset: number;
  shifts: Shift[];
  isManager: boolean;
}

const HOUR_START = 5;
const HOUR_END = 24; // midnight
const TOTAL_HOURS = HOUR_END - HOUR_START;
const HOUR_HEIGHT_PX = 60;

/**
 * Hour-by-hour drill-down for a single day. Shows a timeline from 5am
 * to midnight with shift blocks positioned by time.
 */
export function DailyView({ weekIso, dayOffset, shifts, isManager }: Props) {
  const positions = trpc.scheduling.listPositions.useQuery();
  const roster = trpc.scheduling.listRoster.useQuery();

  if (positions.isLoading || roster.isLoading) {
    return <p className="text-sm text-grey">Loading daily view...</p>;
  }

  const monday = parseDate(weekIso);
  const targetDay = addDays(monday, dayOffset);
  const dayStart = new Date(targetDay);
  dayStart.setHours(HOUR_START, 0, 0, 0);
  const dayEnd = new Date(targetDay);
  dayEnd.setHours(HOUR_END, 0, 0, 0);

  const positionById = new Map(
    (positions.data ?? []).map((p) => [p.id, p]),
  );
  const userById = new Map(
    (roster.data ?? []).map((u) => [u.user_id, u]),
  );

  // Filter shifts for this specific day.
  const dayShifts = shifts.filter((s) => {
    const start = new Date(s.start_at);
    const startOffset = Math.floor(
      (start.getTime() - monday.getTime()) / 86400000,
    );
    return startOffset === dayOffset;
  });

  const hours = Array.from(
    { length: TOTAL_HOURS },
    (_, i) => HOUR_START + i,
  );

  function getTopAndHeight(shift: Shift): { top: number; height: number } {
    const startMs = new Date(shift.start_at).getTime();
    const endMs = new Date(shift.end_at).getTime();
    const dayStartMs = dayStart.getTime();
    const dayEndMs = dayEnd.getTime();

    const clampedStart = Math.max(startMs, dayStartMs);
    const clampedEnd = Math.min(endMs, dayEndMs);

    const totalMs = dayEndMs - dayStartMs;
    const top =
      ((clampedStart - dayStartMs) / totalMs) *
      TOTAL_HOURS *
      HOUR_HEIGHT_PX;
    const height =
      ((clampedEnd - clampedStart) / totalMs) *
      TOTAL_HOURS *
      HOUR_HEIGHT_PX;

    return { top: Math.max(0, top), height: Math.max(HOUR_HEIGHT_PX / 4, height) };
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold text-white">
        {dayLabel(targetDay)}
      </h3>

      {dayShifts.length === 0 ? (
        <p className="text-sm text-grey">No shifts scheduled for this day.</p>
      ) : (
        <div className="relative overflow-hidden rounded-lg border border-grey/30 bg-darkbg/40">
          {/* Hour labels + grid lines */}
          <div
            className="relative"
            style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT_PX}px` }}
          >
            {hours.map((h) => {
              const topPx = (h - HOUR_START) * HOUR_HEIGHT_PX;
              const label =
                h === 0
                  ? "12 AM"
                  : h < 12
                    ? `${h} AM`
                    : h === 12
                      ? "12 PM"
                      : `${h - 12} PM`;
              return (
                <div
                  key={h}
                  className="absolute left-0 flex w-full items-start border-t border-grey/15"
                  style={{ top: `${topPx}px`, height: `${HOUR_HEIGHT_PX}px` }}
                >
                  <span className="w-16 shrink-0 px-2 pt-1 text-[10px] text-grey">
                    {label}
                  </span>
                </div>
              );
            })}

            {/* Shift blocks */}
            <div className="absolute inset-0 left-16">
              {dayShifts.map((s) => {
                const { top, height } = getTopAndHeight(s);
                const pos = positionById.get(s.position_id);
                const user = s.user_id ? userById.get(s.user_id) : null;

                const startTime = new Date(s.start_at).toLocaleTimeString(
                  undefined,
                  { hour: "2-digit", minute: "2-digit" },
                );
                const endTime = new Date(s.end_at).toLocaleTimeString(
                  undefined,
                  { hour: "2-digit", minute: "2-digit" },
                );

                return (
                  <div
                    key={s.id}
                    className={`absolute left-1 right-1 overflow-hidden rounded border ${
                      s.is_open
                        ? "border-dashed border-grey/50"
                        : "border-grey/30"
                    } bg-darkbg/80 px-2 py-1`}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      borderLeftWidth: "3px",
                      borderLeftColor: pos?.color ?? "#003B6F",
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate text-xs font-medium text-white">
                        {s.is_open
                          ? "OPEN"
                          : (user?.full_name ?? "Unassigned")}
                      </span>
                      {s.is_mod && (
                        <span className="shrink-0 rounded bg-navy/80 px-1 text-[9px] font-bold text-white">
                          MOD
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-grey">
                      {pos?.name ?? "Position"} &middot; {startTime} &ndash;{" "}
                      {endTime}
                    </span>
                    {isManager && s.notes && (
                      <div className="truncate text-[9px] text-grey/70">
                        {s.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
