"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";

import { AvailabilityLayer } from "@/modules/scheduling/components/AvailabilityLayer";
import { ScheduleEditorLayer } from "@/modules/scheduling/components/ScheduleEditorLayer";
import { LiveBoardLayer } from "@/modules/scheduling/components/LiveBoardLayer";
import { isoMondayOf } from "@/modules/scheduling/week-utils";

type Tab = "availability" | "editor" | "live";

/**
 * Top-level Scheduling client island. Owns the active tab + the
 * currently-selected week. Manager-only tabs (auto-suggest + editor,
 * publishing controls) are nested inside the editor layer; the live
 * board is read-only for everyone.
 */
export function SchedulingClient() {
  const me = trpc.admin.me.useQuery();
  const [tab, setTab] = useState<Tab>("availability");
  const [weekIso, setWeekIso] = useState<string>(() => isoMondayOf(new Date()));

  const isManager =
    me.data?.role === "admin" || me.data?.role === "manager";

  if (me.isLoading) {
    return <p className="text-sm text-grey">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="Scheduling tabs"
        className="flex flex-wrap items-center gap-2 border-b border-grey/30 pb-2"
      >
        <TabButton active={tab === "availability"} onClick={() => setTab("availability")}>
          My availability
        </TabButton>
        {isManager && (
          <TabButton active={tab === "editor"} onClick={() => setTab("editor")}>
            Editor (manager)
          </TabButton>
        )}
        <TabButton active={tab === "live"} onClick={() => setTab("live")}>
          Live board
        </TabButton>

        <div className="ml-auto flex items-center gap-2 text-sm">
          <label className="text-grey">Week of</label>
          <input
            type="date"
            value={weekIso}
            onChange={(e) => {
              const d = new Date(e.target.value + "T00:00:00");
              if (!Number.isNaN(d.getTime())) {
                setWeekIso(isoMondayOf(d));
              }
            }}
            className="rounded border border-grey/40 bg-darkbg px-2 py-1 text-white focus:border-navy focus:outline-none"
          />
        </div>
      </nav>

      {tab === "availability" && <AvailabilityLayer weekIso={weekIso} />}
      {tab === "editor" && isManager && <ScheduleEditorLayer weekIso={weekIso} />}
      {tab === "live" && <LiveBoardLayer weekIso={weekIso} isManager={isManager} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded bg-navy px-3 py-1.5 text-sm font-medium text-white"
          : "rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
      }
    >
      {children}
    </button>
  );
}
