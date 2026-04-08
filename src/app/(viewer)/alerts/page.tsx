"use client";

/**
 * Viewer Alerts Page
 *
 * Read-only view of active facility alerts. Viewers can see all alerts
 * scoped to their facility but cannot resolve them.
 *
 * TODO: depends on phase-c/anomaly-detection (Agent 2).
 * The `trpc.alerts.list` procedure is added by the anomaly-detection
 * agent. This page will compile once that branch is merged.
 */

// TODO: depends on phase-c/anomaly-detection
// import { trpc } from "@/lib/trpc";

import { useState } from "react";

type AlertSeverity = "info" | "warning" | "critical";

interface Alert {
  id: string;
  severity: AlertSeverity;
  message: string;
  module: string;
  createdAt: string;
  resolved: boolean;
}

const SEVERITY_STYLES: Record<
  AlertSeverity,
  { badge: string; text: string; dot: string }
> = {
  info: {
    badge: "border-blue-500/50 bg-blue-500/10",
    text: "text-blue-400",
    dot: "bg-blue-400",
  },
  warning: {
    badge: "border-yellow/50 bg-yellow/10",
    text: "text-yellow",
    dot: "bg-yellow",
  },
  critical: {
    badge: "border-red/50 bg-red/10",
    text: "text-red",
    dot: "bg-red",
  },
};

const PAGE_SIZE = 20;

export default function ViewerAlertsPage() {
  const [page, setPage] = useState(0);

  // TODO: depends on phase-c/anomaly-detection — uncomment once the
  // alertsRouter is merged:
  //
  // const { data, isLoading, error } = trpc.alerts.list.useQuery({
  //   resolved: false,
  // });
  //
  // Replace the stub below with `data?.alerts ?? []` once the
  // procedure exists.
  const isLoading = false;
  const error: null = null;
  const allAlerts: Alert[] = [];

  const sorted = [...allAlerts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const pageAlerts = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Active Alerts</h1>
        <p className="mt-1 text-sm text-grey">
          Unresolved facility alerts. Contact your manager or administrator
          to resolve an alert.
        </p>
      </div>

      {isLoading && (
        <p className="text-sm text-grey">Loading alerts…</p>
      )}

      {error && (
        <p className="text-sm text-red">Failed to load alerts.</p>
      )}

      {!isLoading && !error && allAlerts.length === 0 && (
        <div className="rounded-lg border border-grey/30 bg-darkbg/40 p-8 text-center">
          <p className="text-grey">No active alerts.</p>
          <p className="mt-1 text-xs text-grey/60">
            Alert data will appear here once phase-c/anomaly-detection is
            merged.
          </p>
        </div>
      )}

      {pageAlerts.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-grey/30">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-grey/30 bg-darkbg/60 text-grey">
                  <th className="py-3 pl-4 pr-4 font-normal">Severity</th>
                  <th className="py-3 pr-4 font-normal">Message</th>
                  <th className="py-3 pr-4 font-normal">Module</th>
                  <th className="py-3 pr-4 font-normal">Time</th>
                </tr>
              </thead>
              <tbody>
                {pageAlerts.map((alert) => {
                  const styles = SEVERITY_STYLES[alert.severity];
                  return (
                    <tr
                      key={alert.id}
                      className="border-b border-grey/10 last:border-0 hover:bg-white/5"
                    >
                      <td className="py-3 pl-4 pr-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${styles.badge} ${styles.text}`}
                        >
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${styles.dot}`}
                          />
                          {alert.severity}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-white">{alert.message}</td>
                      <td className="py-3 pr-4 text-grey capitalize">
                        {alert.module.replace(/-/g, " ")}
                      </td>
                      <td className="py-3 pr-4 text-grey">
                        {new Date(alert.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-grey">
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded border border-grey/40 px-3 py-1 hover:border-white hover:text-white disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-grey/40 px-3 py-1 hover:border-white hover:text-white disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
