"use client";

import { useMemo, useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import { db } from "@/lib/offline/db";
import { nudgeSync } from "@/lib/offline/sync-engine";
import {
  DailyReportSubmissionInput,
  type AnswerValue,
  type Checklist,
  type ChecklistItem,
  type DailyReportAnswers,
} from "@/modules/daily-reports/schema";

/**
 * Renders one checklist as an editable form. CLAUDE.md Rule 3:
 *
 *   1. Validate locally
 *   2. await db.queue.add(...)
 *   3. Show success immediately
 *   4. nudgeSync() in the background
 *   5. Invalidate the recent-submissions query so the new row appears
 *
 * The UI never waits for a server response. The "Pending sync" badge
 * in <RecentSubmissions> covers the gap between local-saved and
 * server-acknowledged.
 */

interface ChecklistFormProps {
  checklist: Checklist;
}

type FieldValue = string | boolean;

function emptyState(items: readonly ChecklistItem[]): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const item of items) {
    out[item.id] = item.type === "checkbox" ? false : "";
  }
  return out;
}

export function ChecklistForm({ checklist }: ChecklistFormProps) {
  const utils = trpc.useUtils();
  const initial = useMemo(() => emptyState(checklist.items), [checklist.items]);
  const [values, setValues] = useState<Record<string, FieldValue>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // The parent uses `key={checklist.id}` so this component is
  // remounted whenever the active tab changes — no manual reset
  // needed here.

  function setField(itemId: string, next: FieldValue) {
    setValues((prev) => ({ ...prev, [itemId]: next }));
  }

  function buildAnswers():
    | { ok: true; answers: DailyReportAnswers }
    | { ok: false; error: string } {
    const answers: DailyReportAnswers = {};
    for (const item of checklist.items) {
      const raw = values[item.id];
      let value: AnswerValue;
      switch (item.type) {
        case "checkbox":
          value = raw === true;
          break;
        case "number": {
          if (typeof raw !== "string" || raw.trim() === "") {
            if (item.required) return { ok: false, error: `${item.label} is required` };
            value = null;
            break;
          }
          const n = Number(raw);
          if (Number.isNaN(n)) return { ok: false, error: `${item.label} must be a number` };
          value = n;
          break;
        }
        case "text":
        case "long_text":
        case "dropdown": {
          const s = typeof raw === "string" ? raw.trim() : "";
          if (s.length === 0) {
            if (item.required) return { ok: false, error: `${item.label} is required` };
            value = null;
            break;
          }
          value = s;
          break;
        }
      }
      answers[item.id] = value;
    }
    return { ok: true, answers };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPending(true);

    const built = buildAnswers();
    if (!built.ok) {
      setError(built.error);
      setPending(false);
      return;
    }

    const payload = {
      local_id: crypto.randomUUID(),
      checklist_id: checklist.id,
      submitted_at: new Date().toISOString(),
      answers: built.answers,
    };

    // Belt-and-suspenders: validate the payload against the same Zod
    // schema /api/sync uses, so a malformed local row never reaches
    // the queue.
    const parsed = DailyReportSubmissionInput.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid submission");
      setPending(false);
      return;
    }

    try {
      await db.queue.add({
        localId: parsed.data.local_id,
        table: "daily_reports",
        payload: parsed.data,
        syncedAt: 0,
        serverId: null,
        retryCount: 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save locally";
      setError(message);
      setPending(false);
      return;
    }

    // Local write succeeded — show success immediately, reset the
    // form, and only THEN nudge the network. The UI never blocks on
    // the server.
    setValues(emptyState(checklist.items));
    setSuccess("Saved locally — syncing in the background.");
    setPending(false);

    nudgeSync();

    // Refresh the recent submissions panel.
    void utils.dailyReports.listRecent.invalidate();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-grey/30 bg-darkbg/40 p-6"
    >
      <h2 className="text-xl font-semibold text-white">{checklist.name}</h2>

      {checklist.items.length === 0 ? (
        <p className="text-sm text-grey">
          This checklist has no items yet. Ask your admin to add some in the
          Admin Control Center.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {checklist.items.map((item) => (
            <ItemField
              key={item.id}
              item={item}
              value={values[item.id]}
              onChange={(v) => setField(item.id, v)}
            />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red" role="alert">
          {error}
        </p>
      )}
      {success && <p className="text-sm text-green">{success}</p>}

      <div>
        <button
          type="submit"
          disabled={pending || checklist.items.length === 0}
          className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Submit report"}
        </button>
      </div>
    </form>
  );
}

interface ItemFieldProps {
  item: ChecklistItem;
  value: FieldValue | undefined;
  onChange: (next: FieldValue) => void;
}

function ItemField({ item, value, onChange }: ItemFieldProps) {
  const baseInput =
    "rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none";

  const labelText = item.required ? `${item.label} *` : item.label;

  switch (item.type) {
    case "text":
      return (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">{labelText}</span>
          <input
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={baseInput}
          />
        </label>
      );
    case "long_text":
      return (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">{labelText}</span>
          <textarea
            rows={3}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={baseInput}
          />
        </label>
      );
    case "number":
      return (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">{labelText}</span>
          <input
            type="number"
            inputMode="decimal"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={baseInput}
          />
        </label>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm text-grey">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-grey/40 bg-darkbg"
          />
          <span>{labelText}</span>
        </label>
      );
    case "dropdown":
      return (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">{labelText}</span>
          <select
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={baseInput}
          >
            <option value="">— Select —</option>
            {(item.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      );
  }
}
