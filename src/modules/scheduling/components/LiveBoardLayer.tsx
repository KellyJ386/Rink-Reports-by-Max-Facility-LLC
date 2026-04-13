"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";
import {
  DAY_LABELS,
  addDays,
  dayLabel,
  parseDate,
} from "@/modules/scheduling/week-utils";

/**
 * Layer 4 — Live board.
 *
 * Read-only week view of every published shift, color-coded by
 * position, with the logged-in user's own shifts highlighted. Filters
 * for position (everyone) and staff member (manager only).
 */
interface Props {
  weekIso: string;
  isManager: boolean;
}

export function LiveBoardLayer({ weekIso, isManager }: Props) {
  const me = trpc.admin.me.useQuery();
  const positions = trpc.scheduling.listPositions.useQuery();
  const roster = trpc.scheduling.listRoster.useQuery();
  const schedule = trpc.scheduling.getScheduleForWeek.useQuery({ week_start: weekIso });

  const [filterPosition, setFilterPosition] = useState<string>("");
  const [filterUser, setFilterUser] = useState<string>("");

  if (me.isLoading || positions.isLoading || roster.isLoading || schedule.isLoading) {
    return <p className="text-sm text-grey">Loading…</p>;
  }

  const sched = schedule.data?.schedule;
  const shifts = schedule.data?.shifts ?? [];

  if (!sched) {
    return (
      <p className="text-sm text-grey">
        No schedule for this week yet.
      </p>
    );
  }

  if (sched.status !== "published" && !isManager) {
    return (
      <p className="text-sm text-grey">
        The schedule for this week has not been published yet. Check
        back after your manager publishes it.
      </p>
    );
  }

  const positionById = new Map(
    (positions.data ?? []).map((p) => [p.id, p]),
  );
  const userById = new Map(
    (roster.data ?? []).map((u) => [u.user_id, u]),
  );

  const filtered = shifts.filter((s) => {
    if (filterPosition && s.position_id !== filterPosition) return false;
    if (isManager && filterUser && s.user_id !== filterUser) return false;
    return true;
  });

  // Group shifts by day-of-week (0..6).
  const byDay: ReadonlyArray<typeof filtered> = Array.from({ length: 7 }, (_, i) =>
    filtered
      .filter((s) => {
        const d = new Date(s.start_at);
        const monday = parseDate(weekIso);
        const offset = Math.floor((d.getTime() - monday.getTime()) / 86400000);
        return offset === i;
      })
      .sort((a, b) => a.start_at.localeCompare(b.start_at)),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {sched.status === "draft" && isManager && (
          <span className="rounded border border-yellow/60 px-2 py-0.5 text-xs text-yellow">
            Draft (not yet visible to staff)
          </span>
        )}
        <label className="flex items-center gap-2 text-grey">
          Position
          <select
            value={filterPosition}
            onChange={(e) => setFilterPosition(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-2 py-1 text-white"
          >
            <option value="">All</option>
            {(positions.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {isManager && (
          <label className="flex items-center gap-2 text-grey">
            Staff
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="rounded border border-grey/40 bg-darkbg px-2 py-1 text-white"
            >
              <option value="">All</option>
              {(roster.data ?? []).map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.full_name ?? u.user_id}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {byDay.map((dayShifts, dow) => {
          const day = addDays(parseDate(weekIso), dow);
          return (
            <div
              key={dow}
              className="rounded border border-grey/30 bg-darkbg/40 p-3"
            >
              <h3 className="text-sm font-semibold text-white">
                {DAY_LABELS[dow]} · {dayLabel(day)}
              </h3>
              {dayShifts.length === 0 ? (
                <p className="mt-2 text-xs text-grey">No shifts.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1 text-xs">
                  {dayShifts.map((s) => {
                    const pos = positionById.get(s.position_id);
                    const user = s.user_id ? userById.get(s.user_id) : undefined;
                    const isMine = me.data && s.user_id === me.data.user_id;
                    return (
                      <li
                        key={s.id}
                        className={
                          isMine
                            ? "rounded border-2 border-green/60 bg-darkbg/80 p-2"
                            : "rounded border border-grey/20 bg-darkbg/60 p-2"
                        }
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded"
                            style={{ backgroundColor: pos?.color ?? "#003B6F" }}
                            aria-hidden
                          />
                          <span className="text-white">{pos?.name ?? "Position"}</span>
                          {isMine && (
                            <span className="ml-auto rounded border border-green/60 px-1 text-[10px] text-green">
                              MINE
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-grey">{user?.full_name ?? "Staff"}</div>
                        <div className="text-grey">
                          {new Date(s.start_at).toLocaleTimeString()} –{" "}
                          {new Date(s.end_at).toLocaleTimeString()}
                        </div>
                        {s.notes && (
                          <div className="mt-1 text-grey">{s.notes}</div>
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
