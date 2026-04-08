"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";

import { ChecklistForm } from "@/modules/daily-reports/components/ChecklistForm";
import { RecentSubmissions } from "@/modules/daily-reports/components/RecentSubmissions";
import { WeatherCard } from "@/modules/daily-reports/components/WeatherCard";

/**
 * Top-level client island for /daily-reports.
 *
 * Loads checklists from `dailyReports.listChecklists`, renders a tab
 * strip (one tab per checklist), and shows the form for the active
 * checklist plus the recent-submissions panel.
 *
 * No hardcoded values: tab names and form fields all come from the
 * facility's checklists in the database (CLAUDE.md Rule 2).
 */
export function DailyReportsClient() {
  const checklists = trpc.dailyReports.listChecklists.useQuery();
  // `null` means "the user hasn't picked a tab yet — fall back to the
  // first checklist". This is derived during render so we don't need
  // an effect just to set the default.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (checklists.isLoading) {
    return <p className="text-sm text-grey">Loading checklists…</p>;
  }

  if (checklists.error) {
    return (
      <p className="text-sm text-red" role="alert">
        {checklists.error.message}
      </p>
    );
  }

  const list = checklists.data ?? [];

  if (list.length === 0) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-8 text-center">
        <p className="text-grey">
          No checklists yet. Ask your admin to add a checklist in the Admin
          Control Center.
        </p>
      </section>
    );
  }

  const active =
    (selectedId !== null
      ? list.find((c) => c.id === selectedId)
      : undefined) ?? list[0]!;

  return (
    <div className="flex flex-col gap-6">
      <WeatherCard />

      <nav
        aria-label="Daily Report tabs"
        className="flex flex-wrap gap-2 border-b border-grey/30 pb-2"
      >
        {list.map((c) => {
          const isActive = c.id === active.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={
                isActive
                  ? "rounded bg-navy px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
              }
            >
              {c.name}
            </button>
          );
        })}
      </nav>

      <ChecklistForm key={active.id} checklist={active} />

      <RecentSubmissions checklists={list} />
    </div>
  );
}
