"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";

type Days = 7 | 30 | 90;

/**
 * Org Metrics page — aggregated roll-up stats across all org facilities.
 *
 * READ-ONLY. No data entry from the org roll-up view.
 *
 * Features:
 *   - 7 / 30 / 90 day range toggle
 *   - Roll-up stat cards from getRollupMetrics
 *   - Facilities breakdown table from listFacilities
 *   - "Export CSV" button — client-side generation from fetched data
 */

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-[#A5ACAF]/30 bg-[#001122]/40 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[#A5ACAF]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[#A5ACAF]">{sub}</p>}
    </div>
  );
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function downloadCsv(
  facilities: {
    facilityName: string;
    planStatus: string | null;
    activeAlertCount: number;
    lastDailyReportAt: string | null;
    staffCount: number;
  }[],
  days: Days,
) {
  const header = [
    "Facility",
    "Plan Status",
    "Open Alerts",
    "Last Daily Report",
    "Staff Count",
  ].join(",");

  const rows = facilities.map((f) =>
    [
      JSON.stringify(f.facilityName),
      JSON.stringify(f.planStatus ?? ""),
      f.activeAlertCount,
      JSON.stringify(f.lastDailyReportAt ?? ""),
      f.staffCount,
    ].join(","),
  );

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `org-facilities-${days}d-${new Date().toISOString().substring(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MetricsPage() {
  const [days, setDays] = useState<Days>(30);

  const metricsQuery = trpc.org.getRollupMetrics.useQuery({ days });
  const facilitiesQuery = trpc.org.listFacilities.useQuery(undefined);

  const m = metricsQuery.data;
  const facilities = facilitiesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-white">Metrics</h1>
        <p className="text-sm text-[#A5ACAF]">
          Aggregated performance across all facilities — read-only.
        </p>
      </header>

      {/* Range toggle */}
      <div className="mb-6 flex gap-2">
        {([7, 30, 90] as Days[]).map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              days === d
                ? "bg-[#003B6F] text-white"
                : "bg-[#001122]/60 text-[#A5ACAF] hover:text-white"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Roll-up stat cards */}
      {metricsQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className="animate-pulse h-24 rounded-lg bg-[#A5ACAF]/20"
            />
          ))}
        </div>
      ) : metricsQuery.error ? (
        <div className="rounded border border-[#F42A2A] bg-[#F42A2A]/10 px-4 py-3 text-sm text-[#F42A2A]">
          Failed to load metrics: {metricsQuery.error.message}
        </div>
      ) : m ? (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Total Incidents" value={m.totalIncidents} />
          <StatCard label="Total Accidents" value={m.totalAccidents} />
          <StatCard
            label="Avg AQ Tier"
            value={
              m.avgAirQualityTier !== null
                ? m.avgAirQualityTier.toFixed(2)
                : "—"
            }
          />
          <StatCard
            label="Facilities w/ Open Alerts"
            value={m.facilitiesWithOpenAlerts}
          />
          <StatCard
            label="Report Completion"
            value={pct(m.dailyReportCompletionRate)}
            sub={`${days}-day window`}
          />
          <StatCard label="Facilities Active" value={m.facilitiesActive} />
          <StatCard label="Facilities Trialing" value={m.facilitiesOnTrial} />
        </div>
      ) : null}

      {/* Facilities breakdown table */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          Facilities Breakdown
        </h2>
        {facilities.length > 0 && (
          <button
            onClick={() => downloadCsv(facilities, days)}
            className="rounded-md bg-[#003B6F] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#003B6F]/80"
          >
            Export CSV
          </button>
        )}
      </div>

      {facilitiesQuery.isLoading ? (
        <div className="animate-pulse h-40 rounded-lg bg-[#A5ACAF]/20" />
      ) : facilitiesQuery.error ? (
        <div className="rounded border border-[#F42A2A] bg-[#F42A2A]/10 px-4 py-3 text-sm text-[#F42A2A]">
          {facilitiesQuery.error.message}
        </div>
      ) : facilities.length === 0 ? (
        <p className="text-sm text-[#A5ACAF]">
          No facilities in this organization yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#A5ACAF]/30">
          <table className="w-full text-sm">
            <thead className="border-b border-[#A5ACAF]/30 bg-[#001122]/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-[#A5ACAF]">
                  Facility
                </th>
                <th className="px-4 py-3 text-left font-medium text-[#A5ACAF]">
                  Plan
                </th>
                <th className="px-4 py-3 text-right font-medium text-[#A5ACAF]">
                  Open Alerts
                </th>
                <th className="px-4 py-3 text-left font-medium text-[#A5ACAF]">
                  Last Daily Report
                </th>
                <th className="px-4 py-3 text-right font-medium text-[#A5ACAF]">
                  Staff
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#A5ACAF]/20">
              {facilities.map((f) => (
                <tr key={f.facilityId} className="bg-[#001122]/20">
                  <td className="px-4 py-3 font-medium text-white">
                    {f.facilityName}
                  </td>
                  <td className="px-4 py-3 text-[#A5ACAF]">
                    {f.planStatus ?? "—"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      f.activeAlertCount > 0
                        ? "text-[#F42A2A]"
                        : "text-[#A5ACAF]"
                    }`}
                  >
                    {f.activeAlertCount}
                  </td>
                  <td className="px-4 py-3 text-[#A5ACAF]">
                    {f.lastDailyReportAt
                      ? new Date(f.lastDailyReportAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-white">
                    {f.staffCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
