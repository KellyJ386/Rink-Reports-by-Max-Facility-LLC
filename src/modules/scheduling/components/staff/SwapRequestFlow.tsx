"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";
import {
  addDays,
  dayLabel,
  parseDate,
} from "@/modules/scheduling/week-utils";
import type { Shift, SwapStatus } from "@/modules/scheduling/schema";

interface Props {
  weekIso: string;
  myUserId: string;
}

type Step = "pick-mine" | "pick-target" | "confirm";

interface SwapSelection {
  myShift: Shift;
  targetShift: Shift | null;
  targetEmployeeId: string | null;
}

function swapStatusBadge(status: SwapStatus) {
  switch (status) {
    case "pending":
      return (
        <span className="rounded border border-yellow/60 px-2 py-0.5 text-xs text-yellow">
          Pending
        </span>
      );
    case "approved":
      return (
        <span className="rounded border border-green/40 px-2 py-0.5 text-xs text-green">
          Approved
        </span>
      );
    case "denied":
      return (
        <span className="rounded border border-red/40 px-2 py-0.5 text-xs text-red">
          Denied
        </span>
      );
    case "cancelled":
      return (
        <span className="rounded border border-grey/40 px-2 py-0.5 text-xs text-grey">
          Cancelled
        </span>
      );
    default:
      return null;
  }
}

/**
 * Multi-step swap request flow:
 * 1. Pick one of your upcoming shifts
 * 2. Optionally pick a target shift from another employee
 * 3. Confirm and submit the swap request
 *
 * Below the flow: list of own swap requests with cancel button.
 */
