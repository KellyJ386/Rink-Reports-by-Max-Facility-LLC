"use client";

import { trpc } from "@/lib/trpc";
import {
  RESURFACING_LABELS,
  type Template,
} from "@/modules/ice-depth/schema";

/**
 * Recent ice depth sessions for this facility. Server-only — pending
 * draft writes still in the Dexie queue are excluded because the
 * active session card already shows the operator's in-progress draft.
 */
export function RecentIceDepthSessions({
  templates,
}: {
  templates: readonly Template[];
}) {
  const recent = trpc.iceDepth.listRecent.useQuery({ limit: 50 });

  const templateNameById = new Map(templates.map((t) => [t.id, t.name]));

  if (recent.isLoading) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6 print:hidden">
        <h2 className="text-xl font-semibold text-white">Recent sessions</h2>
        <p className="mt-2 text-sm text-grey">Loading…</p>
      </section>
    );
  }
  if (recent.error) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6 print:hidden">
        <h2 className="text-xl font-semibold text-white">Recent sessions</h2>
        <p className="mt-2 text-sm text-red" role="alert">
          {recent.error.message}
        </p>
      </section>
    );
  }

  const rows = recent.data ?? [];

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6 print:hidden">
      <h2 className="text-xl font-semibold text-white">Recent sessions</h2>

      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-grey">
          No sessions yet. Use the form above to log your first one.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-grey/20">
          {rows.map((row) => {
            const name = templateNameById.get(row.template_id) ?? "Template";
            const measured = Object.keys(row.measurements).length;
            const isCompleted = row.status === "completed";
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="flex flex-col">
                  <span className="text-white">
                    {name} · {measured} point{measured === 1 ? "" : "s"}
                    {row.resurfacing_status &&
                      ` · ${RESURFACING_LABELS[row.resurfacing_status]}`}
                  </span>
                  <span className="text-grey">
                    {formatTimestamp(row.submitted_at)}
                  </span>
                  {row.notes && (
                    <span className="text-grey">{row.notes}</span>
                  )}
                </div>
                <span
                  className={
                    isCompleted
                      ? "rounded border border-green/40 px-2 py-0.5 text-xs text-green"
                      : "rounded border border-yellow/60 px-2 py-0.5 text-xs text-yellow"
                  }
                >
                  {isCompleted ? "Completed" : "Draft"}
                </span>
              </li>
            );
          })}
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
