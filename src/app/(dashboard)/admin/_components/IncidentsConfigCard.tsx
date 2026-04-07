"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import {
  INCIDENTS_CONFIG_HINTS,
  INCIDENTS_CONFIG_KEYS,
  INCIDENTS_CONFIG_LABELS,
  type IncidentsConfigKey,
} from "@/modules/incidents/schema";

/**
 * Incidents admin panel.
 *
 * Four list editors, one per facility_config row under
 * module='incidents': locations, incident_types, injured_types,
 * body_regions. Each list is just an array of strings the staff
 * form turns into a dropdown.
 *
 * Each editor remounts when the server snapshot changes via a `key`
 * prop, so admin edits aren't silently overwritten by background
 * refetches and we don't need a setState-in-effect.
 */
export function IncidentsConfigCard() {
  const config = trpc.admin.getConfig.useQuery({ module: "incidents" });

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Incidents</h2>
      <p className="mt-1 text-sm text-grey">
        Configure the dropdown choices your staff see on the Incident
        and Accident forms. Every value is admin-controlled per
        facility — nothing is hardcoded.
      </p>

      {config.isLoading && (
        <p className="mt-4 text-sm text-grey">Loading…</p>
      )}
      {config.error && (
        <p className="mt-4 text-sm text-red">{config.error.message}</p>
      )}

      {config.data !== undefined && (
        <div className="mt-6 flex flex-col gap-8">
          {INCIDENTS_CONFIG_KEYS.map((key) => (
            <ListEditor
              key={`${key}:${configKey(config.data, key)}`}
              configKey={key}
              initial={pickList(config.data, key)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// =====================================================================
// List editor (one per config key)
// =====================================================================

function ListEditor({
  configKey,
  initial,
}: {
  configKey: IncidentsConfigKey;
  initial: string[];
}) {
  const utils = trpc.useUtils();
  const setList = trpc.admin.incidents.setList.useMutation({
    onSuccess: () => {
      utils.admin.getConfig.invalidate({ module: "incidents" });
      setSaved(true);
    },
  });

  // Stored as a single newline-separated text area for editability;
  // we split on save.
  const [text, setText] = useState(() => initial.join("\n"));
  const [saved, setSaved] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = text
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    setList.mutate({ key: configKey, values });
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-white">
        {INCIDENTS_CONFIG_LABELS[configKey]}
      </h3>
      <p className="mt-1 text-sm text-grey">
        {INCIDENTS_CONFIG_HINTS[configKey]}
      </p>

      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3">
        <textarea
          rows={6}
          value={text}
          onChange={(e) => {
            setSaved(false);
            setText(e.target.value);
          }}
          className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-sm text-white focus:border-navy focus:outline-none"
          placeholder="One value per line"
        />

        {setList.error && (
          <p className="text-sm text-red">{setList.error.message}</p>
        )}
        {saved && <p className="text-sm text-green">List saved.</p>}

        <div>
          <button
            type="submit"
            disabled={setList.isPending}
            className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {setList.isPending ? "Saving…" : "Save list"}
          </button>
        </div>
      </form>
    </div>
  );
}

// =====================================================================
// Config payload helpers
// =====================================================================

function configKey(rows: unknown, key: string): string {
  if (!Array.isArray(rows)) return "empty";
  for (const row of rows) {
    if (
      row !== null &&
      typeof row === "object" &&
      "key" in row &&
      "value" in row &&
      (row as { key: unknown }).key === key
    ) {
      return JSON.stringify((row as { value: unknown }).value);
    }
  }
  return "empty";
}

function pickList(rows: unknown, key: string): string[] {
  if (!Array.isArray(rows)) return [];
  for (const row of rows) {
    if (
      row !== null &&
      typeof row === "object" &&
      "key" in row &&
      "value" in row &&
      (row as { key: unknown }).key === key
    ) {
      const v = (row as { value: unknown }).value;
      if (Array.isArray(v)) {
        return v.filter((s): s is string => typeof s === "string");
      }
    }
  }
  return [];
}
