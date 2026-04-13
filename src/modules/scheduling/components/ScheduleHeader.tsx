"use client";

import type { Schedule } from "@/modules/scheduling/schema";
import {
  addDays,
  dayLabel,
  isoMondayOf,
  parseDate,
} from "@/modules/scheduling/week-utils";

interface Props {
  weekIso: string;
  onWeekChange: (iso: string) => void;
  schedule: Pick<Schedule, "id" | "status" | "is_locked"> | null;
  isManager: boolean;
  onPublish?: () => void;
  onUnlock?: () => void;
}

/**
 * Week navigator header for the schedule editor. Shows prev/next arrows,
 * a "Week of Mon DD -- Mon DD" label, a publish button, lock indicator,
 * and status badge.
 */
export function ScheduleHeader({
  weekIso,
  onWeekChange,
  schedule,
  isManager,
  onPublish,
  onUnlock,
}: Props) {
  const monday = parseDate(weekIso);
  const sunday = addDays(monday, 6);
  const weekLabel = `Week of ${dayLabel(monday)} \u2013 ${dayLabel(sunday)}`;

  function goToPrevWeek() {
    const prev = addDays(monday, -7);
    onWeekChange(isoMondayOf(prev));
  }

  function goToNextWeek() {
    const next = addDays(monday, 7);
    onWeekChange(isoMondayOf(next));
  }

  const statusLabel = !schedule
    ? "No schedule"
    : schedule.is_locked
      ? "Locked"
      : schedule.status === "published"
        ? "Published"
        : "Draft";

  const statusClass = !schedule
    ? "border-grey/40 text-grey"
    : schedule.is_locked
      ? "border-yellow/60 text-yellow"
      : schedule.status === "published"
        ? "border-green/40 text-green"
        : "border-yellow/60 text-yellow";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-grey/30 bg-darkbg/40 p-4">
      {/* Prev / Next arrows */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={goToPrevWeek}
          aria-label="Previous week"
          className="flex h-11 w-11 items-center justify-center rounded border border-grey/40 text-grey hover:border-white hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={goToNextWeek}
          aria-label="Next week"
          className="flex h-11 w-11 items-center justify-center rounded border border-grey/40 text-grey hover:border-white hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Week label */}
      <h2 className="text-base font-semibold text-white">{weekLabel}</h2>

      {/* Status badge */}
      <span
        className={`rounded border px-2 py-0.5 text-xs ${statusClass}`}
      >
        {statusLabel}
      </span>

      {/* Lock indicator */}
      {schedule?.is_locked && (
        <span className="flex items-center gap-1 text-xs text-yellow">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path
              fillRule="evenodd"
              d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
              clipRule="evenodd"
            />
          </svg>
          Locked
        </span>
      )}

      {/* Actions */}
      <div className="ml-auto flex items-center gap-2">
        {isManager && schedule?.is_locked && onUnlock && (
          <button
            type="button"
            onClick={onUnlock}
            className="flex h-11 items-center gap-1 rounded border border-yellow/60 px-3 py-1.5 text-xs text-yellow hover:bg-yellow/10"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M14.5 1A4.5 4.5 0 0010 5.5V9H3a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-1V5.5a3 3 0 116 0v2.75a.75.75 0 001.5 0V5.5A4.5 4.5 0 0014.5 1z" />
            </svg>
            Unlock
          </button>
        )}
        {isManager &&
          schedule &&
          !schedule.is_locked &&
          schedule.status === "draft" &&
          onPublish && (
            <button
              type="button"
              onClick={onPublish}
              className="flex h-11 items-center rounded bg-navy px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Publish
            </button>
          )}
      </div>
    </div>
  );
}
