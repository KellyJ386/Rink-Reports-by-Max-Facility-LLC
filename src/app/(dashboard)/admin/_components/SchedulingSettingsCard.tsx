"use client";

import { useState, useEffect } from "react";

import { trpc } from "@/lib/trpc";

const inputClass =
  "rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none";

/**
 * Admin card for facility-wide scheduling settings: swap approval,
 * notice-hour thresholds, and availability deadline day.
 */
export function SchedulingSettingsCard() {
  const config = trpc.scheduling.facilityConfig.get.useQuery();
  const update = trpc.scheduling.facilityConfig.update.useMutation({
    onSuccess: () => {
      setStatus("saved");
      utils.scheduling.facilityConfig.get.invalidate();
    },
    onError: () => setStatus("error"),
  });
  const utils = trpc.useUtils();

  const [swapRequiresApproval, setSwapRequiresApproval] = useState(true);
  const [pickupNoticeHours, setPickupNoticeHours] = useState("24");
  const [swapNoticeHours, setSwapNoticeHours] = useState("48");
  const [deadlineDay, setDeadlineDay] = useState("15");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  // Populate form from server data
  useEffect(() => {
    if (config.data) {
      const c = config.data;
      setSwapRequiresApproval(c.swap_requires_approval);
      setPickupNoticeHours(String(c.pickup_notice_hours));
      setSwapNoticeHours(String(c.swap_notice_hours));
      setDeadlineDay(String(c.availability_deadline_day));
    }
  }, [config.data]);

  function handleSave() {
    setStatus("idle");
    update.mutate({
      swap_requires_approval: swapRequiresApproval,
      pickup_notice_hours: Number(pickupNoticeHours) || 24,
      swap_notice_hours: Number(swapNoticeHours) || 48,
      availability_deadline_day: Number(deadlineDay) || 15,
    });
  }

  if (config.isLoading) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <h2 className="text-xl font-semibold text-white">
          Scheduling Settings
        </h2>
        <p className="mt-4 text-sm text-grey">Loading…</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">
        Scheduling Settings
      </h2>
      <p className="mt-1 text-sm text-grey">
        Configure facility-wide scheduling policies for shift swaps,
        open-shift pickups, and availability submission deadlines.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {/* Swap approval toggle */}
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={swapRequiresApproval}
            onChange={(e) => setSwapRequiresApproval(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-white">
            Shift swaps require manager approval
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-grey">Pickup notice (hours)</span>
            <input
              type="number"
              min={0}
              max={168}
              value={pickupNoticeHours}
              onChange={(e) => setPickupNoticeHours(e.target.value)}
              className={inputClass}
            />
            <span className="text-xs text-grey">
              Minimum hours before shift start to claim an open shift.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-grey">Swap notice (hours)</span>
            <input
              type="number"
              min={0}
              max={168}
              value={swapNoticeHours}
              onChange={(e) => setSwapNoticeHours(e.target.value)}
              className={inputClass}
            />
            <span className="text-xs text-grey">
              Minimum hours before shift start to request a swap.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-grey">Availability deadline (day)</span>
            <input
              type="number"
              min={1}
              max={28}
              value={deadlineDay}
              onChange={(e) => setDeadlineDay(e.target.value)}
              className={inputClass}
            />
            <span className="text-xs text-grey">
              Day of the month by which staff must submit next month&apos;s
              availability.
            </span>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={update.isPending}
            className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {update.isPending ? "Saving…" : "Save settings"}
          </button>
          {status === "saved" && (
            <span className="text-sm text-green">Saved.</span>
          )}
          {status === "error" && (
            <span className="text-sm text-red">
              {update.error?.message ?? "Save failed."}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
