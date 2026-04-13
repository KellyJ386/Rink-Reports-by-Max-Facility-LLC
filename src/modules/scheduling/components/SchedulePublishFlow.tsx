"use client";

import { trpc } from "@/lib/trpc";
import type { Shift } from "@/modules/scheduling/schema";

interface Props {
  scheduleId: string;
  shifts: Shift[];
  onClose: () => void;
  onPublished: () => void;
}

/**
 * Enhanced publish dialog. Shows:
 * - Shift summary (total count, unconfirmed count, open shift count)
 * - Warning section for OT / conflict issues
 * - "Publish & Notify Staff" button
 * - Cancel button
 */
export function SchedulePublishFlow({
  scheduleId,
  shifts,
  onClose,
  onPublished,
}: Props) {
  const utils = trpc.useUtils();
  const publish = trpc.scheduling.publishSchedule.useMutation({
    onSuccess: () => {
      utils.scheduling.getScheduleForWeek.invalidate();
      onPublished();
    },
  });

  const totalCount = shifts.length;
  const openCount = shifts.filter((s) => s.is_open).length;
  const unconfirmedCount = shifts.filter(
    (s) => s.status === "unconfirmed",
  ).length;
  const assignedCount = totalCount - openCount;

  // Naive OT detection: any shift > 8 hours.
  const otRiskShifts = shifts.filter((s) => {
    const hours =
      (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) /
      3600000;
    return hours > 8;
  });

  const hasWarnings = otRiskShifts.length > 0 || openCount > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-grey/30 bg-darkbg p-6">
        <h3 className="text-lg font-semibold text-white">
          Publish Schedule
        </h3>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded border border-grey/20 bg-darkbg/60 p-3 text-center">
            <div className="text-2xl font-bold text-white">{totalCount}</div>
            <div className="text-xs text-grey">Total shifts</div>
          </div>
          <div className="rounded border border-grey/20 bg-darkbg/60 p-3 text-center">
            <div className="text-2xl font-bold text-white">{assignedCount}</div>
            <div className="text-xs text-grey">Assigned</div>
          </div>
          <div className="rounded border border-grey/20 bg-darkbg/60 p-3 text-center">
            <div
              className={`text-2xl font-bold ${openCount > 0 ? "text-yellow" : "text-white"}`}
            >
              {openCount}
            </div>
            <div className="text-xs text-grey">Open shifts</div>
          </div>
        </div>

        {unconfirmedCount > 0 && (
          <p className="text-xs text-grey">
            {unconfirmedCount} shift{unconfirmedCount === 1 ? "" : "s"} still
            unconfirmed. Staff will be notified upon publish.
          </p>
        )}

        {/* Warnings */}
        {hasWarnings && (
          <div className="rounded border border-yellow/40 bg-yellow/5 p-3">
            <h4 className="mb-2 text-sm font-medium text-yellow">Warnings</h4>
            <ul className="flex flex-col gap-1 text-xs text-yellow">
              {openCount > 0 && (
                <li>
                  {openCount} open shift{openCount === 1 ? "" : "s"} with no
                  assigned employee.
                </li>
              )}
              {otRiskShifts.length > 0 && (
                <li>
                  {otRiskShifts.length} shift
                  {otRiskShifts.length === 1 ? "" : "s"} exceed 8 hours
                  (overtime risk).
                </li>
              )}
            </ul>
          </div>
        )}

        {totalCount === 0 && (
          <p className="text-sm text-grey">
            This schedule has no shifts. Add shifts before publishing.
          </p>
        )}

        {publish.error && (
          <p className="text-xs text-red">{publish.error.message}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 items-center rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:border-white hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => publish.mutate({ schedule_id: scheduleId })}
            disabled={publish.isPending || totalCount === 0}
            className="flex h-11 items-center rounded bg-navy px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {publish.isPending ? "Publishing..." : "Publish & Notify Staff"}
          </button>
        </div>
      </div>
    </div>
  );
}
