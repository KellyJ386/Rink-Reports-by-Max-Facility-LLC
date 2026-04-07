"use client";

import {
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";

import { trpc } from "@/lib/trpc";
import { enqueueWrite } from "@/lib/offline/db";
import { nudgeSync } from "@/lib/offline/sync-engine";
import {
  type AnswerValue,
  type Checklist,
  type ChecklistItem,
  type DailyReportSyncPayload,
} from "@/modules/daily-reports/schema";

/**
 * Staff-facing Daily Reports module.
 *
 * - One tab per checklist (configured by admins via the Admin
 *   Control Center; see DailyReportsChecklistEditor).
 * - The form is rendered from the checklist's items — there are no
 *   hardcoded fields anywhere (CLAUDE.md Rule 2).
 * - Submit writes to Dexie first, shows success immediately, and
 *   nudges the background sync engine (CLAUDE.md Rule 3). The UI
 *   never blocks on the network.
 */

type AnswersDraft = Record<string, AnswerValue>;

function freshDraft(checklist: Checklist): AnswersDraft {
  const draft: AnswersDraft = {};
  for (const item of checklist.items) {
    draft[item.id] = defaultValueFor(item);
  }
  return draft;
}

function defaultValueFor(item: ChecklistItem): AnswerValue {
  switch (item.type) {
    case "checkbox":
      return false;
    case "number":
      return null;
    case "dropdown":
      return "";
    case "text":
    case "long_text":
    default:
      return "";
  }
}

function isEmptyAnswer(value: AnswerValue, item: ChecklistItem): boolean {
  if (item.type === "checkbox") return false; // unchecked is still an answer
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim().length === 0) return true;
  return false;
}

function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function DailyReportsView() {
  const checklists = trpc.dailyReports.listChecklists.useQuery();
  const recent = trpc.dailyReports.listRecent.useQuery({ limit: 25 });

  const [activeId, setActiveId] = useState<string | null>(null);

  const list = useMemo(() => checklists.data ?? [], [checklists.data]);
  const active = useMemo(() => {
    if (list.length === 0) return null;
    if (activeId) {
      const found = list.find((c) => c.id === activeId);
      if (found) return found;
    }
    return list[0] ?? null;
  }, [list, activeId]);

  if (checklists.isLoading) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
        <p className="text-sm text-grey">Loading…</p>
      </main>
    );
  }

  if (checklists.error) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
        <p className="text-sm text-red">{checklists.error.message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-navy">Daily Reports</h1>
        <p className="text-sm text-grey">
          Fill out the checklists configured for this facility. Submissions
          save locally first and sync when you&rsquo;re back online.
        </p>
      </header>

      {list.length === 0 ? (
        <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-8 text-center">
          <p className="text-grey">
            No checklists are configured yet. An admin can add them from the{" "}
            <Link href="/admin" className="text-navy hover:text-white">
              Admin Control Center
            </Link>
            .
          </p>
        </section>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2 border-b border-grey/30">
            {list.map((c) => {
              const isActive = (active?.id ?? "") === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={
                    isActive
                      ? "border-b-2 border-green px-4 py-2 text-sm font-medium text-white"
                      : "border-b-2 border-transparent px-4 py-2 text-sm text-grey hover:text-white"
                  }
                >
                  {c.name}
                </button>
              );
            })}
          </nav>

          {active && (
            <ChecklistForm
              key={active.id}
              checklist={active}
              onSubmitted={() => {
                // Refetch the recent list so submissions that landed
                // on the server show up immediately. Local-only writes
                // appear via the in-form success banner.
                recent.refetch();
              }}
            />
          )}
        </>
      )}

      <RecentSubmissions
        rows={(recent.data as unknown as RecentRow[] | undefined) ?? []}
        isLoading={recent.isLoading}
        errorMessage={recent.error?.message ?? null}
        checklists={list}
      />
    </main>
  );
}

// ---------------------------------------------------------------------
// Form for one checklist
// ---------------------------------------------------------------------

