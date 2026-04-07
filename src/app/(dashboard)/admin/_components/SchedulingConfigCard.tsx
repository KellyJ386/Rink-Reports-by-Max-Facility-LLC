"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";

/**
 * Scheduling admin panel.
 *
 * Three sections:
 *   1. Positions — name + color + which certs the position requires
 *   2. Certifications — add/remove the cert catalog
 *   3. Staff certifications — for each user, toggle which certs they hold
 *
 * Server-side, position CRUD lives at admin.scheduling.* and the
 * staff↔cert junction is set with setStaffCerts (replace-all).
 */
export function SchedulingConfigCard() {
  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Scheduling</h2>
      <p className="mt-1 text-sm text-grey">
        Configure positions, certifications, and which staff hold each
        cert. Managers use this data when generating and editing the
        weekly schedule.
      </p>

      <div className="mt-6 flex flex-col gap-8">
        <CertificationsEditor />
        <PositionsEditor />
        <StaffCertsEditor />
      </div>
    </section>
  );
}

// =====================================================================
// Certifications editor
// =====================================================================

function CertificationsEditor() {
  const utils = trpc.useUtils();
  const list = trpc.admin.scheduling.listCertifications.useQuery();
  const create = trpc.admin.scheduling.createCertification.useMutation({
    onSuccess: () => utils.admin.scheduling.listCertifications.invalidate(),
  });
  const remove = trpc.admin.scheduling.deleteCertification.useMutation({
    onSuccess: () => utils.admin.scheduling.listCertifications.invalidate(),
  });

  function onAdd() {
    const name = window.prompt("Name for the new certification:");
    if (!name) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    create.mutate({ name: trimmed });
  }

  return (
    <div>
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Certifications</h3>
        <button
          type="button"
          onClick={onAdd}
          disabled={create.isPending}
          className="rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {create.isPending ? "Adding…" : "+ Add certification"}
        </button>
      </header>
      {create.error && <p className="mt-2 text-sm text-red">{create.error.message}</p>}

      {list.isLoading && <p className="mt-3 text-sm text-grey">Loading…</p>}
      {list.data && list.data.length === 0 && !list.isLoading && (
        <p className="mt-3 text-sm text-grey">
          No certifications yet. Add one above.
        </p>
      )}
      {list.data && list.data.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {list.data.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded border border-grey/20 bg-darkbg/60 px-3 py-2 text-sm"
            >
              <span className="text-white">{c.name}</span>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete "${c.name}"?`)) {
                    remove.mutate({ id: c.id });
                  }
                }}
                disabled={remove.isPending}
                className="rounded border border-red/40 px-2 py-1 text-xs text-red hover:border-red hover:bg-red/10 disabled:opacity-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =====================================================================
// Positions editor (with required-cert picker)
// =====================================================================

function PositionsEditor() {
  const utils = trpc.useUtils();
  const positions = trpc.admin.scheduling.listPositions.useQuery();
  const certs = trpc.admin.scheduling.listCertifications.useQuery();
  const positionCerts = trpc.admin.scheduling.listPositionCerts.useQuery();
  const create = trpc.admin.scheduling.createPosition.useMutation({
    onSuccess: () => utils.admin.scheduling.listPositions.invalidate(),
  });
  const remove = trpc.admin.scheduling.deletePosition.useMutation({
    onSuccess: () => utils.admin.scheduling.listPositions.invalidate(),
  });

  function onAdd() {
    const name = window.prompt("Name for the new position:");
    if (!name) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    const colorInput = window.prompt(
      "Color hex (e.g. #4DFF00) — leave blank for navy:",
      "#003B6F",
    );
    const color = colorInput && /^#[0-9A-Fa-f]{6}$/.test(colorInput.trim())
      ? colorInput.trim()
      : "#003B6F";
    create.mutate({ name: trimmed, color });
  }

  return (
    <div>
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Positions</h3>
        <button
          type="button"
          onClick={onAdd}
          disabled={create.isPending || certs.isLoading}
          className="rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {create.isPending ? "Adding…" : "+ Add position"}
        </button>
      </header>
      {create.error && <p className="mt-2 text-sm text-red">{create.error.message}</p>}

      {(positions.isLoading || certs.isLoading || positionCerts.isLoading) && (
        <p className="mt-3 text-sm text-grey">Loading…</p>
      )}

      {positions.data && positions.data.length === 0 && !positions.isLoading && (
        <p className="mt-3 text-sm text-grey">No positions yet.</p>
      )}

      {positions.data && certs.data && positionCerts.data && (
        <ul className="mt-3 flex flex-col gap-3">
          {positions.data.map((p) => {
            const required = new Set(
              positionCerts.data
                .filter((pc) => pc.position_id === p.id)
                .map((pc) => pc.certification_id),
            );
            return (
              <PositionRow
                key={`${p.id}:${[...required].sort().join(",")}`}
                positionId={p.id}
                positionName={p.name}
                positionColor={p.color}
                allCerts={certs.data}
                requiredCertIds={required}
                onDelete={() => {
                  if (window.confirm(`Delete "${p.name}"?`)) {
                    remove.mutate({ id: p.id });
                  }
                }}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PositionRow({
  positionId,
  positionName,
  positionColor,
  allCerts,
  requiredCertIds,
  onDelete,
}: {
  positionId: string;
  positionName: string;
  positionColor: string;
  allCerts: ReadonlyArray<{ id: string; name: string }>;
  requiredCertIds: ReadonlySet<string>;
  onDelete: () => void;
}) {
  const utils = trpc.useUtils();
  const setPositionCerts = trpc.admin.scheduling.setPositionCerts.useMutation({
    onSuccess: () => utils.admin.scheduling.listPositionCerts.invalidate(),
  });

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(requiredCertIds),
  );
  const [dirty, setDirty] = useState(false);

  function toggle(id: string) {
    setDirty(true);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSave() {
    setPositionCerts.mutate(
      { position_id: positionId, certification_ids: [...selected] },
      { onSuccess: () => setDirty(false) },
    );
  }

  return (
    <li className="rounded border border-grey/20 bg-darkbg/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded"
            style={{ backgroundColor: positionColor }}
            aria-hidden
          />
          <span className="text-sm font-semibold text-white">{positionName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || setPositionCerts.isPending}
            className="rounded bg-navy px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {setPositionCerts.isPending ? "Saving…" : "Save certs"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded border border-red/40 px-2 py-1 text-xs text-red hover:border-red hover:bg-red/10"
          >
            Delete
          </button>
        </div>
      </div>

      {allCerts.length === 0 ? (
        <p className="mt-2 text-xs text-grey">
          Add certifications above to require them for this position.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {allCerts.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-1 rounded border border-grey/30 px-2 py-1 text-grey"
            >
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
              />
              {c.name}
            </label>
          ))}
        </div>
      )}
      {setPositionCerts.error && (
        <p className="mt-2 text-xs text-red">{setPositionCerts.error.message}</p>
      )}
    </li>
  );
}

// =====================================================================
// Staff certs editor
// =====================================================================

function StaffCertsEditor() {
  const utils = trpc.useUtils();
  const users = trpc.admin.listUsers.useQuery();
  const certs = trpc.admin.scheduling.listCertifications.useQuery();
  const staffCerts = trpc.admin.scheduling.listStaffCerts.useQuery();
  const setStaffCerts = trpc.admin.scheduling.setStaffCerts.useMutation({
    onSuccess: () => utils.admin.scheduling.listStaffCerts.invalidate(),
  });

  if (users.isLoading || certs.isLoading || staffCerts.isLoading) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-white">Staff certifications</h3>
        <p className="mt-2 text-sm text-grey">Loading…</p>
      </div>
    );
  }

  if (!users.data || !certs.data || !staffCerts.data) {
    return null;
  }

  if (certs.data.length === 0) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-white">Staff certifications</h3>
        <p className="mt-2 text-sm text-grey">
          Add certifications above before granting them.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-white">Staff certifications</h3>
      <p className="mt-1 text-sm text-grey">
        Toggle which certifications each staff member currently holds.
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {users.data.map((u) => {
          const granted = new Set(
            staffCerts.data
              .filter((sc) => sc.user_id === u.user_id)
              .map((sc) => sc.certification_id),
          );
          return (
            <StaffRow
              key={`${u.user_id}:${[...granted].sort().join(",")}`}
              userId={u.user_id}
              userLabel={u.full_name ?? u.email}
              allCerts={certs.data}
              grantedIds={granted}
              isPending={setStaffCerts.isPending}
              onSave={(ids) => setStaffCerts.mutate({ user_id: u.user_id, certification_ids: ids })}
            />
          );
        })}
      </ul>
    </div>
  );
}

function StaffRow({
  userLabel,
  allCerts,
  grantedIds,
  isPending,
  onSave,
}: {
  userId: string;
  userLabel: string;
  allCerts: ReadonlyArray<{ id: string; name: string }>;
  grantedIds: ReadonlySet<string>;
  isPending: boolean;
  onSave: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(grantedIds));
  const [dirty, setDirty] = useState(false);

  function toggle(id: string) {
    setDirty(true);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSave([...selected]);
    setDirty(false);
  }

  return (
    <li className="rounded border border-grey/20 bg-darkbg/60 p-3">
      <form onSubmit={onSubmit}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white">{userLabel}</span>
          <button
            type="submit"
            disabled={!dirty || isPending}
            className="rounded bg-navy px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {allCerts.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-1 rounded border border-grey/30 px-2 py-1 text-grey"
            >
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
              />
              {c.name}
            </label>
          ))}
        </div>
      </form>
    </li>
  );
}
