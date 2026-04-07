"use client";

import { useState } from "react";

import { useModuleConfig } from "@/hooks/useModuleConfig";

import { IncidentForm } from "@/modules/incidents/components/IncidentForm";
import { RecentIncidents } from "@/modules/incidents/components/RecentIncidents";

/**
 * Top-level client island for /incidents.
 *
 * Reads the four admin-configured string lists (locations, types,
 * injured types, body regions) from facility_config via
 * useModuleConfig and passes them down to the form. The form picks
 * which subset it needs based on the active tab.
 *
 * The two tabs (Incident / Accident) drive the discriminated-union
 * shape sent to the server.
 */
export function IncidentsClient() {
  const config = useModuleConfig("incidents");
  const [tab, setTab] = useState<"incident" | "accident">("incident");

  if (config.isLoading) {
    return <p className="text-sm text-grey">Loading…</p>;
  }
  if (config.error) {
    return (
      <p className="text-sm text-red" role="alert">
        {config.error.message}
      </p>
    );
  }

  const locations = pickList(config.config, "locations");
  const incidentTypes = pickList(config.config, "incident_types");
  const injuredTypes = pickList(config.config, "injured_types");
  const bodyRegions = pickList(config.config, "body_regions");

  if (locations.length === 0 || incidentTypes.length === 0) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-8 text-center">
        <p className="text-grey">
          Locations and incident types are not configured yet. Ask
          your admin to add them in the Admin Control Center before
          logging incidents.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="Report kind"
        className="flex flex-wrap gap-2 border-b border-grey/30 pb-2"
      >
        <button
          type="button"
          onClick={() => setTab("incident")}
          className={
            tab === "incident"
              ? "rounded bg-navy px-3 py-1.5 text-sm font-medium text-white"
              : "rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
          }
        >
          Incident
        </button>
        <button
          type="button"
          onClick={() => setTab("accident")}
          className={
            tab === "accident"
              ? "rounded bg-navy px-3 py-1.5 text-sm font-medium text-white"
              : "rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
          }
        >
          Accident (with injury)
        </button>
      </nav>

      <IncidentForm
        key={tab}
        kind={tab}
        locations={locations}
        incidentTypes={incidentTypes}
        injuredTypes={injuredTypes}
        bodyRegions={bodyRegions}
      />

      <RecentIncidents />
    </div>
  );
}

function pickList(config: Record<string, unknown>, key: string): string[] {
  const raw = config[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string");
}
