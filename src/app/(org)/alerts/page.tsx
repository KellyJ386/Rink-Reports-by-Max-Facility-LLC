"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";

/**
 * Org Alerts page — all unresolved alerts across all org facilities.
 *
 * READ-ONLY. org_admin CANNOT resolve facility alerts — only facility
 * staff can. This view is observational only.
 *
 * Features:
 *   - Grouped by facility (collapsible sections)
 *   - Severity filter: info / warning / critical
 *   - Module (alert_type) filter
 */

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-[#F42A2A]/20 text-[#F42A2A] border-[#F42A2A]/40",
  warning: "bg-[#FFB800]/20 text-[#FFB800] border-[#FFB800]/40",
  info: "bg-[#A5ACAF]/20 text-[#A5ACAF] border-[#A5ACAF]/40",
};

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    SEVERITY_COLORS[severity] ??
    "bg-[#A5ACAF]/20 text-[#A5ACAF] border-[#A5ACAF]/40";
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${cls}`}
    >
      {severity}
    </span>
  );
}

export default function OrgAlertsPage() {
  const [severityFilter, setSeverityFilter] = useState<
    "all" | "info" | "warning" | "critical"
  >("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [collapsedFacilities, setCollapsedFacilities] = useState<
    Set<string>
  >(new Set());

  const { data: alerts, isLoading, error } = trpc.org.getFacilityAlerts.useQuery(undefined);

  // Derive all unique alert types for the module filter
  const allModules = Array.from(
    new Set((alerts ?? []).map((a) => a.alertType)),
  ).sort();

  // Apply filters
  const filtered = (alerts ?? []).filter((a) => {
    if (severityFilter !== "all" && a.severity !== severityFilter) return false;
    if (moduleFilter !== "all" && a.alertType !== moduleFilter) return false;
    return true;
  });

  // Group by facility
  const byFacility: Record<
    string,
    { facilityName: string; alerts: typeof filtered }
  > = {};

  for (const alert of filtered) {
    if (!byFacility[alert.facilityId]) {
      byFacility[alert.facilityId] = {
        facilityName: alert.facilityName,
        alerts: [],
      };
    }
    byFacility[alert.facilityId]!.alerts.push(alert);
  }

  const facilityGroups = Object.entries(byFacility).sort(([, a], [, b]) =>
    a.facilityName.localeCompare(b.facilityName),
  );

  function toggleFacility(facilityId: string) {
    setCollapsedFacilities((prev) => {
      const next = new Set(prev);
      if (next.has(facilityId)) {
        next.delete(facilityId);
      } else {
        next.add(facilityId);
      }
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-white">
          Org-wide Alerts
        </h1>
        <p className="text-sm text-[#A5ACAF]">
          All unresolved alerts across your organization — read-only. Only
          facility staff can resolve alerts.
        </p>
      </header>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        {/* Severity filter */}
        <div className="flex gap-1">
          {(["all", "critical", "warning", "info"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                severityFilter === s
                  ? "bg-[#003B6F] text-white"
                  : "bg-[#001122]/60 text-[#A5ACAF] hover:text-white"
              }`}
            >
              {s === "all" ? "All Severities" : s}
            </button>
          ))}
        </div>

        {/* Module filter */}
        {allModules.length > 0 && (
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="rounded border border-[#A5ACAF]/30 bg-[#001122]/60 px-3 py-1.5 text-xs text-white focus:outline-none"
          >
            <option value="all">All Modules</option>
            {allModules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse h-32 rounded-lg bg-[#A5ACAF]/20"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded border border-[#F42A2A] bg-[#F42A2A]/10 px-4 py-3 text-sm text-[#F42A2A]">
          Failed to load alerts: {error.message}
        </div>
      ) : facilityGroups.length === 0 ? (
        <p className="text-sm text-[#A5ACAF]">
          {alerts?.length === 0
            ? "No open alerts across your organization."
            : "No alerts match the selected filters."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {facilityGroups.map(([facilityId, group]) => {
            const isCollapsed = collapsedFacilities.has(facilityId);
            return (
              <div
                key={facilityId}
                className="rounded-lg border border-[#A5ACAF]/30 bg-[#001122]/40"
              >
                {/* Facility header */}
                <button
                  onClick={() => toggleFacility(facilityId)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">
                      {group.facilityName}
                    </span>
                    <span className="text-xs text-[#A5ACAF]">
                      {group.alerts.length}{" "}
                      {group.alerts.length === 1 ? "alert" : "alerts"}
                    </span>
                  </div>
                  <span className="text-[#A5ACAF] text-xs">
                    {isCollapsed ? "▼ Show" : "▲ Hide"}
                  </span>
                </button>

                {/* Alert list */}
                {!isCollapsed && (
                  <div className="divide-y divide-[#A5ACAF]/20 border-t border-[#A5ACAF]/20">
                    {group.alerts.map((alert) => (
                      <div key={alert.id} className="flex flex-col gap-1 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={alert.severity} />
                          <span className="text-xs text-[#A5ACAF]">
                            {alert.alertType}
                          </span>
                          <span className="ml-auto text-xs text-[#A5ACAF]">
                            {new Date(alert.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-white">
                          {alert.title}
                        </p>
                        <p className="text-xs text-[#A5ACAF]">
                          {alert.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
