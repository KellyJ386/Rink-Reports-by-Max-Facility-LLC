"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * CalendarFeedCard — "Calendar Export"
 *
 * Displayed in the Admin Control Center. Exposes the facility's public
 * ICS feed URL for subscribing in Google Calendar, Apple Calendar, or
 * Outlook.
 *
 * The token lives in facility_config.calendar_feed_token and is gated
 * by facility_config.calendar_feed_enabled. Regenerating the token
 * breaks every existing subscription — confirmed with a dialog.
 */
export function CalendarFeedCard() {
  const urlQuery = trpc.admin.getCalendarFeedUrl.useQuery();
  const enableMutation = trpc.admin.enableCalendarFeed.useMutation({
    onSuccess: () => {
      void urlQuery.refetch();
    },
  });
  const regenerateMutation = trpc.admin.regenerateCalendarToken.useMutation({
    onSuccess: () => {
      void urlQuery.refetch();
    },
  });

  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const feedUrl = urlQuery.data?.url ?? null;
  const enabled = urlQuery.data?.enabled ?? false;
  const webcalUrl = feedUrl ? feedUrl.replace(/^https?:/, "webcal:") : null;

  async function handleCopy() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent — clipboard denied
    }
  }

  function handleRegenerate() {
    regenerateMutation.mutate();
    setConfirmRegen(false);
  }

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/50 p-6">
      <h2 className="text-lg font-semibold text-white">Calendar Export</h2>
      <p className="mt-1 text-sm text-grey">
        Publish the facility&apos;s shift schedule as an ICS feed so staff
        can subscribe in Google Calendar, Apple Calendar, or Outlook.
      </p>

      {urlQuery.isLoading && (
        <p className="mt-4 text-sm text-grey">Loading…</p>
      )}

      {urlQuery.isError && (
        <p className="mt-4 text-sm text-[var(--color-brand-red)]">
          Failed to load calendar feed settings.
        </p>
      )}

      {urlQuery.data && !enabled && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => enableMutation.mutate()}
            disabled={enableMutation.isPending}
            className="rounded bg-[var(--color-brand-green)] px-4 py-2 text-sm font-semibold text-[var(--color-brand-navy)] disabled:opacity-50"
          >
            {enableMutation.isPending ? "Enabling…" : "Enable Calendar Feed"}
          </button>
        </div>
      )}

      {urlQuery.data && enabled && feedUrl && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs uppercase text-grey">Feed URL</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                readOnly
                value={feedUrl}
                className="flex-1 rounded border border-grey/30 bg-darkbg px-3 py-2 font-mono text-xs text-white"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="rounded border border-grey/30 px-3 py-2 text-xs text-white hover:bg-darkbg"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {webcalUrl && (
            <a
              href={webcalUrl}
              className="inline-block text-sm text-[var(--color-brand-green)] underline"
            >
              Subscribe in Google Calendar / Apple Calendar
            </a>
          )}

          <p className="text-xs text-grey">
            Paste this URL into your calendar app to subscribe to the
            published shift schedule. The feed updates automatically.
          </p>

          {!confirmRegen ? (
            <button
              type="button"
              onClick={() => setConfirmRegen(true)}
              className="mt-2 text-xs text-[var(--color-brand-yellow)] underline"
            >
              Regenerate URL
            </button>
          ) : (
            <div className="mt-2 rounded border border-[var(--color-brand-yellow)]/50 bg-darkbg p-3">
              <p className="text-xs text-white">
                This will break all existing calendar subscriptions. Continue?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={regenerateMutation.isPending}
                  className="rounded bg-[var(--color-brand-yellow)] px-3 py-1 text-xs font-semibold text-[var(--color-brand-navy)] disabled:opacity-50"
                >
                  {regenerateMutation.isPending ? "Regenerating…" : "Regenerate"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRegen(false)}
                  className="rounded border border-grey/30 px-3 py-1 text-xs text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