function ChecklistForm({
  checklist,
  onSubmitted,
}: {
  checklist: Checklist;
  onSubmitted: () => void;
}) {
  const [draft, setDraft] = useState<AnswersDraft>(() => freshDraft(checklist));
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setAnswer(itemId: string, value: AnswerValue) {
    setDraft((d) => ({ ...d, [itemId]: value }));
    if (success) setSuccess(null);
    if (error) setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    // Required-field check, locally. The server-side handler does
    // not re-validate item-by-item against the checklist definition
    // beyond the JSON shape — keeping the strict UX in the form
    // matches how staff actually use the page.
    for (const item of checklist.items) {
      if (item.required && isEmptyAnswer(draft[item.id] ?? null, item)) {
        setError(`"${item.label}" is required.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const localId = newLocalId();
      const payload: DailyReportSyncPayload = {
        checklist_id: checklist.id,
        answers: draft,
        submitted_at: new Date().toISOString(),
        local_id: localId,
      };
      await enqueueWrite("daily_reports", payload, localId);
      setSuccess("Saved. Syncing in the background.");
      setDraft(freshDraft(checklist));
      nudgeSync();
      onSubmitted();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (checklist.items.length === 0) {
    return (
      <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
        <p className="text-sm text-grey">
          This checklist has no items yet. An admin can add fields from the
          Admin Control Center.
        </p>
      </section>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-grey/30 bg-darkbg/40 p-6"
    >
      {checklist.items.map((item) => (
        <FieldRow
          key={item.id}
          item={item}
          value={draft[item.id] ?? defaultValueFor(item)}
          onChange={(v) => setAnswer(item.id, v)}
        />
      ))}

      {error && <p className="text-sm text-red">{error}</p>}
      {success && <p className="text-sm text-green">{success}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Submit"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Per-item field renderer
// ---------------------------------------------------------------------

function FieldRow({
  item,
  value,
  onChange,
}: {
  item: ChecklistItem;
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
}) {
  const labelEl = (
    <span className="text-sm text-grey">
      {item.label}
      {item.required && <span className="ml-1 text-red">*</span>}
    </span>
  );

  switch (item.type) {
    case "text":
      return (
        <label className="flex flex-col gap-1">
          {labelEl}
          <input
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            maxLength={500}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
        </label>
      );

    case "long_text":
      return (
        <label className="flex flex-col gap-1">
          {labelEl}
          <textarea
            rows={4}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            maxLength={4000}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
        </label>
      );

    case "number":
      return (
        <label className="flex flex-col gap-1">
          {labelEl}
          <input
            type="number"
            value={
              typeof value === "number" && Number.isFinite(value)
                ? value
                : ""
            }
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange(null);
                return;
              }
              const n = Number(raw);
              onChange(Number.isFinite(n) ? n : null);
            }}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
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
            className="h-4 w-4 accent-green"
          />
          <span>
            {item.label}
            {item.required && <span className="ml-1 text-red">*</span>}
          </span>
        </label>
      );

    case "dropdown": {
      const options = item.options ?? [];
      return (
        <label className="flex flex-col gap-1">
          {labelEl}
          <select
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          >
            <option value="">— Select —</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      );
    }
  }
}

// ---------------------------------------------------------------------
// Recent submissions panel
// ---------------------------------------------------------------------

type RecentRow = {
  id: string;
  checklist_id: string;
  submitted_at: string;
  submitted_by: string;
  answers: unknown;
};

function RecentSubmissions({
  rows,
  isLoading,
  errorMessage,
  checklists,
}: {
  rows: RecentRow[];
  isLoading: boolean;
  errorMessage: string | null;
  checklists: Checklist[];
}) {
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of checklists) map.set(c.id, c.name);
    return map;
  }, [checklists]);

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-lg font-semibold text-white">Recent submissions</h2>
      {isLoading && <p className="mt-2 text-sm text-grey">Loading…</p>}
      {errorMessage && (
        <p className="mt-2 text-sm text-red">{errorMessage}</p>
      )}
      {!isLoading && rows.length === 0 && (
        <p className="mt-2 text-sm text-grey">No submissions yet.</p>
      )}
      {rows.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between rounded border border-grey/20 bg-darkbg/60 px-3 py-2 text-sm"
            >
              <span className="text-white">
                {nameById.get(row.checklist_id) ?? "Checklist"}
              </span>
              <span className="text-xs text-grey">
                {new Date(row.submitted_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
