"use client";

import Link from "next/link";

export type SyncStatusValue = "synced" | "pending" | "offline";

export type HeaderProps = {
  facilityName: string;
  userName: string;
  syncStatus: SyncStatusValue;
  pendingCount?: number;
  onMenuToggle: () => void;
};

/**
 * Dashboard chrome header. Purely presentational — owns no state.
 * Parent wires facility/user/sync data and passes a menu toggle handler.
 */
export function Header({
  facilityName,
  userName,
  syncStatus,
  pendingCount,
  onMenuToggle,
}: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-grey/30 bg-darkbg px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label="Open navigation menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded border border-grey/40 text-grey hover:border-white hover:text-white lg:hidden"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Link
          href="/dashboard"
          className="text-lg font-semibold"
          style={{ color: "var(--color-brand-navy)" }}
        >
          RinkReports
        </Link>
        {facilityName && (
          <span className="hidden text-sm text-grey sm:inline">
            {facilityName}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <SyncBadge syncStatus={syncStatus} pendingCount={pendingCount} />
        <span className="hidden text-sm text-grey sm:inline">{userName}</span>
      </div>
    </header>
  );
}

function SyncBadge({
  syncStatus,
  pendingCount,
}: {
  syncStatus: SyncStatusValue;
  pendingCount?: number;
}) {
  const { dotColor, label } = (() => {
    switch (syncStatus) {
      case "synced":
        return { dotColor: "var(--color-brand-green)", label: "Synced" };
      case "pending":
        return {
          dotColor: "var(--color-brand-yellow)",
          label: `${pendingCount ?? 0} pending`,
        };
      case "offline":
        return { dotColor: "var(--color-brand-red)", label: "Offline" };
    }
  })();

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-grey/30 px-2.5 py-1 text-xs text-grey"
      aria-live="polite"
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: dotColor }}
        aria-hidden="true"
      />
      <span>{label}</span>
    </span>
  );
}
