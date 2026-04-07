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
 */
export function SyncStatus({
  pendingCount,
  lastSyncedAt,
  onRetry,
}: SyncStatusProps) {
  if (pendingCount > 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-grey">
        <span style={{ color: "var(--color-brand-yellow)" }}>
          {pendingCount} pending
        </span>
        <span aria-hidden="true">—</span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-grey/40 px-2 py-0.5 text-xs text-grey hover:border-white hover:text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (lastSyncedAt === null) {
    return <span className="text-sm text-grey">Never synced</span>;
  }

  const time = lastSyncedAt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <span className="text-sm text-grey">
      <span style={{ color: "var(--color-brand-green)" }}>Synced ✓</span> at{" "}
      {time}
    </span>
  );
}
