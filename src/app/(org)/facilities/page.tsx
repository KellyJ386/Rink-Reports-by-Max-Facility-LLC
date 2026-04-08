"use client";

import { useState } from "react";
import Link from "next/link";

import { trpc } from "@/lib/trpc";

/**
 * Org Facilities page — card grid of all facilities in the org.
 *
 * READ-ONLY. No data entry from the org roll-up view.
 *
 * Per-card:
 *   - Facility name + plan status badge
 *   - Open alert count (red if critical alerts exist)
 *   - Last daily report date
 *   - Staff count
 *   - Link to /dashboard (TODO: facility impersonation in Phase G+)
 */

function PlanBadge({ status }: { status: string | null }) {
  if (!status) return null;

  const colorMap: Record<string, string> = {
    active: "border-[#4DFF00]/50 bg-[#4DFF00]/10 text-[#4DFF00]",
    trialing: "border-[#FFB800]/50 bg-[#FFB800]/10 text-[#FFB800]",
    past_due: "border-[#F42A2A]/50 bg-[#F42A2A]/10 text-[#F42A2A]",
    canceled: "border-[#A5ACAF]/50 bg-[#A5ACAF]/10 text-[#A5ACAF]",
    paused: "border-[#A5ACAF]/50 bg-[#A5ACAF]/10 text-[#A5ACAF]",
  };

  const cls =
    colorMap[status] ?? "border-[#A5ACAF]/50 bg-[#A5ACAF]/10 text-[#A5ACAF]";

  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function AlertBadge({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="text-sm text-[#A5ACAF]">No open alerts</span>
    );
  }
  return (
    <span className="text-sm font-semibold text-[#F42A2A]">
      {count} open {count === 1 ? "alert" : "alerts"}
    </span>
  );
}

export default function FacilitiesPage() {
  const [filter, setFilter] = useState("");

  const { data: facilities, isLoading, error } = trpc.org.listFacilities.useQuery(
    undefined,
  );

  const filtered = (facilities ?? []).filter((f) =>
    f.facilityName.toLowerCase().includes(filter.toLowerCase()),
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse h-48 rounded-lg bg-[#A5ACAF]/20"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="rounded border border-[#F42A2A] bg-[#F42A2A]/10 px-4 py-3 text-sm text-[#F42A2A]">
          Failed to load facilities: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-white">Facilities</h1>
        <p className="text-sm text-[#A5ACAF]">
          All facilities in your organization — read-only summary view.
        </p>
      </header>

      {/* Text filter */}
      <div className="mb-6">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by facility name…"
          className="w-full max-w-sm rounded border border-[#A5ACAF]/30 bg-[#001122]/60 px-3 py-2 text-sm text-white placeholder-[#A5ACAF] focus:border-[#003B6F] focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[#A5ACAF]">
          {facilities?.length === 0
            ? "No facilities in this organization yet."
            : "No facilities match the filter."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((f) => {
            const lastReport = f.lastDailyReportAt
              ? new Date(f.lastDailyReportAt).toLocaleDateString()
              : "No reports yet";

            return (
              <div
                key={f.facilityId}
                className="flex flex-col gap-3 rounded-lg border border-[#A5ACAF]/30 bg-[#001122]/40 p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-white">
                    {f.facilityName}
                  </h2>
                  <PlanBadge status={f.planStatus} />
                </div>

                <div className="flex flex-col gap-1.5 text-sm text-[#A5ACAF]">
                  <div className="flex items-center justify-between">
                    <span>Open alerts</span>
                    <AlertBadge count={f.activeAlertCount} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Last daily report</span>
                    <span className="text-white">{lastReport}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Staff</span>
                    <span className="text-white">{f.staffCount}</span>
                  </div>
                </div>

                {/*
                  TODO (Phase G+): Clicking this should set the session's
                  active facility to f.facilityId (facility impersonation)
                  so the org_admin can see that facility's full dashboard.
                  For now, link to /dashboard — only works if the org_admin
                  also owns/belongs to that specific facility.
                */}
                <Link
                  href="/dashboard"
                  className="mt-auto inline-flex items-center justify-center rounded-md bg-[#003B6F] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#003B6F]/80"
                >
                  View Dashboard →
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
