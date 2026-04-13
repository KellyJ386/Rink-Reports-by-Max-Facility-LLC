"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";

import { AvailabilityLayer } from "@/modules/scheduling/components/AvailabilityLayer";
import { ScheduleEditorLayer } from "@/modules/scheduling/components/ScheduleEditorLayer";
import { LiveBoardLayer } from "@/modules/scheduling/components/LiveBoardLayer";
import { ScheduleHeader } from "@/modules/scheduling/components/ScheduleHeader";
import { AreaTabs } from "@/modules/scheduling/components/AreaTabs";
import { WeekGrid } from "@/modules/scheduling/components/WeekGrid";
import { DailyView } from "@/modules/scheduling/components/DailyView";
import { ScheduleLockBanner } from "@/modules/scheduling/components/ScheduleLockBanner";
import { SchedulePublishFlow } from "@/modules/scheduling/components/SchedulePublishFlow";
import { TemplateManager } from "@/modules/scheduling/components/TemplateManager";
import { EmployeeManager } from "@/modules/scheduling/components/EmployeeManager";
import { AreaManager } from "@/modules/scheduling/components/AreaManager";
import { isoMondayOf } from "@/modules/scheduling/week-utils";

type Tab = "availability" | "editor" | "live" | "employees" | "areas";

/**
 * Top-level Scheduling client island. Owns the active tab + the
 * currently-selected week. Manager-only tabs (editor, employees, areas)
 * are gated by role. The editor tab integrates ScheduleHeader, AreaTabs,
 * WeekGrid / DailyView, ScheduleLockBanner, TemplateManager, and
 * SchedulePublishFlow.
 */
export function SchedulingClient() {
  const me = trpc.admin.me.useQuery();
  const [tab, setTab] = useState<Tab>("availability");
  const [weekIso, setWeekIso] = useState<string>(() => isoMondayOf(new Date()));

  const isManager =
    me.data?.role === "admin" || me.data?.role === "manager";

  if (me.isLoading) {
    return <p className="text-sm text-grey">Loading...</p>;
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
        {isManager && (
          <TabButton active={tab === "employees"} onClick={() => setTab("employees")}>
            Employees
          </TabButton>
        )}
        {isManager && (
          <TabButton active={tab === "areas"} onClick={() => setTab("areas")}>
            Areas
          </TabButton>
        )}

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
      {tab === "editor" && isManager && (
        <EditorTab weekIso={weekIso} onWeekChange={setWeekIso} />
      )}
      {tab === "live" && <LiveBoardLayer weekIso={weekIso} isManager={isManager} />}
      {tab === "employees" && isManager && <EmployeeManager />}
      {tab === "areas" && isManager && <AreaManager />}
    </div>
  );
}

// =====================================================================
// Editor tab (integrated new components)
// =====================================================================

function EditorTab({
  weekIso,
  onWeekChange,
}: {
  weekIso: string;
  onWeekChange: (iso: string) => void;
}) {
  const utils = trpc.useUtils();
  const schedule = trpc.scheduling.getScheduleForWeek.useQuery({
    week_start: weekIso,
  });

  const ensureDraft = trpc.scheduling.ensureDraftSchedule.useMutation({
    onSuccess: () =>
      utils.scheduling.getScheduleForWeek.invalidate({ week_start: weekIso }),
  });

  const [areaId, setAreaId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [dailyDayOffset, setDailyDayOffset] = useState(0);
  const [showPublish, setShowPublish] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  if (schedule.isLoading) {
    return <p className="text-sm text-grey">Loading editor...</p>;
  }

  const sched = schedule.data?.schedule ?? null;
  const shifts = schedule.data?.shifts ?? [];

  // Derive a typed schedule object with is_locked defaulting to false
  // since the current router query may not return it yet.
  const scheduleForHeader = sched
    ? {
        id: sched.id,
        status: sched.status,
        is_locked: "is_locked" in sched ? (sched as Record<string, unknown>).is_locked === true : false,
      }
    : null;

  function handleUnlock() {
    // Placeholder: will be wired to trpc.scheduling.unlockSchedule
    // once the server-side procedure is created.
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Schedule Header */}
      <ScheduleHeader
        weekIso={weekIso}
        onWeekChange={onWeekChange}
        schedule={scheduleForHeader}
        isManager
        onPublish={() => setShowPublish(true)}
        onUnlock={handleUnlock}
      />

      {/* Lock banner */}
      {scheduleForHeader?.is_locked && (
        <ScheduleLockBanner
          isLocked
          isManager
          onUnlock={handleUnlock}
        />
      )}

      {/* Area tabs */}
      <AreaTabs
        activeAreaId={areaId}
        onAreaChange={setAreaId}
        isManager
      />

      {/* Toolbar: view mode toggle + template button + create draft */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded border border-grey/30 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("week")}
            className={
              viewMode === "week"
                ? "rounded bg-navy px-3 py-1.5 text-xs font-medium text-white"
                : "rounded px-3 py-1.5 text-xs text-grey hover:text-white"
            }
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => setViewMode("day")}
            className={
              viewMode === "day"
                ? "rounded bg-navy px-3 py-1.5 text-xs font-medium text-white"
                : "rounded px-3 py-1.5 text-xs text-grey hover:text-white"
            }
          >
            Day
          </button>
        </div>

        {viewMode === "day" && (
          <select
            value={dailyDayOffset}
            onChange={(e) => setDailyDayOffset(Number(e.target.value))}
            className="rounded border border-grey/40 bg-darkbg px-2 py-1.5 text-xs text-white"
          >
            {(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const).map(
              (d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ),
            )}
          </select>
        )}

        <button
          type="button"
          onClick={() => setShowTemplates(true)}
          className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
        >
          Templates
        </button>

        {!sched && (
          <button
            type="button"
            onClick={() => ensureDraft.mutate({ week_start: weekIso })}
            disabled={ensureDraft.isPending}
            className="rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {ensureDraft.isPending ? "Creating..." : "Create draft"}
          </button>
        )}
      </div>

      {/* Grid or daily view */}
      {viewMode === "week" ? (
        <WeekGrid
          weekIso={weekIso}
          schedule={scheduleForHeader}
          shifts={shifts}
          areaId={areaId}
          isManager
        />
      ) : (
        <DailyView
          weekIso={weekIso}
          dayOffset={dailyDayOffset}
          shifts={shifts}
          isManager
        />
      )}

      {/* Legacy editor (auto-suggest + shift list) */}
      {sched && (
        <details className="rounded-lg border border-grey/30 bg-darkbg/40">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-grey hover:text-white">
            Auto-suggest &amp; Shift List (advanced)
          </summary>
          <div className="px-4 pb-4">
            <ScheduleEditorLayer weekIso={weekIso} />
          </div>
        </details>
      )}

      {/* Publish modal */}
      {showPublish && sched && (
        <SchedulePublishFlow
          scheduleId={sched.id}
          shifts={shifts}
          onClose={() => setShowPublish(false)}
          onPublished={() => {
            setShowPublish(false);
            utils.scheduling.getScheduleForWeek.invalidate({
              week_start: weekIso,
            });
          }}
        />
      )}

      {/* Template manager modal */}
      {showTemplates && (
        <TemplateManager
          weekIso={weekIso}
          scheduleId={sched?.id ?? null}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  );
}

// =====================================================================
// Tab button
// =====================================================================

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
