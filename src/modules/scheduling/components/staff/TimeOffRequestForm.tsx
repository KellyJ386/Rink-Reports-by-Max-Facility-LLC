"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";
import type { TimeOffCategory } from "@/modules/scheduling/schema";
import { TimeOffRequestList } from "@/modules/scheduling/components/staff/TimeOffRequestList";

const CATEGORIES: { value: TimeOffCategory; label: string }[] = [
  { value: "vacation", label: "Vacation" },
  { value: "sick", label: "Sick" },
  { value: "personal", label: "Personal" },
  { value: "unpaid", label: "Unpaid" },
];

/**
 * Form to submit a new time-off request, followed by the list of
 * own requests with status badges.
 */
export function TimeOffRequestForm() {
  const utils = trpc.useUtils();

  const [category, setCategory] = useState<TimeOffCategory>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const submit = trpc.scheduling.timeOff.submit.useMutation({
    onSuccess: () => {
      setSubmitSuccess(true);
      setSubmitError(null);
      setStartDate("");
      setEndDate("");
      setReason("");
      setCategory("vacation");
      void utils.scheduling.timeOff.list.invalidate();
      setTimeout(() => setSubmitSuccess(false), 3000);
    },
    onError: (err) => {
      setSubmitError(err.message);
      setSubmitSuccess(false);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(false);

    if (!startDate || !endDate) {
      setSubmitError("Please select both start and end dates.");
      return;
    }
    if (endDate < startDate) {
      setSubmitError("End date must be on or after start date.");
      return;
    }

    submit.mutate({
      category,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim() || null,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Request form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-grey/30 bg-darkbg/40 p-6"
      >
        <h2 className="mb-4 text-lg font-semibold text-white">
          Request Time Off
        </h2>

        <div className="flex flex-col gap-4">
          {/* Category */}
          <label className="flex flex-col gap-1">
            <span className="text-sm text-grey">Category</span>
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as TimeOffCategory)
              }
              className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              style={{ minHeight: 44 }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          {/* Date range */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-grey">Start Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
                style={{ minHeight: 44 }}
                required
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-grey">End Date</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
                style={{ minHeight: 44 }}
                required
              />
            </label>
          </div>

          {/* Reason */}
          <label className="flex flex-col gap-1">
            <span className="text-sm text-grey">Reason (optional)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Optional reason for your request..."
              className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white placeholder:text-grey/60 focus:border-navy focus:outline-none"
            />
          </label>

          {/* Feedback */}
          {submitError && (
            <p className="text-sm text-red">{submitError}</p>
          )}
          {submitSuccess && (
            <p className="text-sm text-green">
              Time-off request submitted successfully.
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submit.isPending}
            className="rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            style={{ minHeight: 44 }}
          >
            {submit.isPending ? "Submitting..." : "Submit Request"}
          </button>
        </div>
      </form>

      {/* Own requests list */}
      <TimeOffRequestList />
    </div>
  );
}