export function SwapRequestFlow({ weekIso, myUserId }: Props) {
  const positions = trpc.scheduling.listPositions.useQuery();
  const roster = trpc.scheduling.listRoster.useQuery();
  const schedule = trpc.scheduling.getScheduleForWeek.useQuery({
    week_start: weekIso,
  });
  const swaps = trpc.scheduling.swaps.list.useQuery();
  const utils = trpc.useUtils();

  const createSwap = trpc.scheduling.swaps.create.useMutation({
    onSuccess: () => {
      void utils.scheduling.swaps.list.invalidate();
      setStep("pick-mine");
      setSelection(null);
    },
  });

  const cancelSwap = trpc.scheduling.swaps.cancel.useMutation({
    onSuccess: () => {
      void utils.scheduling.swaps.list.invalidate();
    },
  });

  const [step, setStep] = useState<Step>("pick-mine");
  const [selection, setSelection] = useState<SwapSelection | null>(null);

  if (
    positions.isLoading ||
    roster.isLoading ||
    schedule.isLoading ||
    swaps.isLoading
  ) {
    return <p className="text-sm text-grey">Loading...</p>;
  }

  const allShifts = (schedule.data?.shifts ?? []) as Array<
    Shift & Record<string, unknown>
  >;
  const positionById = new Map(
    (positions.data ?? []).map((p) => [p.id, p]),
  );
  const userById = new Map(
    (roster.data ?? []).map((u) => [u.user_id, u]),
  );

  const myShifts = allShifts
    .filter((s) => s.user_id === myUserId)
    .filter((s) => new Date(s.start_at) > new Date())
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  const otherShifts = allShifts
    .filter((s) => s.user_id !== null && s.user_id !== myUserId)
    .filter((s) => new Date(s.start_at) > new Date())
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  function formatShiftCard(s: Shift) {
    const pos = positionById.get(s.position_id);
    const user = s.user_id ? userById.get(s.user_id) : null;
    const shiftDate = new Date(s.start_at);
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: pos?.color ?? "#003B6F" }}
            aria-hidden
          />
          <span className="text-sm font-medium text-white">
            {pos?.name ?? "Position"}
          </span>
        </div>
        <p className="text-sm text-grey">{dayLabel(shiftDate)}</p>
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
        {user && (
          <p className="text-xs text-grey">
            {user.full_name ?? "Staff member"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Step 1: Pick my shift */}
      {step === "pick-mine" && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">
            Step 1: Select your shift to swap
          </h2>
          {myShifts.length === 0 ? (
            <div className="rounded-lg border border-grey/30 bg-darkbg/40 p-6 text-center">
              <p className="text-sm text-grey">
                No upcoming shifts to swap.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {myShifts.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelection({
                        myShift: s,
                        targetShift: null,
                        targetEmployeeId: null,
                      });
                      setStep("pick-target");
                    }}
                    className="w-full rounded-lg border border-grey/30 bg-darkbg/40 p-4 text-left hover:border-navy"
                    style={{ minHeight: 44 }}
                  >
                    {formatShiftCard(s)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Step 2: Pick target shift (optional) */}
      {step === "pick-target" && selection && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">
            Step 2: Select a shift to swap with (optional)
          </h2>

          <div className="rounded-lg border border-green/30 bg-darkbg/40 p-4">
            <p className="mb-2 text-xs text-green">Your selected shift:</p>
            {formatShiftCard(selection.myShift)}
          </div>

          <button
            type="button"
            onClick={() => {
              setSelection({
                ...selection,
                targetShift: null,
                targetEmployeeId: null,
              });
              setStep("confirm");
            }}
            className="rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
            style={{ minHeight: 44 }}
          >
            Skip &mdash; post as open swap request
          </button>

          {otherShifts.length === 0 ? (
            <p className="text-sm text-grey">
              No other shifts available to swap with.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {otherShifts.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelection({
                        ...selection,
                        targetShift: s,
                        targetEmployeeId: s.user_id,
                      });
                      setStep("confirm");
                    }}
                    className="w-full rounded-lg border border-grey/30 bg-darkbg/40 p-4 text-left hover:border-navy"
                    style={{ minHeight: 44 }}
                  >
                    {formatShiftCard(s)}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => {
              setStep("pick-mine");
              setSelection(null);
            }}
            className="text-sm text-grey hover:text-white"
            style={{ minHeight: 44 }}
          >
            &larr; Back
          </button>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === "confirm" && selection && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">
            Step 3: Confirm swap request
          </h2>

          <div className="rounded-lg border border-grey/30 bg-darkbg/40 p-4">
            <p className="mb-2 text-xs text-grey">Your shift:</p>
            {formatShiftCard(selection.myShift)}
          </div>

          {selection.targetShift ? (
            <div className="rounded-lg border border-grey/30 bg-darkbg/40 p-4">
              <p className="mb-2 text-xs text-grey">Swap with:</p>
              {formatShiftCard(selection.targetShift)}
            </div>
          ) : (
            <div className="rounded-lg border border-yellow/30 bg-darkbg/40 p-4">
              <p className="text-sm text-yellow">
                Open swap &mdash; any eligible employee can pick this up.
              </p>
            </div>
          )}

          {createSwap.error && (
            <p className="text-sm text-red">{createSwap.error.message}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() =>
                createSwap.mutate({
                  requester_shift_id: selection.myShift.id,
                  target_shift_id: selection.targetShift?.id ?? null,
                  target_employee_id: selection.targetEmployeeId ?? null,
                })
              }
              disabled={createSwap.isPending}
              className="rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              style={{ minHeight: 44 }}
            >
              {createSwap.isPending
                ? "Submitting..."
                : "Submit Swap Request"}
            </button>

            <button
              type="button"
              onClick={() => setStep("pick-target")}
              className="rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
              style={{ minHeight: 44 }}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Existing swap requests */}
      <SwapRequestList
        swaps={swaps.data}
        positionById={positionById}
        onCancel={(id: string) => cancelSwap.mutate({ id })}
        cancelPending={cancelSwap.isPending}
      />
    </div>
  );
}

/**
 * Sub-component: list of own swap requests.
 */
function SwapRequestList({
  swaps,
  positionById,
  onCancel,
  cancelPending,
}: {
  swaps: unknown;
  positionById: Map<string, { id: string; name: string; color: string }>;
  onCancel: (id: string) => void;
  cancelPending: boolean;
}) {
  // The swaps data shape comes from the tRPC procedure. We expect an
  // array of objects with id, status, requester_shift_id, etc.
  const items = Array.isArray(swaps) ? swaps : [];

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-white">Your Swap Requests</h2>

      <ul className="flex flex-col gap-3">
        {items.map((swap: Record<string, unknown>) => {
          const id = swap.id as string;
          const status = swap.status as SwapStatus;

          return (
            <li
              key={id}
              className="rounded-lg border border-grey/30 bg-darkbg/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      Swap Request
                    </span>
                    {swapStatusBadge(status)}
                  </div>
                  {typeof swap.created_at === "string" && (
                    <p className="text-xs text-grey">
                      Requested{" "}
                      {new Date(swap.created_at).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {status === "pending" && (
                  <button
                    type="button"
                    onClick={() => onCancel(id)}
                    disabled={cancelPending}
                    className="shrink-0 rounded border border-red/40 px-3 py-1.5 text-sm text-red hover:bg-red/10 disabled:opacity-50"
                    style={{ minHeight: 44 }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
