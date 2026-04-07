"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";

/**
 * Shift Configuration — section 9 of the Admin Control Center.
 *
 * Manages the shared facility_shifts catalog. Each row is a named
 * shift with a start time and end time (time-of-day, no date —
 * shifts apply every day). Both Refrigeration (logging readings)
 * and Scheduling (declaring openings) consume this list, so a
 * single edit here propagates everywhere.
 */
export function ShiftConfigurationCard() {
  const utils = trpc.useUtils();
  const list = trpc.admin.shifts.list.useQuery();
  const create = trpc.admin.shifts.create.useMutation({
    onSuccess: () => utils.admin.shifts.list.invalidate(),
  });
  const reorder = trpc.admin.shifts.reorder.useMutation({
    onSuccess: () => utils.admin.shifts.list.invalidate(),
  });

  const [showAdd, setShowAdd] = useState(false);

  function onMove(index: number, direction: -1 | 1) {
    if (!list.data) return;
    const next = [...list.data];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= next.length) return;
    const a = next[index];
    const b = next[swapIndex];
    if (!a || !b) return;
    next[index] = b;
    next[swapIndex] = a;
    reorder.mutate({ ids: next.map((s) => s.id) });
  }

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Shift configuration</h2>
      <p className="mt-1 text-sm text-grey">
        Define the named shifts used by both the Refrigeration log and
        the Scheduling editor. A single edit here propagates to every
        module that asks &ldquo;which shift?&rdquo;.
      </p>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          + Add shift
        </button>
      </div>

      {list.isLoading && <p className="mt-4 text-sm text-grey">Loading…</p>}
      {list.error && <p className="mt-4 text-sm text-red">{list.error.message}</p>}
      {list.data && list.data.length === 0 && !list.isLoading && (
        <p className="mt-4 text-sm text-grey">
          No shifts yet. Add at least one before staff log refrigeration
          readings or managers run auto-suggest.
        </p>
      )}

      {list.data && list.data.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {list.data.map((shift, index) => (
            <ShiftRow
              key={shift.id}
              shift={shift}
              canMoveUp={index > 0}
              canMoveDown={index < list.data!.length - 1}
              onMoveUp={() => onMove(index, -1)}
              onMoveDown={() => onMove(index, 1)}
            />
          ))}
        </ul>
      )}

      {showAdd && (
        <AddShiftDialog
          onClose={() => setShowAdd(false)}
          onCreate={(input) =>
            create.mutate(input, { onSuccess: () => setShowAdd(false) })
          }
          isPending={create.isPending}
          error={create.error?.message ?? null}
        />
      )}
    </section>
  );
}

function ShiftRow({
  shift,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  shift: { id: string; name: string; start_time: string; end_time: string };
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const utils = trpc.useUtils();
  const update = trpc.admin.shifts.update.useMutation({
    onSuccess: () => {
      utils.admin.shifts.list.invalidate();
      setEditing(false);
    },
  });
  const remove = trpc.admin.shifts.delete.useMutation({
    onSuccess: () => utils.admin.shifts.list.invalidate(),
  });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(shift.name);
  const [startTime, setStartTime] = useState(shift.start_time.slice(0, 5));
  const [endTime, setEndTime] = useState(shift.end_time.slice(0, 5));

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update.mutate({
      id: shift.id,
      name: name.trim(),
      start_time: startTime,
      end_time: endTime,
    });
  }

  if (editing) {
    return (
      <li className="rounded border border-grey/20 bg-darkbg/60 p-3">
        <form onSubmit={onSave} className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="text"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded border border-grey/40 bg-darkbg px-2 py-1 text-white focus:border-navy focus:outline-none"
          />
          <input
            type="time"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-2 py-1 text-white"
          />
          <span className="text-grey">to</span>
          <input
            type="time"
            required
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-2 py-1 text-white"
          />
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded bg-navy px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded border border-grey/40 px-3 py-1 text-xs text-grey hover:border-white hover:text-white"
          >
            Cancel
          </button>
          {update.error && (
            <p className="w-full basis-full pt-1 text-xs text-red">
              {update.error.message}
            </p>
          )}
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded border border-grey/20 bg-darkbg/60 px-3 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-white">{shift.name}</span>
        <span className="text-xs text-grey">
          {shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          className="rounded border border-grey/30 px-2 py-1 text-xs text-grey hover:border-white hover:text-white disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          className="rounded border border-grey/30 px-2 py-1 text-xs text-grey hover:border-white hover:text-white disabled:opacity-30"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded border border-grey/40 px-2 py-1 text-xs text-grey hover:border-white hover:text-white"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete "${shift.name}"?`)) {
              remove.mutate({ id: shift.id });
            }
          }}
          disabled={remove.isPending}
          className="rounded border border-red/40 px-2 py-1 text-xs text-red hover:border-red hover:bg-red/10 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {remove.error && (
        <p className="w-full basis-full pt-1 text-xs text-red">{remove.error.message}</p>
      )}
    </li>
  );
}

function AddShiftDialog({
  onClose,
  onCreate,
  isPending,
  error,
}: {
  onClose: () => void;
  onCreate: (input: { name: string; start_time: string; end_time: string }) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("14:00");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    onCreate({ name: trimmed, start_time: startTime, end_time: endTime });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-grey/30 bg-darkbg p-6"
      >
        <h3 className="text-lg font-semibold text-white">New shift</h3>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Name *</span>
          <input
            type="text"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Morning"
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-grey">Start</span>
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded border border-grey/40 bg-darkbg px-2 py-2 text-white"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-grey">End</span>
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded border border-grey/40 bg-darkbg px-2 py-2 text-white"
            />
          </label>
        </div>
        {error && <p className="text-xs text-red">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-navy px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Adding…" : "Add shift"}
          </button>
        </div>
      </form>
    </div>
  );
}
