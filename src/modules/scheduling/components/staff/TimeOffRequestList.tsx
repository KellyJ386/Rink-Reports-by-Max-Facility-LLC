"use client";

import { trpc } from "@/lib/trpc";
import type { TimeOffRequest } from "@/modules/scheduling/schema";

function statusBadge(status: TimeOffRequest["status"]) {
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
    default:
      return null;
  }
}

function formatCategory(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * List of the current user's own time-off requests. Shows status
 * badges and a cancel button for pending requests.
 */
export function TimeOffRequestList() {
  const requests = trpc.scheduling.timeOff.list.useQuery();
  const utils = trpc.useUtils();

  const cancelRequest = trpc.scheduling.timeOff.cancel.useMutation({
    onSuccess: () => {
      void utils.scheduling.timeOff.list.invalidate();
    },
  });

  if (requests.isLoading) {
    return <p className="text-sm text-grey">Loading requests...</p>;
  }

  const items = (requests.data ?? []) as TimeOffRequest[];

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-grey/30 bg-darkbg/40 p-6 text-center">
        <p className="text-sm text-grey">No time-off requests yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-white">Your Requests</h2>

      <ul className="flex flex-col gap-3">
        {items.map((req) => (
          <li
            key={req.id}
            className="rounded-lg border border-grey/30 bg-darkbg/40 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">
                    {formatCategory(req.category)}
                  </span>
                  {statusBadge(req.status)}
                </div>

                <p className="text-sm text-grey">
                  {formatDate(req.start_date)} &ndash;{" "}
                  {formatDate(req.end_date)}
                </p>

                {req.reason && (
                  <p className="text-xs text-grey">{req.reason}</p>
                )}

                {req.status === "denied" && req.admin_note && (
                  <p className="mt-1 text-xs text-red">
                    Admin note: {req.admin_note}
                  </p>
                )}
              </div>

              {req.status === "pending" && (
                <button
                  type="button"
                  onClick={() => cancelRequest.mutate({ id: req.id })}
                  disabled={cancelRequest.isPending}
                  className="shrink-0 rounded border border-red/40 px-3 py-1.5 text-sm text-red hover:bg-red/10 disabled:opacity-50"
                  style={{ minHeight: 44 }}
                >
                  Cancel
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
