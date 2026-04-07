"use client";

import { trpc } from "@/lib/trpc";

/**
 * Recent incidents (both kinds) for this facility. Server-only —
 * pending Dexie writes show up briefly through the queue but the
 * incidents flow doesn't need a live merge view because submit
 * always resets the form, so the operator immediately sees the
 * row appear here once the sync round-trips.
 */
export function RecentIncidents() {
  const recent = trpc.incidents.listRecent.useQuery({ limit: 50 });

  if (recent.isLoading) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <h2 className="text-xl font-semibold text-white">Recent reports</h2>
        <p className="mt-2 text-sm text-grey">Loading…</p>
      </section>
    );
  }
  if (recent.error) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <h2 className="text-xl font-semibold text-white">Recent reports</h2>
        <p className="mt-2 text-sm text-red" role="alert">
          {recent.error.message}
        </p>
      </section>
    );
  }

  const rows = recent.data ?? [];

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Recent reports</h2>

      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-grey">
          No reports yet. Use the form above to log your first one.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-grey/20">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"
            >
              <div className="flex flex-col">
                <span className="text-white">
                  {row.incident_type} · {row.location}
                </span>
                <span className="text-grey">
                  {formatTimestamp(row.occurred_at)}
                </span>
                <span className="text-grey line-clamp-2 max-w-xl">
                  {row.description}
                </span>
              </div>
              <span
                className={
                  row.kind === "accident"
                    ? "rounded border border-red/60 px-2 py-0.5 text-xs text-red"
                    : "rounded border border-grey/40 px-2 py-0.5 text-xs text-grey"
                }
              >
                {row.kind === "accident" ? "Accident" : "Incident"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
