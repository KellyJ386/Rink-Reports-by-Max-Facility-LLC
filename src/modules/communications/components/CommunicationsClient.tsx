"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";

import { ComposeModal } from "@/modules/communications/components/ComposeModal";
import { MessageList } from "@/modules/communications/components/MessageList";

type View = "inbox" | "sent";

/**
 * Top-level Communications client island. Owns the inbox/sent toggle
 * and the compose modal.
 */
export function CommunicationsClient() {
  const [view, setView] = useState<View>("inbox");
  const [composing, setComposing] = useState(false);

  const inbox = trpc.communications.listInbox.useQuery();
  const sent = trpc.communications.listSent.useQuery();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <nav
          aria-label="Mailbox"
          className="flex items-center gap-2"
        >
          <button
            type="button"
            onClick={() => setView("inbox")}
            className={
              view === "inbox"
                ? "rounded bg-navy px-3 py-1.5 text-sm font-medium text-white"
                : "rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
            }
          >
            Inbox
          </button>
          <button
            type="button"
            onClick={() => setView("sent")}
            className={
              view === "sent"
                ? "rounded bg-navy px-3 py-1.5 text-sm font-medium text-white"
                : "rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
            }
          >
            Sent
          </button>
        </nav>
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="ml-auto rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          + New message
        </button>
      </div>

      {view === "inbox" ? (
        inbox.isLoading ? (
          <p className="text-sm text-grey">Loading…</p>
        ) : inbox.error ? (
          <p className="text-sm text-red" role="alert">
            {inbox.error.message}
          </p>
        ) : (
          <MessageList
            view="inbox"
            rows={inbox.data ?? []}
            onChanged={() => inbox.refetch()}
          />
        )
      ) : sent.isLoading ? (
        <p className="text-sm text-grey">Loading…</p>
      ) : sent.error ? (
        <p className="text-sm text-red" role="alert">
          {sent.error.message}
        </p>
      ) : (
        <MessageList
          view="sent"
          rows={sent.data ?? []}
          onChanged={() => sent.refetch()}
        />
      )}

      {composing && (
        <ComposeModal
          onClose={() => setComposing(false)}
          onSent={() => {
            setComposing(false);
            inbox.refetch();
            sent.refetch();
          }}
        />
      )}
    </div>
  );
}
