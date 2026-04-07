"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { generateModulePdf, type PdfRow } from "@/modules/communications/pdf";
import type { TemperatureUnit } from "@/modules/communications/weather";

/**
 * Compose modal.
 *
 * Workflow:
 *   1. User picks one or more recipients (checkbox list of facility
 *      roster).
 *   2. User types subject + body. Body uses **bold** / *italic* /
 *      "- bullet" markdown that the inbox renders structured.
 *   3. (Optional) User picks a finalized report to attach. The
 *      compose UI lists recent Daily Reports and Ice Depth sessions
 *      from `communications.listAttachableReports`.
 *   4. On Send:
 *        a. If a report was picked, the client builds a PdfRow[] for
 *           it (different per report kind), calls generateModulePdf()
 *           to get a Blob, then uploads the blob to the
 *           'communications' bucket under <facility>/<message>/<file>.
 *           The message_id is generated up-front so the path is known
 *           before the row is inserted.
 *        b. communications.send is called with the storage path and
 *           label populated.
 */

interface ComposeModalProps {
  onClose: () => void;
  onSent: () => void;
}

interface PickedReport {
  kind: "daily_reports" | "ice_depth_sessions";
  id: string;
  label: string;
}

type CommsConfigRow = { key: string; value: unknown };

export function ComposeModal({ onClose, onSent }: ComposeModalProps) {
  const me = trpc.admin.me.useQuery();
  const facility = trpc.admin.getFacility.useQuery();
  const roster = trpc.scheduling.listRoster.useQuery();
  const attachable = trpc.communications.listAttachableReports.useQuery();
  const commsConfig = trpc.admin.getConfig.useQuery({ module: "communications" });
  const send = trpc.communications.send.useMutation();
  const utils = trpc.useUtils();

  const [recipients, setRecipients] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<PickedReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggleRecipient(id: string) {
    setRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function buildAttachmentRows(
    p: PickedReport,
  ): Promise<{ title: string; rows: PdfRow[]; notes?: string } | null> {
    if (p.kind === "daily_reports") {
      const rows = await utils.dailyReports.listRecent.fetch({ limit: 100 });
      const target = rows.find((r) => r.id === p.id);
      if (!target) return null;
      const out: PdfRow[] = [];
      for (const [k, v] of Object.entries(target.answers)) {
        out.push({ label: k, value: String(v) });
      }
      return { title: `Daily Report — ${formatDate(target.submitted_at)}`, rows: out };
    }
    if (p.kind === "ice_depth_sessions") {
      const rows = await utils.iceDepth.listRecent.fetch({ limit: 100 });
      const target = rows.find((r) => r.id === p.id);
      if (!target) return null;
      const out: PdfRow[] = [];
      for (const [k, v] of Object.entries(target.measurements)) {
        out.push({ label: `Point ${k}`, value: String(v) });
      }
      return {
        title: `Ice Depth Session — ${formatDate(target.submitted_at)}`,
        rows: out,
        notes: target.notes ?? undefined,
      };
    }
    return null;
  }

  function pickConfigString(rows: CommsConfigRow[] | undefined, key: string): string {
    if (!rows) return "";
    for (const r of rows) {
      if (r.key === key && typeof r.value === "string") return r.value;
    }
    return "";
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (recipients.size === 0) {
      setError("Pick at least one recipient");
      return;
    }
    if (subject.trim() === "") {
      setError("Subject is required");
      return;
    }
    if (!me.data || !facility.data) {
      setError("Loading session…");
      return;
    }

    setPending(true);
    try {
      let attachmentPath: string | null = null;
      let attachmentLabel: string | null = null;

      if (picked) {
        const built = await buildAttachmentRows(picked);
        if (!built) {
          setError("Could not load the selected report");
          setPending(false);
          return;
        }

        const cfg = (commsConfig.data as CommsConfigRow[] | undefined) ?? [];
        const postalCode = pickConfigString(cfg, "postal_code");
        const country = pickConfigString(cfg, "country") || "us";
        const tempUnit =
          (pickConfigString(cfg, "temp_unit") as TemperatureUnit) || "f";

        const pdf = await generateModulePdf({
          header: {
            facilityName: facility.data.name,
            userName: me.data.full_name ?? me.data.user_id,
            moduleName:
              picked.kind === "daily_reports" ? "Daily Reports" : "Ice Depth",
            postalCode: postalCode || undefined,
            country,
            temperatureUnit: tempUnit,
          },
          title: built.title,
          rows: built.rows,
          notes: built.notes,
        });

        // Generate the message id client-side so we can compute the
        // storage path before insert. supabase-js v2 doesn't expose a
        // helper, so we use crypto.randomUUID().
        const messageId = crypto.randomUUID();
        const path = `${me.data.facility_id}/${messageId}/${pdf.filename}`;

        const supabase = createSupabaseBrowserClient();
        const { error: uploadErr } = await supabase.storage
          .from("communications")
          .upload(path, pdf.blob, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (uploadErr) {
          setError(`Upload failed: ${uploadErr.message}`);
          setPending(false);
          return;
        }

        attachmentPath = path;
        attachmentLabel = built.title;
      }

      await send.mutateAsync({
        subject: subject.trim(),
        body,
        recipient_ids: [...recipients],
        attachment_path: attachmentPath,
        attachment_label: attachmentLabel,
      });

      onSent();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Send failed";
      setError(message);
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-grey/30 bg-darkbg p-6"
      >
        <h3 className="text-lg font-semibold text-white">New message</h3>

        <div>
          <span className="text-sm text-grey">Recipients *</span>
          <div className="mt-1 max-h-32 overflow-y-auto rounded border border-grey/40 bg-darkbg/60 p-2 text-xs">
            {roster.isLoading && <p className="text-grey">Loading roster…</p>}
            {roster.data && roster.data.length === 0 && (
              <p className="text-grey">No other staff in this facility.</p>
            )}
            {roster.data &&
              roster.data
                .filter((u) => u.user_id !== me.data?.user_id)
                .map((u) => (
                  <label
                    key={u.user_id}
                    className="flex items-center gap-2 py-1 text-grey"
                  >
                    <input
                      type="checkbox"
                      checked={recipients.has(u.user_id)}
                      onChange={() => toggleRecipient(u.user_id)}
                    />
                    {u.full_name ?? u.user_id}
                  </label>
                ))}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Subject *</span>
          <input
            type="text"
            required
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">
            Message body (supports **bold**, *italic*, &ldquo;- bullet&rdquo;)
          </span>
          <textarea
            rows={6}
            maxLength={20000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 font-mono text-xs text-white focus:border-navy focus:outline-none"
          />
        </label>

        <div>
          <span className="text-sm text-grey">Attach a report (optional)</span>
          {attachable.isLoading ? (
            <p className="mt-1 text-xs text-grey">Loading reports…</p>
          ) : (
            <select
              value={picked ? `${picked.kind}:${picked.id}` : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  setPicked(null);
                  return;
                }
                const [kind, id] = v.split(":") as [
                  "daily_reports" | "ice_depth_sessions",
                  string,
                ];
                const allRows =
                  kind === "daily_reports"
                    ? attachable.data?.daily_reports ?? []
                    : attachable.data?.ice_depth_sessions ?? [];
                const target = allRows.find((r) => r.id === id);
                if (!target) return;
                const label =
                  kind === "daily_reports"
                    ? `Daily Report — ${formatDate(target.submitted_at)}`
                    : `Ice Depth — ${formatDate(target.submitted_at)}`;
                setPicked({ kind, id, label });
              }}
              className="mt-1 w-full rounded border border-grey/40 bg-darkbg px-3 py-2 text-sm text-white focus:border-navy focus:outline-none"
            >
              <option value="">— None —</option>
              {(attachable.data?.daily_reports ?? []).length > 0 && (
                <optgroup label="Daily Reports">
                  {(attachable.data?.daily_reports ?? []).map((r) => (
                    <option key={r.id} value={`daily_reports:${r.id}`}>
                      Daily Report — {formatDate(r.submitted_at)}
                    </option>
                  ))}
                </optgroup>
              )}
              {(attachable.data?.ice_depth_sessions ?? []).length > 0 && (
                <optgroup label="Ice Depth (completed)">
                  {(attachable.data?.ice_depth_sessions ?? []).map((r) => (
                    <option key={r.id} value={`ice_depth_sessions:${r.id}`}>
                      Ice Depth — {formatDate(r.submitted_at)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
          {picked && (
            <p className="mt-1 text-xs text-grey">
              The selected report will be rendered to a PDF with the
              Universal Module Header and uploaded as an attachment.
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-navy px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
