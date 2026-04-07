"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";
import {
  parseMarkdown,
  type Block,
  type Inline,
} from "@/modules/communications/schema";

interface ListMessagesRow {
  id: string;
  subject: string;
  body: string;
  sender_id: string;
  attachment_path: string | null;
  attachment_label: string | null;
  sent_at: string;
  read_at: string | null;
}

interface MessageListProps {
  view: "inbox" | "sent";
  rows: readonly ListMessagesRow[];
  onChanged: () => void;
}

export function MessageList({ view, rows, onChanged }: MessageListProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const roster = trpc.scheduling.listRoster.useQuery();
  const markRead = trpc.communications.markRead.useMutation({
    onSuccess: () => onChanged(),
  });

  if (rows.length === 0) {
    return (
      <p className="rounded border border-grey/30 bg-darkbg/40 p-6 text-center text-sm text-grey">
        {view === "inbox" ? "Inbox is empty." : "You haven't sent anything yet."}
      </p>
    );
  }

  const userById = new Map(
    (roster.data ?? []).map((u) => [u.user_id, u.full_name ?? u.user_id]),
  );

  function onToggle(row: ListMessagesRow) {
    if (openId === row.id) {
      setOpenId(null);
      return;
    }
    setOpenId(row.id);
    if (view === "inbox" && row.read_at === null) {
      markRead.mutate({ message_id: row.id });
    }
  }

  return (
    <ul className="divide-y divide-grey/20 rounded border border-grey/30 bg-darkbg/40">
      {rows.map((row) => {
        const senderName = userById.get(row.sender_id) ?? "Sender";
        const isOpen = openId === row.id;
        const unread = view === "inbox" && row.read_at === null;
        return (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onToggle(row)}
              className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-sm hover:bg-darkbg/60"
            >
              {unread && (
                <span className="inline-block h-2 w-2 rounded-full bg-green" aria-label="unread" />
              )}
              <span className={unread ? "text-white" : "text-grey"}>
                {view === "inbox" ? senderName : "To: facility"}
              </span>
              <span className={`flex-1 ${unread ? "text-white" : "text-grey"}`}>
                {row.subject}
              </span>
              {row.attachment_path && (
                <span className="rounded border border-grey/40 px-1.5 text-[10px] text-grey">
                  PDF
                </span>
              )}
              <span className="text-xs text-grey/70">
                {formatTimestamp(row.sent_at)}
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-grey/20 bg-darkbg/60 px-4 py-4 text-sm">
                <MarkdownView text={row.body} />
                {row.attachment_path && (
                  <AttachmentLink messageId={row.id} label={row.attachment_label} />
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MarkdownView({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  if (blocks.length === 0) {
    return <p className="text-grey">(No body)</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

function renderBlock(block: Block, key: number) {
  if (block.kind === "paragraph") {
    return (
      <p key={key} className="text-grey">
        {block.inlines.map((inline, i) => renderInline(inline, i))}
      </p>
    );
  }
  return (
    <ul key={key} className="ml-4 list-disc text-grey">
      {block.items.map((inlines, i) => (
        <li key={i}>{inlines.map((inline, j) => renderInline(inline, j))}</li>
      ))}
    </ul>
  );
}

function renderInline(inline: Inline, key: number) {
  if (inline.kind === "bold") {
    return (
      <strong key={key} className="font-semibold text-white">
        {inline.value}
      </strong>
    );
  }
  if (inline.kind === "italic") {
    return (
      <em key={key} className="italic">
        {inline.value}
      </em>
    );
  }
  return <span key={key}>{inline.value}</span>;
}

function AttachmentLink({
  messageId,
  label,
}: {
  messageId: string;
  label: string | null;
}) {
  const url = trpc.communications.getAttachmentUrl.useQuery({ message_id: messageId });
  return (
    <div className="mt-3 rounded border border-grey/30 bg-darkbg/80 p-2 text-xs">
      {url.isLoading && <span className="text-grey">Preparing PDF…</span>}
      {url.error && (
        <span className="text-red">{url.error.message}</span>
      )}
      {url.data && (
        <a
          href={url.data.url}
          target="_blank"
          rel="noreferrer"
          className="text-green underline"
        >
          📄 {label ?? "Open attachment"}
        </a>
      )}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
