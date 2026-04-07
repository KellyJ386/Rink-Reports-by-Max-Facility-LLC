"use client";

export type SyncStatusProps = {
  pendingCount: number;
  lastSyncedAt: Date | null;
  onRetry: () => void;
};

/**
 * Compact textual sync indicator. Shows one of three states:
 *  - "N pending — Retry"  when there are queued writes
 *  - "Synced ✓ at HH:MM"  when fully synced and we have a timestamp
 *  - "Never synced"       when nothing is pending and there is no timestamp
 *
 * Mobile (<md): colored dot + count number only (or just dot when synced).
 * Desktop (md+): full text label.
 */
export function SyncStatus({
  pendingCount,
  lastSyncedAt,
  onRetry,
}: SyncStatusProps) {
  if (pendingCount > 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-grey">
        {/* Mobile: dot + count */}
        <span className="inline-flex items-center gap-1 md:hidden">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--color-brand-yellow)" }}
            aria-hidden="true"
          />
          <span style={{ color: "var(--color-brand-yellow)" }}>
            {pendingCount}
          </span>
        </span>
        {/* Desktop: full label + retry */}
        <span className="hidden md:inline" style={{ color: "var(--color-brand-yellow)" }}>
          {pendingCount} pending
        </span>
        <span className="hidden md:inline" aria-hidden="true">—</span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-grey/40 px-2 py-0.5 text-xs text-grey hover:border-white hover:text-white"
        >
          <span className="inline md:hidden" aria-label="Retry sync">↺</span>
          <span className="hidden md:inline">Retry</span>
        </button>
      </div>
    );
  }

  if (lastSyncedAt === null) {
    return (
      <span className="text-sm text-grey">
        {/* Mobile: grey dot only */}
        <span className="inline-block h-2 w-2 rounded-full bg-grey md:hidden" aria-hidden="true" />
        {/* Desktop: full text */}
        <span className="hidden md:inline">Never synced</span>
      </span>
    );
  }

  const time = lastSyncedAt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <span className="text-sm text-grey">
      {/* Mobile: green dot only */}
      <span
        className="inline-block h-2 w-2 rounded-full md:hidden"
        style={{ backgroundColor: "var(--color-brand-green)" }}
        aria-hidden="true"
      />
      {/* Desktop: full text */}
      <span className="hidden md:inline">
        <span style={{ color: "var(--color-brand-green)" }}>Synced ✓</span> at{" "}
        {time}
      </span>
    </span>
  );
}
