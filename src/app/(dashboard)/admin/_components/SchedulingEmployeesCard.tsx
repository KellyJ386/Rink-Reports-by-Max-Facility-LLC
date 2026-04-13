"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";
import type { SchedulingEmployee } from "@/modules/scheduling/schema";

/**
 * Admin card for managing scheduling employee profiles.
 * Each row links a user_profiles entry to scheduling-specific
 * metadata: employment type, hour limits, and home area.
 */
export function SchedulingEmployeesCard() {
  const utils = trpc.useUtils();
  const employees = trpc.scheduling.employees.list.useQuery();
  const areas = trpc.scheduling.areas.list.useQuery();
  const roster = trpc.scheduling.listRoster.useQuery();
  const create = trpc.scheduling.employees.create.useMutation({
    onSuccess: () => utils.scheduling.employees.list.invalidate(),
  });
  const update = trpc.scheduling.employees.update.useMutation({
    onSuccess: () => utils.scheduling.employees.list.invalidate(),
  });
  const deactivate = trpc.scheduling.employees.deactivate.useMutation({
    onSuccess: () => utils.scheduling.employees.list.invalidate(),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const list = (employees.data ?? []) as unknown as SchedulingEmployee[];
  const areaList = (areas.data ?? []) as unknown as Array<{
    id: string;
    name: string;
  }>;
  const rosterList = roster.data ?? [];

  // Users that don't have a scheduling_employees profile yet
  const existingUserIds = new Set(list.map((e) => e.user_id));
  const unlinkedUsers = rosterList.filter(
    (u) => !existingUserIds.has(u.user_id),
  );

  const areaName = (areaId: string | null) => {
    if (!areaId) return "—";
    return areaList.find((a) => a.id === areaId)?.name ?? "—";
  };

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">
        Scheduling Employees
      </h2>
      <p className="mt-1 text-sm text-grey">
        Manage employee scheduling profiles. Set employment type, weekly
        hour limits, and home area for each staff member.
      </p>

      {employees.isLoading && (
        <p className="mt-4 text-sm text-grey">Loading…</p>
      )}

      {list.length === 0 && !employees.isLoading && (
        <p className="mt-4 text-sm text-grey">
          No scheduling profiles yet. Add employees below.
        </p>
      )}

      {list.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-grey/20 text-left text-xs text-grey">
                <th className="pb-2 pr-3">Name</th>
                <th className="pb-2 pr-3">Type</th>
                <th className="pb-2 pr-3">Home Area</th>
                <th className="pb-2 pr-3">Hours (min–max)</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((emp) =>
                editId === emp.id ? (
                  <EditRow
                    key={emp.id}
                    employee={emp}
                    areas={areaList}
                    onSave={(patch) =>
                      update.mutate(
                        { id: emp.id, ...patch },
                        { onSuccess: () => setEditId(null) },
                      )
                    }
                    onCancel={() => setEditId(null)}
                    isPending={update.isPending}
                  />
                ) : (
                  <tr
                    key={emp.id}
                    className="border-b border-grey/10"
                  >
                    <td className="py-2 pr-3 text-white">{emp.name}</td>
                    <td className="py-2 pr-3 text-grey">
                      {emp.employment_type === "full_time" ? "FT" : "PT"}
                    </td>
                    <td className="py-2 pr-3 text-grey">
                      {areaName(emp.home_area_id)}
                    </td>
                    <td className="py-2 pr-3 text-grey">
                      {emp.min_hours_week ?? "—"}–{emp.max_hours_week ?? "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {emp.is_active ? (
                        <span className="rounded border border-green/40 px-2 py-0.5 text-xs text-green">
                          Active
                        </span>
                      ) : (
                        <span className="rounded border border-grey/40 px-2 py-0.5 text-xs text-grey">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditId(emp.id)}
                          className="rounded border border-grey/30 px-2 py-1 text-xs text-grey hover:border-white hover:text-white"
                        >
                          Edit
                        </button>
                        {emp.is_active && (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Deactivate ${emp.name}? They will no longer appear in scheduling.`,
                                )
                              ) {
                                deactivate.mutate({ id: emp.id });
                              }
                            }}
                            disabled={deactivate.isPending}
                            className="rounded border border-red/40 px-2 py-1 text-xs text-red hover:border-red hover:bg-red/10 disabled:opacity-50"
                          >
                            Deactivate
                          </button>
                        )}
                        {!emp.is_active && (
                          <button
                            type="button"
                            onClick={() =>
                              update.mutate({
                                id: emp.id,
                                is_active: true,
                              })
                            }
                            disabled={update.isPending}
                            className="rounded border border-green/40 px-2 py-1 text-xs text-green hover:border-green hover:bg-green/10 disabled:opacity-50"
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add new employee */}
      {!showAdd ? (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="mt-4 rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          + Add employee
        </button>
      ) : (
        <AddForm
          unlinkedUsers={unlinkedUsers}
          areas={areaList}
          onAdd={(input) =>
            create.mutate(input, { onSuccess: () => setShowAdd(false) })
          }
          onCancel={() => setShowAdd(false)}
          isPending={create.isPending}
        />
      )}

      {(create.error ?? update.error ?? deactivate.error) && (
        <p className="mt-2 text-sm text-red">
          {(create.error ?? update.error ?? deactivate.error)?.message}
        </p>
      )}
    </section>
  );
}

// =====================================================================
// Add form
// =====================================================================

const inputClass =
  "rounded border border-grey/40 bg-darkbg px-3 py-2 text-sm text-white focus:border-navy focus:outline-none";

function AddForm({
  unlinkedUsers,
  areas,
  onAdd,
  onCancel,
  isPending,
}: {
  unlinkedUsers: ReadonlyArray<{
    user_id: string;
    full_name: string | null;
  }>;
  areas: ReadonlyArray<{ id: string; name: string }>;
  onAdd: (input: {
    user_id: string;
    name: string;
    employment_type: "full_time" | "part_time";
    home_area_id: string | null;
    max_hours_week: number | null;
    min_hours_week: number | null;
  }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [userId, setUserId] = useState(unlinkedUsers[0]?.user_id ?? "");
  const [name, setName] = useState(unlinkedUsers[0]?.full_name ?? "");
  const [type, setType] = useState<"full_time" | "part_time">("full_time");
  const [areaId, setAreaId] = useState("");
  const [maxH, setMaxH] = useState("");
  const [minH, setMinH] = useState("");

  function handleUserChange(uid: string) {
    setUserId(uid);
    const user = unlinkedUsers.find((u) => u.user_id === uid);
    if (user?.full_name) setName(user.full_name);
  }

  return (
    <div className="mt-4 rounded border border-grey/20 bg-darkbg/60 p-4">
      <h3 className="text-sm font-semibold text-white">New employee</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Staff member *</span>
          {unlinkedUsers.length === 0 ? (
            <p className="text-xs text-grey">
              All staff members already have scheduling profiles.
            </p>
          ) : (
            <select
              value={userId}
              onChange={(e) => handleUserChange(e.target.value)}
              className={inputClass}
            >
              {unlinkedUsers.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.full_name ?? u.user_id}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Display name *</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Employment type</span>
          <select
            value={type}
            onChange={(e) =>
              setType(e.target.value as "full_time" | "part_time")
            }
            className={inputClass}
          >
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Home area</span>
          <select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className={inputClass}
          >
            <option value="">None</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Min hours / week</span>
          <input
            type="number"
            min={0}
            max={168}
            step={0.5}
            value={minH}
            onChange={(e) => setMinH(e.target.value)}
            placeholder="—"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Max hours / week</span>
          <input
            type="number"
            min={0}
            max={168}
            step={0.5}
            value={maxH}
            onChange={(e) => setMaxH(e.target.value)}
            placeholder="—"
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={!userId || !name.trim() || isPending}
          onClick={() =>
            onAdd({
              user_id: userId,
              name: name.trim(),
              employment_type: type,
              home_area_id: areaId || null,
              max_hours_week: maxH ? Number(maxH) : null,
              min_hours_week: minH ? Number(minH) : null,
            })
          }
          className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add employee"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-grey/40 px-3 py-2 text-sm text-grey hover:text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// Inline edit row
// =====================================================================

function EditRow({
  employee,
  areas,
  onSave,
  onCancel,
  isPending,
}: {
  employee: SchedulingEmployee;
  areas: ReadonlyArray<{ id: string; name: string }>;
  onSave: (patch: {
    name?: string;
    employment_type?: "full_time" | "part_time";
    home_area_id?: string | null;
    max_hours_week?: number | null;
    min_hours_week?: number | null;
  }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(employee.name);
  const [type, setType] = useState(employee.employment_type);
  const [areaId, setAreaId] = useState(employee.home_area_id ?? "");
  const [maxH, setMaxH] = useState(
    employee.max_hours_week != null ? String(employee.max_hours_week) : "",
  );
  const [minH, setMinH] = useState(
    employee.min_hours_week != null ? String(employee.min_hours_week) : "",
  );

  return (
    <tr className="border-b border-grey/10 bg-darkbg/80">
      <td className="py-2 pr-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-grey/40 bg-darkbg px-2 py-1 text-sm text-white focus:border-navy focus:outline-none"
        />
      </td>
      <td className="py-2 pr-3">
        <select
          value={type}
          onChange={(e) =>
            setType(e.target.value as "full_time" | "part_time")
          }
          className="rounded border border-grey/40 bg-darkbg px-2 py-1 text-sm text-white"
        >
          <option value="full_time">FT</option>
          <option value="part_time">PT</option>
        </select>
      </td>
      <td className="py-2 pr-3">
        <select
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
          className="rounded border border-grey/40 bg-darkbg px-2 py-1 text-sm text-white"
        >
          <option value="">None</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={168}
            step={0.5}
            value={minH}
            onChange={(e) => setMinH(e.target.value)}
            className="w-16 rounded border border-grey/40 bg-darkbg px-2 py-1 text-sm text-white"
            placeholder="—"
          />
          <span className="text-grey">–</span>
          <input
            type="number"
            min={0}
            max={168}
            step={0.5}
            value={maxH}
            onChange={(e) => setMaxH(e.target.value)}
            className="w-16 rounded border border-grey/40 bg-darkbg px-2 py-1 text-sm text-white"
            placeholder="—"
          />
        </div>
      </td>
      <td className="py-2 pr-3 text-xs text-grey">
        {employee.is_active ? "Active" : "Inactive"}
      </td>
      <td className="py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              onSave({
                name: name.trim() || undefined,
                employment_type: type,
                home_area_id: areaId || null,
                max_hours_week: maxH ? Number(maxH) : null,
                min_hours_week: minH ? Number(minH) : null,
              })
            }
            disabled={isPending}
            className="rounded bg-navy px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-grey/40 px-2 py-1 text-xs text-grey hover:text-white"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}
