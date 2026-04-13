"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import type { SchedulingArea } from "@/modules/scheduling/schema";

/**
 * Admin panel for managing facility areas. Simple list with name,
 * add/edit/delete/reorder.
 */
export function AreaManager() {
  const utils = trpc.useUtils();
  const areas = trpc.scheduling.listAreas.useQuery();

  const createArea = trpc.scheduling.createArea.useMutation({
    onSuccess: () => {
      utils.scheduling.listAreas.invalidate();
      setNewAreaName("");
      setShowAdd(false);
    },
  });

  const updateArea = trpc.scheduling.updateArea.useMutation({
    onSuccess: () => {
      utils.scheduling.listAreas.invalidate();
      setEditingId(null);
    },
  });

  const deleteArea = trpc.scheduling.deleteArea.useMutation({
    onSuccess: () => {
      utils.scheduling.listAreas.invalidate();
      setConfirmDeleteId(null);
    },
  });

  const reorderAreas = trpc.scheduling.reorderAreas.useMutation({
    onSuccess: () => {
      utils.scheduling.listAreas.invalidate();
    },
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newAreaName.trim()) return;
    createArea.mutate({ name: newAreaName.trim() });
  }

  function startEdit(area: SchedulingArea) {
    setEditingId(area.id);
    setEditName(area.name);
  }

  function handleUpdate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingId || !editName.trim()) return;
    updateArea.mutate({ id: editingId, name: editName.trim() });
  }

  function handleDelete(id: string) {
    deleteArea.mutate({ id });
  }

  function moveUp(index: number) {
    const list = [...(areas.data ?? [])];
    if (index <= 0 || index >= list.length) return;
    const ids = list.map((a) => a.id);
    [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!];
    reorderAreas.mutate({ ids });
  }

  function moveDown(index: number) {
    const list = [...(areas.data ?? [])];
    if (index < 0 || index >= list.length - 1) return;
    const ids = list.map((a) => a.id);
    [ids[index], ids[index + 1]] = [ids[index + 1]!, ids[index]!];
    reorderAreas.mutate({ ids });
  }

  const areaList = areas.data ?? [];

  if (areas.isLoading) {
    return <p className="text-sm text-grey">Loading areas...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-white">Facility Areas</h3>
        <button
          type="button"
          onClick={() => {
            setShowAdd(true);
            setEditingId(null);
            setNewAreaName("");
          }}
          className="flex h-11 items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          + Add Area
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form
          onSubmit={handleCreate}
          className="flex items-end gap-2 rounded-lg border border-grey/30 bg-darkbg/40 p-4"
        >
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-grey">Area name</span>
            <input
              type="text"
              required
              maxLength={120}
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              placeholder="e.g. Rink A, Front Desk, Zamboni Bay"
              className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={createArea.isPending || !newAreaName.trim()}
            className="flex h-11 items-center rounded bg-navy px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {createArea.isPending ? "Adding..." : "Add"}
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(false)}
            className="flex h-11 items-center rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
          >
            Cancel
          </button>
        </form>
      )}

      {createArea.error && (
        <p className="text-xs text-red">{createArea.error.message}</p>
      )}

      {/* Area list */}
      {areaList.length === 0 ? (
        <p className="text-sm text-grey">
          No areas configured. Areas represent physical sections of your
          facility (e.g. Rink A, Rink B, Front Desk).
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {areaList.map((area, index) => (
            <li
              key={area.id}
              className="flex items-center gap-2 rounded-lg border border-grey/30 bg-darkbg/40 px-4 py-3"
            >
              {editingId === area.id ? (
                <form
                  onSubmit={handleUpdate}
                  className="flex flex-1 items-center gap-2"
                >
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={updateArea.isPending}
                    className="flex h-11 items-center rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex h-11 items-center rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:text-white"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <div className="flex flex-1 items-center gap-2">
                    <span className="text-sm text-white">{area.name}</span>
                    {!area.is_active && (
                      <span className="rounded border border-red/40 px-1.5 py-0.5 text-[10px] text-red">
                        Inactive
                      </span>
                    )}
                  </div>

                  {/* Reorder buttons */}
                  <button
                    type="button"
                    onClick={() => moveUp(index)}
                    disabled={index === 0 || reorderAreas.isPending}
                    aria-label="Move up"
                    className="flex h-11 w-11 items-center justify-center rounded border border-grey/40 text-grey hover:text-white disabled:opacity-30"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4"
                    >
                      <path
                        fillRule="evenodd"
                        d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(index)}
                    disabled={
                      index === areaList.length - 1 || reorderAreas.isPending
                    }
                    aria-label="Move down"
                    className="flex h-11 w-11 items-center justify-center rounded border border-grey/40 text-grey hover:text-white disabled:opacity-30"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={() => startEdit(area)}
                    className="flex h-11 items-center rounded border border-grey/40 px-2 py-1.5 text-xs text-grey hover:border-white hover:text-white"
                  >
                    Edit
                  </button>

                  {confirmDeleteId === area.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDelete(area.id)}
                        disabled={deleteArea.isPending}
                        className="flex h-11 items-center rounded border border-red/60 px-2 py-1.5 text-xs text-red hover:bg-red/10"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="flex h-11 items-center rounded border border-grey/40 px-2 py-1.5 text-xs text-grey hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(area.id)}
                      className="flex h-11 items-center rounded border border-red/40 px-2 py-1.5 text-xs text-red hover:border-red hover:bg-red/10"
                    >
                      Delete
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {updateArea.error && (
        <p className="text-xs text-red">{updateArea.error.message}</p>
      )}
      {deleteArea.error && (
        <p className="text-xs text-red">{deleteArea.error.message}</p>
      )}
    </div>
  );
}
