"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";

/**
 * Admin card for managing scheduling areas (facility zones / tabs).
 * Appears in the Admin Control Center. CRUD with reorder.
 */
export function SchedulingAreasCard() {
  const utils = trpc.useUtils();
  const list = trpc.scheduling.areas.list.useQuery();
  const create = trpc.scheduling.areas.create.useMutation({
    onSuccess: () => utils.scheduling.areas.list.invalidate(),
  });
  const update = trpc.scheduling.areas.update.useMutation({
    onSuccess: () => utils.scheduling.areas.list.invalidate(),
  });
  const remove = trpc.scheduling.areas.delete.useMutation({
    onSuccess: () => utils.scheduling.areas.list.invalidate(),
  });
  const reorder = trpc.scheduling.areas.reorder.useMutation({
    onSuccess: () => utils.scheduling.areas.list.invalidate(),
  });

  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const areas = list.data ?? [];

  function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    create.mutate({ name: trimmed }, { onSuccess: () => setNewName("") });
  }

  function handleSaveEdit() {
    if (!editId) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    update.mutate({ id: editId, name: trimmed }, {
      onSuccess: () => { setEditId(null); setEditName(""); },
    });
  }

  function handleMove(index: number, direction: -1 | 1) {
    const ids = areas.map((a) => a.id as string);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate({ ids });
  }

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Scheduling Areas</h2>
      <p className="mt-1 text-sm text-grey">
        Define facility areas or zones (e.g. &ldquo;Rink A&rdquo;,
        &ldquo;Lobby&rdquo;, &ldquo;Pro Shop&rdquo;). Shifts and employees
        can be assigned to areas.
      </p>

      {list.isLoading && <p className="mt-4 text-sm text-grey">Loading…</p>}

      {list.data && areas.length === 0 && (
        <p className="mt-4 text-sm text-grey">No areas defined yet.</p>
      )}

      {areas.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {areas.map((area, idx) => (
            <li
              key={area.id as string}
              className="flex items-center gap-2 rounded border border-grey/20 bg-darkbg/60 px-3 py-2"
            >
              {editId === area.id ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                    className="flex-1 rounded border border-grey/40 bg-darkbg px-2 py-1 text-sm text-white focus:border-navy focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={update.isPending}
                    className="rounded bg-navy px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditId(null)}
                    className="rounded border border-grey/40 px-2 py-1 text-xs text-grey hover:text-white"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-white">
                    {area.name as string}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0 || reorder.isPending}
                    className="rounded border border-grey/30 px-2 py-1 text-xs text-grey hover:border-white hover:text-white disabled:opacity-30"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === areas.length - 1 || reorder.isPending}
                    className="rounded border border-grey/30 px-2 py-1 text-xs text-grey hover:border-white hover:text-white disabled:opacity-30"
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(area.id as string);
                      setEditName(area.name as string);
                    }}
                    className="rounded border border-grey/30 px-2 py-1 text-xs text-grey hover:border-white hover:text-white"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete area "${area.name}"?`)) {
                        remove.mutate({ id: area.id as string });
                      }
                    }}
                    disabled={remove.isPending}
                    className="rounded border border-red/40 px-2 py-1 text-xs text-red hover:border-red hover:bg-red/10 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add new area */}
      <div className="mt-4 flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="New area name…"
          className="flex-1 rounded border border-grey/40 bg-darkbg px-3 py-2 text-sm text-white focus:border-navy focus:outline-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newName.trim() || create.isPending}
          className="rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {create.isPending ? "Adding…" : "+ Add area"}
        </button>
      </div>

      {(create.error ?? update.error ?? remove.error ?? reorder.error) && (
        <p className="mt-2 text-sm text-red">
          {(create.error ?? update.error ?? remove.error ?? reorder.error)
            ?.message}
        </p>
      )}
    </section>
  );
}
