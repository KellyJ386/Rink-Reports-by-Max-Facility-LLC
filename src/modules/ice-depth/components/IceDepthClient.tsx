"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";

import { IceDepthSession } from "@/modules/ice-depth/components/IceDepthSession";
import { RecentIceDepthSessions } from "@/modules/ice-depth/components/RecentIceDepthSessions";

/**
 * Top-level client island for /ice-depth.
 *
 * Loads templates from the staff-facing tRPC router, lets the
 * operator pick one, and mounts a fresh <IceDepthSession /> for that
 * template. The session component owns its own draft state.
 *
 * No hardcoded values: every template, point position, and unit
 * comes from the database (CLAUDE.md Rule 2).
 */
export function IceDepthClient() {
  const templates = trpc.iceDepth.listTemplates.useQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (templates.isLoading) {
    return <p className="text-sm text-grey">Loading…</p>;
  }
  if (templates.error) {
    return (
      <p className="text-sm text-red" role="alert">
        {templates.error.message}
      </p>
    );
  }

  const list = templates.data ?? [];
  if (list.length === 0) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-8 text-center">
        <p className="text-grey">
          No measurement templates yet. Ask your admin to add at least
          one in the Admin Control Center before logging ice depth.
        </p>
      </section>
    );
  }

  const active =
    (selectedId !== null
      ? list.find((t) => t.id === selectedId)
      : undefined) ?? list[0]!;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-grey">Template:</span>
          <select
            value={active.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          >
            {list.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.points.length} pts, {t.unit})
              </option>
            ))}
          </select>
        </label>
      </div>

      <IceDepthSession key={active.id} template={active} />

      <RecentIceDepthSessions templates={list} />
    </div>
  );
}
