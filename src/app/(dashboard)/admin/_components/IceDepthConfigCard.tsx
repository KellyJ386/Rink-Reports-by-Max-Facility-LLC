"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import {
  RinkSurface,
  RINK_VIEWBOX_H,
  RINK_VIEWBOX_W,
} from "@/modules/ice-depth/components/RinkSurface";
import {
  MAX_POINTS_PER_TEMPLATE,
  MAX_TEMPLATES_PER_FACILITY,
  type Point,
  type Template,
  type Unit,
} from "@/modules/ice-depth/schema";

/**
 * Ice Depth admin panel.
 *
 * Each template carries a name, a unit, and an ordered list of up to
 * 60 (x, y) points overlaid on a fixed NHL rink SVG. The editor lets
 * the admin click anywhere on the rink to drop the next-numbered
 * point, drag the order around, rename, change units, and save.
 *
 * The list view caps at 8 templates per facility (also enforced
 * server-side in the admin sub-router).
 */
export function IceDepthConfigCard() {
  const utils = trpc.useUtils();
  const list = trpc.admin.iceDepth.listTemplates.useQuery();

  const createTemplate = trpc.admin.iceDepth.createTemplate.useMutation({
    onSuccess: () => utils.admin.iceDepth.listTemplates.invalidate(),
  });
  const reorderTemplates = trpc.admin.iceDepth.reorderTemplates.useMutation({
    onSuccess: () => utils.admin.iceDepth.listTemplates.invalidate(),
  });

  const [editingId, setEditingId] = useState<string | null>(null);

  function onAdd() {
    const name = window.prompt("Name for the new template:");
    if (!name) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    const unitInput = window.prompt(
      "Unit for measurements? Type 'in' or 'mm':",
      "in",
    );
    const unit: Unit =
      (unitInput?.trim().toLowerCase() ?? "in") === "mm" ? "mm" : "in";
    createTemplate.mutate({ name: trimmed, unit });
  }

  function onMove(index: number, direction: -1 | 1) {
    if (!list.data) return;
    const next = [...list.data];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= next.length) return;
    const current = next[index];
    const other = next[swapIndex];
    if (!current || !other) return;
    next[index] = other;
    next[swapIndex] = current;
    reorderTemplates.mutate({ ids: next.map((t) => t.id) });
  }

  const atCap = (list.data?.length ?? 0) >= MAX_TEMPLATES_PER_FACILITY;

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Ice Depth</h2>
      <p className="mt-1 text-sm text-grey">
        Up to {MAX_TEMPLATES_PER_FACILITY} measurement templates per
        facility. Each template defines a unit and an ordered set of
        numbered points (max {MAX_POINTS_PER_TEMPLATE}) on the rink.
        Operators pick a template, walk the surface, and tap each
        point in turn to record a thickness reading.
      </p>

      <div className="mt-4">
        <button
          type="button"
          onClick={onAdd}
          disabled={createTemplate.isPending || atCap}
          className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {createTemplate.isPending
            ? "Adding…"
            : atCap
              ? `Maximum of ${MAX_TEMPLATES_PER_FACILITY} reached`
              : "+ Add template"}
        </button>
        {createTemplate.error && (
          <p className="mt-2 text-sm text-red">
            {createTemplate.error.message}
          </p>
        )}
      </div>

      {list.isLoading && (
        <p className="mt-4 text-sm text-grey">Loading…</p>
      )}
      {list.error && (
        <p className="mt-4 text-sm text-red">{list.error.message}</p>
      )}
      {list.data && list.data.length === 0 && !list.isLoading && (
        <p className="mt-4 text-sm text-grey">
          No templates yet. Click &ldquo;Add template&rdquo; above to
          create one.
        </p>
      )}

      {list.data && list.data.length > 0 && (
        <ul className="mt-5 flex flex-col gap-4">
          {list.data.map((template, index) => (
            <li key={template.id}>
              <TemplateCard
                template={template}
                isEditing={editingId === template.id}
                canMoveUp={index > 0}
                canMoveDown={index < list.data!.length - 1}
                onMoveUp={() => onMove(index, -1)}
                onMoveDown={() => onMove(index, 1)}
                onToggleEdit={() =>
                  setEditingId((current) =>
                    current === template.id ? null : template.id,
                  )
                }
                onClose={() => setEditingId(null)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// =====================================================================
// Template card
// =====================================================================

function TemplateCard({
  template,
  isEditing,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onToggleEdit,
  onClose,
}: {
  template: Template;
  isEditing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleEdit: () => void;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();

  const updateTemplate = trpc.admin.iceDepth.updateTemplate.useMutation({
    onSuccess: () => utils.admin.iceDepth.listTemplates.invalidate(),
  });
  const deleteTemplate = trpc.admin.iceDepth.deleteTemplate.useMutation({
    onSuccess: () => utils.admin.iceDepth.listTemplates.invalidate(),
  });

  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(template.name);

  function onSaveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    updateTemplate.mutate(
      { id: template.id, name: trimmed },
      { onSuccess: () => setRenaming(false) },
    );
  }

  function onUnitChange(unit: Unit) {
    updateTemplate.mutate({ id: template.id, unit });
  }

  function onDelete() {
    if (
      !window.confirm(
        `Delete the "${template.name}" template? Logged sessions referencing it will block the delete.`,
      )
    ) {
      return;
    }
    deleteTemplate.mutate({ id: template.id });
  }

  return (
    <div className="rounded border border-grey/20 bg-darkbg/60 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        {renaming ? (
          <form onSubmit={onSaveRename} className="flex flex-1 items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              maxLength={120}
              className="flex-1 rounded border border-grey/40 bg-darkbg px-3 py-1.5 text-sm text-white focus:border-navy focus:outline-none"
            />
            <button
              type="submit"
              disabled={updateTemplate.isPending}
              className="rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setName(template.name);
                setRenaming(false);
              }}
              className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="flex flex-1 items-center gap-3">
            <h3 className="text-lg font-semibold text-white">
              {template.name}
            </h3>
            <span className="rounded border border-grey/40 px-2 py-0.5 text-xs text-grey">
              {template.points.length}/{MAX_POINTS_PER_TEMPLATE} points · {template.unit}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            title="Move up"
            className="rounded border border-grey/40 px-2 py-1 text-xs text-grey hover:border-white hover:text-white disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            title="Move down"
            className="rounded border border-grey/40 px-2 py-1 text-xs text-grey hover:border-white hover:text-white disabled:opacity-30"
          >
            ↓
          </button>
          {!renaming && (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="rounded border border-grey/40 px-2 py-1 text-xs text-grey hover:border-white hover:text-white"
            >
              Rename
            </button>
          )}
          <button
            type="button"
            onClick={onToggleEdit}
            className="rounded border border-grey/40 px-2 py-1 text-xs text-grey hover:border-white hover:text-white"
          >
            {isEditing ? "Close editor" : "Edit points"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleteTemplate.isPending}
            className="rounded border border-red/40 px-2 py-1 text-xs text-red hover:border-red hover:bg-red/10 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </header>

      <div className="mt-3 flex items-center gap-3 text-sm text-grey">
        <span>Unit:</span>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name={`unit-${template.id}`}
            checked={template.unit === "in"}
            onChange={() => onUnitChange("in")}
            disabled={updateTemplate.isPending}
          />
          inches
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name={`unit-${template.id}`}
            checked={template.unit === "mm"}
            onChange={() => onUnitChange("mm")}
            disabled={updateTemplate.isPending}
          />
          millimeters
        </label>
      </div>

      {(updateTemplate.error || deleteTemplate.error) && (
        <p className="mt-2 text-sm text-red">
          {(updateTemplate.error ?? deleteTemplate.error)!.message}
        </p>
      )}

      {isEditing && (
        <PointsEditor
          key={`${template.id}:${template.points.length}`}
          template={template}
          onSaved={() => onClose()}
        />
      )}
    </div>
  );
}

// =====================================================================
// Points editor
// =====================================================================

function PointsEditor({
  template,
  onSaved,
}: {
  template: Template;
  onSaved: () => void;
}) {
  const utils = trpc.useUtils();
  const updateTemplate = trpc.admin.iceDepth.updateTemplate.useMutation({
    onSuccess: () => {
      utils.admin.iceDepth.listTemplates.invalidate();
      onSaved();
    },
  });

  // Local draft of points. Initialized from template.points; the
  // outer card uses key={template.id}:{points.length} so this
  // component remounts when the server snapshot changes.
  const [points, setPoints] = useState<Point[]>(() => [...template.points]);
  const [error, setError] = useState<string | null>(null);

  function addPointAt(x: number, y: number) {
    if (points.length >= MAX_POINTS_PER_TEMPLATE) {
      setError(`Maximum of ${MAX_POINTS_PER_TEMPLATE} points`);
      return;
    }
    setError(null);
    setPoints((prev) => [...prev, { n: prev.length + 1, x, y }]);
  }

  function removePoint(n: number) {
    setError(null);
    setPoints((prev) =>
      prev
        .filter((p) => p.n !== n)
        // Renumber so n stays contiguous 1..N.
        .map((p, i) => ({ ...p, n: i + 1 })),
    );
  }

  function clearAll() {
    if (!window.confirm("Clear all points?")) return;
    setPoints([]);
  }

  function onSave() {
    updateTemplate.mutate({ id: template.id, points });
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-sm text-grey">
        Click anywhere on the rink to drop the next-numbered point.
        Click an existing marker to remove it (numbering renumbers
        automatically).
      </p>

      <div className="rounded border border-grey/20 bg-darkbg p-2">
        <RinkSurface
          ariaLabel={`${template.name} point editor`}
          onSurfaceClick={addPointAt}
        >
          {points.map((p) => (
            <g
              key={p.n}
              onClick={(e) => {
                e.stopPropagation();
                removePoint(p.n);
              }}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={p.x * RINK_VIEWBOX_W}
                cy={p.y * RINK_VIEWBOX_H}
                r={14}
                fill="#4DFF00"
                stroke="#003B6F"
                strokeWidth={2}
              />
              <text
                x={p.x * RINK_VIEWBOX_W}
                y={p.y * RINK_VIEWBOX_H + 5}
                textAnchor="middle"
                fontSize={14}
                fontWeight="bold"
                fill="#003B6F"
                style={{ pointerEvents: "none" }}
              >
                {p.n}
              </text>
            </g>
          ))}
        </RinkSurface>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-grey">
          {points.length}/{MAX_POINTS_PER_TEMPLATE} points
        </span>
        <button
          type="button"
          onClick={clearAll}
          disabled={points.length === 0}
          className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white disabled:opacity-30"
        >
          Clear all
        </button>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={updateTemplate.isPending}
            className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {updateTemplate.isPending ? "Saving…" : "Save points"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red">{error}</p>}
      {updateTemplate.error && (
        <p className="text-sm text-red">{updateTemplate.error.message}</p>
      )}
    </div>
  );
}
