"use client";

import { trpc } from "@/lib/trpc";
import type { SchedulingNotification } from "@/modules/scheduling/schema";

function eventIcon(eventType: string): string {
  switch (eventType) {
    case "shift_assigned":
    case "shift_updated":
      return "~";
    case "shift_swap_requested":
    case "shift_swap_approved":
    case "shift_swap_denied":
      return "<>";
    case "time_off_approved":
    case "time_off_denied":
      return "!";
    case "schedule_published":
      return "*";
    default:
      return "i";
  }
}

function timeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(isoDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Notification center showing unread scheduling notifications.
 * Auto-refreshes every 30 seconds. Supports marking individual
 * or all notifications as read.
 */
export function NotificationCenter() {
  const notifications = trpc.scheduling.notifications.listUnread.useQuery(
    undefined,
    { refetchInterval: 30000 },
  );
  const utils = trpc.useUtils();

  const markRead = trpc.scheduling.notifications.markRead.useMutation({
    onSuccess: () => {
      void utils.scheduling.notifications.listUnread.invalidate();
    },
  });

  const markAllRead =
    trpc.scheduling.notifications.markAllRead.useMutation({
      onSuccess: () => {
        void utils.scheduling.notifications.listUnread.invalidate();
      },
    });

  if (notifications.isLoading) {
    return <p className="text-sm text-grey">Loading notifications...</p>;
  }

  const items = (notifications.data ?? []) as SchedulingNotification[];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-white">Notifications</h2>
          {items.length > 0 && (
            <span className="rounded-full bg-navy px-2 py-0.5 text-xs font-medium text-white">
              {items.length}
            </span>
          )}
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white disabled:opacity-50"
            style={{ minHeight: 44 }}
          >
            {markAllRead.isPending ? "Marking..." : "Mark all read"}
          </button>
        )}
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="rounded-lg border border-grey/30 bg-darkbg/40 p-6 text-center">
          <p className="text-sm text-grey">No unread notifications.</p>
        </div>
      )}

      {/* Notification list */}
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((notif) => (
            <li key={notif.id}>
              <button
                type="button"
                onClick={() => {
                  if (!notif.is_read) {
                    markRead.mutate({ ids: [notif.id] });
                  }
                }}
                className={`w-full rounded-lg border p-4 text-left ${
                  notif.is_read
                    ? "border-grey/20 bg-darkbg/30"
                    : "border-navy/60 bg-darkbg/60"
                }`}
                style={{ minHeight: 44 }}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy/30 text-sm font-bold text-navy">
                    {eventIcon(notif.event_type)}
                  </span>

                  {/* Content */}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p
                      className={`text-sm ${
                        notif.is_read
                          ? "text-grey"
                          : "font-medium text-white"
                      }`}
                    >
                      {notif.message}
                    </p>
                    <p className="text-xs text-grey">
                      {timeAgo(notif.created_at)}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {!notif.is_read && (
                    <span
                      className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-green"
                      aria-label="Unread"
                    />
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
