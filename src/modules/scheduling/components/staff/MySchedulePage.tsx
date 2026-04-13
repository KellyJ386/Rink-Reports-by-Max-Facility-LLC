"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";
import { isoMondayOf } from "@/modules/scheduling/week-utils";
import { WeekAtAGlance } from "@/modules/scheduling/components/staff/WeekAtAGlance";
import { OpenShiftsFeed } from "@/modules/scheduling/components/staff/OpenShiftsFeed";
import { TimeOffRequestForm } from "@/modules/scheduling/components/staff/TimeOffRequestForm";
import { SwapRequestFlow } from "@/modules/scheduling/components/staff/SwapRequestFlow";
import { NotificationCenter } from "@/modules/scheduling/components/staff/NotificationCenter";

const TABS = [
  "This Week",
  "Open Shifts",
  "Time Off",
  "Swaps",
  "Notifications",
] as const;

type Tab = (typeof TABS)[number];

/**
 * Top-level client island for the staff-facing My Schedule page.
 * Owns the active tab selection and provides the current user context
 * plus current week ISO string to child components.
 */
export function MySchedulePage() {
  const me = trpc.admin.me.useQuery();
  const [activeTab, setActiveTab] = useState<Tab>("This Week");
  const [weekIso] = useState<string>(() => isoMondayOf(new Date()));

  if (me.isLoading) {
    return <p className="text-sm text-grey">Loading...</p>;
  }

  if (me.error || !me.data) {
    return (
      <p className="text-sm text-red">
        Unable to load your profile. Please try refreshing the page.
      </p>
    );
  }

  const myUserId = me.data.user_id;

  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar */}
      <nav
        aria-label="My Schedule tabs"
        className="flex flex-wrap items-center gap-2 border-b border-grey/30 pb-2"
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={
              activeTab === tab
                ? "rounded bg-navy px-3 py-1.5 text-sm font-medium text-white"
                : "rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
            }
            style={{ minHeight: 44 }}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Active tab content */}
      {activeTab === "This Week" && (
        <WeekAtAGlance weekIso={weekIso} myUserId={myUserId} />
      )}
      {activeTab === "Open Shifts" && (
        <OpenShiftsFeed weekIso={weekIso} myUserId={myUserId} />
      )}
      {activeTab === "Time Off" && <TimeOffRequestForm />}
      {activeTab === "Swaps" && (
        <SwapRequestFlow weekIso={weekIso} myUserId={myUserId} />
      )}
      {activeTab === "Notifications" && <NotificationCenter />}
    </div>
  );
}
