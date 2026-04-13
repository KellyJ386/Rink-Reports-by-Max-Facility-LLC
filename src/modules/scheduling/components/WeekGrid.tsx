"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";
import type { Schedule, Shift } from "@/modules/scheduling/schema";
import {
  DAY_LABELS,
  addDays,
  dayLabel,
  parseDate,
} from "@/modules/scheduling/week-utils";

interface Props {
  weekIso: string;
  schedule: Pick<Schedule, "id" | "status" | "is_locked"> | null;
  shifts: Shift[];
  areaId: string | null;
  isManager: boolean;
}

/**
 * The core weekly schedule grid.
 *
 * Structure:
 * - Table with 8 columns: Position label + Mon--Sun
 * - Rows: one per position (from listPositions)
 * - Cells: shift blocks for that position + day combination
 * - Each block shows: employee name (or "OPEN"), time range, MOD badge
 * - Color-coded left border per position color
 * - OT risk = amber border, availability conflict = yellow border
 * - Empty cells show "+" for managers to add a shift
 * - Open shifts shown with dashed border
 */
export function WeekGrid({
  weekIso,
  schedule,
  shifts,
  areaId,
  isManager,
}: Props) {
  const positions = trpc.scheduling.listPositions.useQuery();
  const roster = trpc.scheduling.listRoster.useQuery();

  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);

  if (positions.isLoading || roster.isLoading) {
    return <p className="text-sm text-grey">Loading grid...</p>;
  }

  const positionList = positions.data ?? [];
  const userById = new Map(
    (roster.data ?? []).map((u) => [u.user_id, u]),
  );

  const monday = parseDate(weekIso);

  // Filter shifts by area if set.
  const filteredShifts = areaId
    ? shifts.filter((s) => s.area_id === areaId)
    : shifts;

  // Index shifts by positionId + dayOffset.
  const shiftIndex = new Map<string, Shift[]>();
  for (const s of filteredShifts) {
    const startDate = new Date(s.start_at);
    const dayOffset = Math.floor(
      (startDate.getTime() - monday.getTime()) / 86400000,
    );
    if (dayOffset < 0 || dayOffset > 6) continue;
    const key = `${s.position_id}:${dayOffset}`;
    const arr = shiftIndex.get(key) ?? [];
    arr.push(s);
    shiftIndex.set(key, arr);
  }

  const isLocked = schedule?.is_locked ?? false;

  if (positionList.length === 0) {
    return (
      <div className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <p className="text-sm text-grey">
          No positions configured. Add positions in the admin panel to build
          a schedule grid.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-grey/30 bg-darkbg/40">
      <table className="w-full min-w-[800px] border-collapse text-xs">
        <thead>
          <tr>
            <th className="w-36 border border-grey/20 bg-darkbg/60 px-3 py-2 text-left text-sm text-grey">
              Position
            </th>
            {DAY_LABELS.map((d, i) => {
              const day = addDays(monday, i);
              return (
                <th
                  key={d}
                  className="border border-grey/20 bg-darkbg/60 px-2 py-2 text-center text-grey"
                >
                  <div className="text-sm">{d}</div>
                  <div className="text-[10px] text-grey/60">{dayLabel(day)}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {positionList.map((pos) => (
            <tr key={pos.id}>
              <td className="border border-grey/20 bg-darkbg/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded"
                    style={{ backgroundColor: pos.color }}
                    aria-hidden
                  />
                  <span className="text-sm text-white">{pos.name}</span>
                </div>
              </td>
              {DAY_LABELS.map((_, dow) => {
                const key = `${pos.id}:${dow}`;
                const cellShifts = shiftIndex.get(key) ?? [];

                return (
                  <td
                    key={dow}
                    className="border border-grey/20 px-1 py-1 align-top"
                  >
                    <div className="flex min-h-[56px] flex-col gap-1">
                      {cellShifts.map((s) => (
                        <ShiftBlock
                          key={s.id}
                          shift={s}
                          positionColor={pos.color}
                          userName={
                            s.user_id
                              ? (userById.get(s.user_id)?.full_name ?? "Staff")
                              : null
                          }
                          isSelected={selectedShiftId === s.id}
                          onClick={() =>
                            setSelectedShiftId(
                              selectedShiftId === s.id ? null : s.id,
                            )
                          }
                        />
                      ))}
                      {isManager && !isLocked && cellShifts.length === 0 && (
                        <AddShiftPlaceholder
                          positionId={pos.id}
                          dayOffset={dow}
                          weekIso={weekIso}
                          scheduleId={schedule?.id ?? null}
                        />
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =====================================================================
// Shift block
// =====================================================================

function ShiftBlock({
  shift,
  positionColor,
  userName,
  isSelected,
  onClick,
}: {
  shift: Shift;
  positionColor: string;
  userName: string | null;
  isSelected: boolean;
  onClick: () => void;
}) {
  const startTime = new Date(shift.start_at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = new Date(shift.end_at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Compute hours for OT detection (naive: >8h single shift).
  const hours =
    (new Date(shift.end_at).getTime() - new Date(shift.start_at).getTime()) /
    3600000;
  const otRisk = hours > 8;

  const borderStyle = shift.is_open
    ? "border-dashed border-grey/50"
    : otRisk
      ? "border-yellow/60"
      : isSelected
        ? "border-green/60"
        : "border-grey/30";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col rounded border ${borderStyle} bg-darkbg/60 p-1.5 text-left transition-colors hover:bg-darkbg/80`}
      style={{ borderLeftWidth: "3px", borderLeftColor: positionColor }}
    >
      <div className="flex items-center gap-1">
        <span className="truncate text-xs text-white">
          {shift.is_open ? "OPEN" : (userName ?? "Unassigned")}
        </span>
        {shift.is_mod && (
          <span className="shrink-0 rounded bg-navy/80 px-1 text-[9px] font-bold text-white">
            MOD
          </span>
        )}
      </div>
      <span className="text-[10px] text-grey">
        {startTime} \u2013 {endTime}
      </span>
      {shift.status === "unconfirmed" && (
        <span className="text-[9px] text-yellow">Unconfirmed</span>
      )}
      {otRisk && (
        <span className="text-[9px] text-yellow">OT risk</span>
      )}
    </button>
  );
}

// =====================================================================
// Add shift placeholder "+"
// =====================================================================

function AddShiftPlaceholder({
  positionId: _positionId,
  dayOffset: _dayOffset,
  weekIso: _weekIso,
  scheduleId: _scheduleId,
}: {
  positionId: string;
  dayOffset: number;
  weekIso: string;
  scheduleId: string | null;
}) {
  return (
    <button
      type="button"
      className="flex h-11 w-full items-center justify-center rounded border border-dashed border-grey/30 text-grey hover:border-white hover:text-white"
      title="Add shift"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
      >
        <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
      </svg>
    </button>
  );
}
