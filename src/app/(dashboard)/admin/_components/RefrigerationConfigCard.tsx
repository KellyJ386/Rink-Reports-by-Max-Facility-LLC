"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import {
  REFRIGERATION_FIELDS,
  type Compressor,
  type RefrigerationFieldKey,
  type ThresholdMap,
  type ThresholdRange,
} from "@/modules/refrigeration/schema";

/**
 * Refrigeration admin panel.
 *
 * Two sections:
 *   1. Compressors — admin-managed list (named, ordered, active flag).
 *      The staff form pulls only the active compressors and renders
 *      one set of inputs per row.
 *   2. Thresholds — per-field normal operating range. The whole
 *      threshold map is saved as a single facility_config row so the
 *      admin save is atomic and the staff form can read all ten
 *      ranges in one query.
 *
 * Both nest under the existing Admin Control Center via
 * ModuleConfigShell.
 */
export function RefrigerationConfigCard() {
  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Refrigeration</h2>
      <p className="mt-1 text-sm text-grey">
        Configure your compressors and the normal operating ranges for
        each measurement. Out-of-range readings are highlighted on the
        staff form so operators see issues immediately.
      </p>

      <div className="mt-6 flex flex-col gap-8">
        <CompressorEditor />
        <ThresholdsEditor />
      </div>
    </section>
  );
}

// =====================================================================
// Compressor editor
// =====================================================================

