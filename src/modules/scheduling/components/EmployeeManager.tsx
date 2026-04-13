"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import type { SchedulingEmployee, EmploymentType } from "@/modules/scheduling/schema";

/**
 * Admin panel for managing scheduling employee profiles.
 *
 * Table with columns: Name, Type (FT/PT), Home Area, Hours (min-max),
 * Status. Add/Edit/Deactivate buttons.
 */
export function EmployeeManager() {
  const utils = trpc.useUtils();
  const employees = trpc.scheduling.listEmployees.useQuery();
  const areas = trpc.scheduling.listAreas.useQuery();
  const roster = trpc.scheduling.listRoster.useQuery();

  const createEmployee = trpc.scheduling.createEmployee.useMutation({
    onSuccess: () => {
      utils.scheduling.listEmployees.invalidate();
      setShowAdd(false);
      resetForm();
    },
  });

  const updateEmployee = trpc.scheduling.updateEmployee.useMutation({
    onSuccess: () => {
      utils.scheduling.listEmployees.invalidate();
      setEditingId(null);
    },
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formUserId, setFormUserId] = useState("");
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<EmploymentType>("full_time");
  const [formAreaId, setFormAreaId] = useState<string>("");
  const [formMinHours, setFormMinHours] = useState("");
  const [formMaxHours, setFormMaxHours] = useState("");

  function resetForm() {
    setFormUserId("");
    setFormName("");
    setFormType("full_time");
    setFormAreaId("");
    setFormMinHours("");
    setFormMaxHours("");
  }

  function startEdit(emp: SchedulingEmployee) {
    setEditingId(emp.id);
    setFormName(emp.name);
    setFormType(emp.employment_type);
    setFormAreaId(emp.home_area_id ?? "");
    setFormMinHours(emp.min_hours_week?.toString() ?? "");
    setFormMaxHours(emp.max_hours_week?.toString() ?? "");
  }

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formUserId || !formName.trim()) return;
    createEmployee.mutate({
      user_id: formUserId,
      name: formName.trim(),
      employment_type: formType,
      home_area_id: formAreaId || null,
      min_hours_week: formMinHours ? Number(formMinHours) : null,
      max_hours_week: formMaxHours ? Number(formMaxHours) : null,
    });
  }

  function handleUpdate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingId || !formName.trim()) return;
    updateEmployee.mutate({
      id: editingId,
      name: formName.trim(),
      employment_type: formType,
      home_area_id: formAreaId || null,
      min_hours_week: formMinHours ? Number(formMinHours) : null,
      max_hours_week: formMaxHours ? Number(formMaxHours) : null,
    });
  }

  function toggleActive(emp: SchedulingEmployee) {
    updateEmployee.mutate({
      id: emp.id,
      is_active: !emp.is_active,
    });
  }

  const areaList = areas.data ?? [];
  const areaById = new Map(areaList.map((a) => [a.id, a]));
  const employeeList = employees.data ?? [];
  const rosterList = roster.data ?? [];

  if (employees.isLoading) {
    return <p className="text-sm text-grey">Loading employees...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-white">
          Scheduling Employees
        </h3>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowAdd(true);
            setEditingId(null);
          }}
          className="flex h-11 items-center rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          + Add Employee
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-3 rounded-lg border border-grey/30 bg-darkbg/40 p-4"
        >
          <h4 className="text-sm font-medium text-white">New Employee</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-grey">User</span>
              <select
                required
                value={formUserId}
                onChange={(e) => setFormUserId(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              >
                <option value="">Select user...</option>
                {rosterList.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.full_name ?? u.user_id}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-grey">Display name</span>
              <input
                type="text"
                required
                maxLength={200}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-grey">Type</span>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as EmploymentType)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              >
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-grey">Home area</span>
              <select
                value={formAreaId}
                onChange={(e) => setFormAreaId(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              >
                <option value="">None</option>
                {areaList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-grey">Min hours/week</span>
              <input
                type="number"
                min={0}
                max={168}
                value={formMinHours}
                onChange={(e) => setFormMinHours(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-grey">Max hours/week</span>
              <input
                type="number"
                min={0}
                max={168}
                value={formMaxHours}
                onChange={(e) => setFormMaxHours(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              />
            </label>
          </div>
          {createEmployee.error && (
            <p className="text-xs text-red">{createEmployee.error.message}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={createEmployee.isPending}
              className="flex h-11 items-center rounded bg-navy px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {createEmployee.isPending ? "Adding..." : "Add"}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="flex h-11 items-center rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Edit form */}
      {editingId && (
        <form
          onSubmit={handleUpdate}
          className="flex flex-col gap-3 rounded-lg border border-grey/30 bg-darkbg/40 p-4"
        >
          <h4 className="text-sm font-medium text-white">Edit Employee</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-grey">Display name</span>
              <input
                type="text"
                required
                maxLength={200}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-grey">Type</span>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as EmploymentType)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              >
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-grey">Home area</span>
              <select
                value={formAreaId}
                onChange={(e) => setFormAreaId(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              >
                <option value="">None</option>
                {areaList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-grey">Min hours/week</span>
              <input
                type="number"
                min={0}
                max={168}
                value={formMinHours}
                onChange={(e) => setFormMinHours(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-grey">Max hours/week</span>
              <input
                type="number"
                min={0}
                max={168}
                value={formMaxHours}
                onChange={(e) => setFormMaxHours(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              />
            </label>
          </div>
          {updateEmployee.error && (
            <p className="text-xs text-red">{updateEmployee.error.message}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={updateEmployee.isPending}
              className="flex h-11 items-center rounded bg-navy px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {updateEmployee.isPending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="flex h-11 items-center rounded border border-grey/40 px-3 py-1.5 text-sm text-grey hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Employee table */}
      {employeeList.length === 0 ? (
        <p className="text-sm text-grey">
          No scheduling employees configured yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-grey/30 bg-darkbg/40">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-grey/20 bg-darkbg/60 px-3 py-2 text-left text-grey">
                  Name
                </th>
                <th className="border border-grey/20 bg-darkbg/60 px-3 py-2 text-left text-grey">
                  Type
                </th>
                <th className="border border-grey/20 bg-darkbg/60 px-3 py-2 text-left text-grey">
                  Home Area
                </th>
                <th className="border border-grey/20 bg-darkbg/60 px-3 py-2 text-left text-grey">
                  Hours (min-max)
                </th>
                <th className="border border-grey/20 bg-darkbg/60 px-3 py-2 text-left text-grey">
                  Status
                </th>
                <th className="border border-grey/20 bg-darkbg/60 px-3 py-2 text-right text-grey">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {employeeList.map((emp) => {
                const area = emp.home_area_id
                  ? areaById.get(emp.home_area_id)
                  : null;
                return (
                  <tr key={emp.id}>
                    <td className="border border-grey/20 px-3 py-2 text-white">
                      {emp.name}
                    </td>
                    <td className="border border-grey/20 px-3 py-2 text-grey">
                      {emp.employment_type === "full_time" ? "FT" : "PT"}
                    </td>
                    <td className="border border-grey/20 px-3 py-2 text-grey">
                      {area?.name ?? "\u2014"}
                    </td>
                    <td className="border border-grey/20 px-3 py-2 text-grey">
                      {emp.min_hours_week ?? "\u2014"} \u2013{" "}
                      {emp.max_hours_week ?? "\u2014"}
                    </td>
                    <td className="border border-grey/20 px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          emp.is_active
                            ? "border border-green/40 text-green"
                            : "border border-red/40 text-red"
                        }`}
                      >
                        {emp.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="border border-grey/20 px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(emp)}
                          className="flex h-11 items-center rounded border border-grey/40 px-2 py-1.5 text-xs text-grey hover:border-white hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(emp)}
                          disabled={updateEmployee.isPending}
                          className={`flex h-11 items-center rounded border px-2 py-1.5 text-xs ${
                            emp.is_active
                              ? "border-red/40 text-red hover:border-red hover:bg-red/10"
                              : "border-green/40 text-green hover:border-green hover:bg-green/10"
                          }`}
                        >
                          {emp.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