function CompressorEditor() {
  const utils = trpc.useUtils();
  const list = trpc.admin.refrigeration.listCompressors.useQuery();

  const createCompressor =
    trpc.admin.refrigeration.createCompressor.useMutation({
      onSuccess: () =>
        utils.admin.refrigeration.listCompressors.invalidate(),
    });
  const reorderCompressors =
    trpc.admin.refrigeration.reorderCompressors.useMutation({
      onSuccess: () =>
        utils.admin.refrigeration.listCompressors.invalidate(),
    });

  function onAdd() {
    const name = window.prompt("Name for the new compressor:");
    if (!name) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    createCompressor.mutate({ name: trimmed });
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
    reorderCompressors.mutate({ ids: next.map((c) => c.id) });
  }

  return (
    <div>
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Compressors</h3>
        <button
          type="button"
          onClick={onAdd}
          disabled={createCompressor.isPending}
          className="rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {createCompressor.isPending ? "Adding…" : "+ Add compressor"}
        </button>
      </header>

      {createCompressor.error && (
        <p className="mt-2 text-sm text-red">
          {createCompressor.error.message}
        </p>
      )}

      {list.isLoading && (
        <p className="mt-3 text-sm text-grey">Loading…</p>
      )}
      {list.error && (
        <p className="mt-3 text-sm text-red">{list.error.message}</p>
      )}
      {list.data && list.data.length === 0 && !list.isLoading && (
        <p className="mt-3 text-sm text-grey">
          No compressors yet. Add at least one before staff can log
          refrigeration readings.
        </p>
      )}

      {list.data && list.data.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {list.data.map((compressor, index) => (
            <li key={compressor.id}>
              <CompressorRow
                compressor={compressor}
                canMoveUp={index > 0}
                canMoveDown={index < list.data!.length - 1}
                onMoveUp={() => onMove(index, -1)}
                onMoveDown={() => onMove(index, 1)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CompressorRow({
  compressor,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  compressor: Compressor;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const utils = trpc.useUtils();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(compressor.name);

  const updateCompressor =
    trpc.admin.refrigeration.updateCompressor.useMutation({
      onSuccess: () => {
        utils.admin.refrigeration.listCompressors.invalidate();
        setRenaming(false);
      },
    });
  const deleteCompressor =
    trpc.admin.refrigeration.deleteCompressor.useMutation({
      onSuccess: () =>
        utils.admin.refrigeration.listCompressors.invalidate(),
    });

  function onSaveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    updateCompressor.mutate({ id: compressor.id, name: trimmed });
  }

  function onToggleActive() {
    updateCompressor.mutate({
      id: compressor.id,
      active: !compressor.active,
    });
  }

  function onDelete() {
    if (
      !window.confirm(
        `Delete "${compressor.name}"? Historical readings will retain the compressor id but lose the name. Mark inactive instead if you want to preserve the label.`,
      )
    ) {
      return;
    }
    deleteCompressor.mutate({ id: compressor.id });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-grey/20 bg-darkbg/60 px-3 py-2">
      {renaming ? (
        <form
          onSubmit={onSaveRename}
          className="flex flex-1 items-center gap-2"
        >
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
            disabled={updateCompressor.isPending}
            className="rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setName(compressor.name);
              setRenaming(false);
            }}
            className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex flex-1 items-center gap-3">
          <span className="text-sm text-white">{compressor.name}</span>
          {!compressor.active && (
            <span className="rounded border border-grey/40 px-2 py-0.5 text-xs text-grey">
              Inactive
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          title="Move up"
          className="rounded border border-grey/30 px-2 py-1 text-xs text-grey hover:border-white hover:text-white disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          title="Move down"
          className="rounded border border-grey/30 px-2 py-1 text-xs text-grey hover:border-white hover:text-white disabled:opacity-30"
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
          onClick={onToggleActive}
          disabled={updateCompressor.isPending}
          className="rounded border border-grey/40 px-2 py-1 text-xs text-grey hover:border-white hover:text-white disabled:opacity-50"
        >
          {compressor.active ? "Mark inactive" : "Mark active"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleteCompressor.isPending}
          className="rounded border border-red/40 px-2 py-1 text-xs text-red hover:border-red hover:bg-red/10 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {(updateCompressor.error || deleteCompressor.error) && (
        <p className="w-full basis-full pt-1 text-xs text-red">
          {(updateCompressor.error ?? deleteCompressor.error)!.message}
        </p>
      )}
    </div>
  );
}

// =====================================================================
// Thresholds editor
// =====================================================================

function ThresholdsEditor() {
  // Wrapper: loads the config and renders <ThresholdsForm /> with the
  // server data as a key prop so the form remounts (and re-initializes
  // its local state from props) whenever the server payload changes.
  // This avoids the "setState in effect" lint rule.
  const config = trpc.admin.getConfig.useQuery({ module: "refrigeration" });

  return (
    <div>
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">
          Normal operating ranges
        </h3>
      </header>
      <p className="mt-1 text-sm text-grey">
        Leave a cell blank to skip that bound. Operators see these values
        as inline hints and any reading outside the range is flagged.
      </p>

      {config.isLoading && (
        <p className="mt-3 text-sm text-grey">Loading…</p>
      )}
      {config.error && (
        <p className="mt-3 text-sm text-red">{config.error.message}</p>
      )}
      {config.data !== undefined && (
        <ThresholdsForm
          key={configKey(config.data)}
          initial={pickThresholds(config.data)}
        />
      )}
    </div>
  );
}

/**
 * Stable key derived from the server config payload. Changing this
 * forces a remount of <ThresholdsForm />, which re-initializes its
 * draft state from `initial` without needing an effect+setState.
 */
function configKey(rows: unknown): string {
  if (!Array.isArray(rows)) return "empty";
  for (const row of rows) {
    if (
      row !== null &&
      typeof row === "object" &&
      "key" in row &&
      "value" in row &&
      (row as { key: unknown }).key === "thresholds"
    ) {
      return JSON.stringify((row as { value: unknown }).value);
    }
  }
  return "empty";
}

function ThresholdsForm({
  initial,
}: {
  initial: Record<string, ThresholdRange>;
}) {
  const utils = trpc.useUtils();
  const setThresholds = trpc.admin.refrigeration.setThresholds.useMutation({
    onSuccess: () => {
      utils.admin.getConfig.invalidate({ module: "refrigeration" });
      setSaved(true);
    },
  });

  // Initialize local edit state from the server snapshot. Strings
  // (not numbers) so the input can be empty for "no threshold set".
  const [draft, setDraft] = useState<
    Record<string, { min: string; max: string }>
  >(() => {
    const out: Record<string, { min: string; max: string }> = {};
    for (const f of REFRIGERATION_FIELDS) {
      const r = initial[f.key];
      out[f.key] = {
        min: r?.min !== undefined && r?.min !== null ? String(r.min) : "",
        max: r?.max !== undefined && r?.max !== null ? String(r.max) : "",
      };
    }
    return out;
  });
  const [saved, setSaved] = useState(false);

  function setCell(
    key: RefrigerationFieldKey,
    side: "min" | "max",
    value: string,
  ) {
    setSaved(false);
    setDraft((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { min: "", max: "" }), [side]: value },
    }));
  }

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: ThresholdMap = {};
    for (const f of REFRIGERATION_FIELDS) {
      const cell = draft[f.key] ?? { min: "", max: "" };
      const min = cell.min.trim() === "" ? null : Number(cell.min);
      const max = cell.max.trim() === "" ? null : Number(cell.max);
      if (min !== null && Number.isNaN(min)) {
        window.alert(`${f.label}: min must be a number`);
        return;
      }
      if (max !== null && Number.isNaN(max)) {
        window.alert(`${f.label}: max must be a number`);
        return;
      }
      if (min !== null && max !== null && min > max) {
        window.alert(`${f.label}: min must be ≤ max`);
        return;
      }
      next[f.key] = { min, max };
    }
    setThresholds.mutate({ thresholds: next });
  }

  return (
    <>
      <form onSubmit={onSave} className="mt-3 flex flex-col gap-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-grey">
                <th className="py-2 pr-3 font-medium">Field</th>
                <th className="py-2 pr-3 font-medium">Min</th>
                <th className="py-2 pr-3 font-medium">Max</th>
                <th className="py-2 font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {REFRIGERATION_FIELDS.map((f) => {
                const cell = draft[f.key] ?? { min: "", max: "" };
                return (
                  <tr key={f.key} className="border-t border-grey/20">
                    <td className="py-2 pr-3 text-white">
                      {f.label}
                      <span className="ml-1 text-xs text-grey">
                        ({f.scope === "compressor" ? "per compressor" : "facility"})
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={cell.min}
                        onChange={(e) => setCell(f.key, "min", e.target.value)}
                        className="w-24 rounded border border-grey/40 bg-darkbg px-2 py-1 text-white focus:border-navy focus:outline-none"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={cell.max}
                        onChange={(e) => setCell(f.key, "max", e.target.value)}
                        className="w-24 rounded border border-grey/40 bg-darkbg px-2 py-1 text-white focus:border-navy focus:outline-none"
                      />
                    </td>
                    <td className="py-2 text-grey">{f.unit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {setThresholds.error && (
          <p className="text-sm text-red">{setThresholds.error.message}</p>
        )}
        {saved && <p className="text-sm text-green">Thresholds saved.</p>}

        <div>
          <button
            type="submit"
            disabled={setThresholds.isPending}
            className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {setThresholds.isPending ? "Saving…" : "Save thresholds"}
          </button>
        </div>
      </form>
    </>
  );
}

/**
 * Pull the threshold map out of the admin.getConfig payload.
 *
 * `admin.getConfig` returns rows shaped `{ key, value }`. The
 * threshold map lives in the row with key='thresholds'.
 */
function pickThresholds(rows: unknown): Record<string, ThresholdRange> {
  if (!Array.isArray(rows)) return {};
  for (const row of rows) {
    if (
      row !== null &&
      typeof row === "object" &&
      "key" in row &&
      "value" in row &&
      (row as { key: unknown }).key === "thresholds"
    ) {
      const v = (row as { value: unknown }).value;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        const out: Record<string, ThresholdRange> = {};
        for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
          if (raw !== null && typeof raw === "object") {
            const r = raw as Record<string, unknown>;
            const min =
              typeof r.min === "number"
                ? r.min
                : r.min === null
                  ? null
                  : null;
            const max =
              typeof r.max === "number"
                ? r.max
                : r.max === null
                  ? null
                  : null;
            out[k] = { min, max };
          }
        }
        return out;
      }
    }
  }
  return {};
}
