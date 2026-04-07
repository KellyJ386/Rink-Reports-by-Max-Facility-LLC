"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import {
  ItemType as ItemTypeEnum,
  type Checklist,
  type ChecklistItem,
  type ItemType,
} from "@/modules/daily-reports/schema";

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  text: "Short text",
  long_text: "Long text",
  number: "Number",
  checkbox: "Checkbox",
  dropdown: "Dropdown",
};

const ITEM_TYPES = ItemTypeEnum.options;

// ---------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------

export function DailyReportsChecklistEditor() {
  const utils = trpc.useUtils();
  const list = trpc.admin.dailyReports.listChecklists.useQuery();

  const createChecklist = trpc.admin.dailyReports.createChecklist.useMutation({
    onSuccess: () => utils.admin.dailyReports.listChecklists.invalidate(),
  });
  const reorderChecklists =
    trpc.admin.dailyReports.reorderChecklists.useMutation({
      onSuccess: () => utils.admin.dailyReports.listChecklists.invalidate(),
    });

  function onAddChecklist() {
    const name = window.prompt("Name for the new checklist:");
    if (!name) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    createChecklist.mutate({ name: trimmed });
  }

  function onMoveChecklist(index: number, direction: -1 | 1) {
    if (!list.data) return;
    const next = [...list.data];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= next.length) return;
    const current = next[index];
    const other = next[swapIndex];
    if (!current || !other) return;
    next[index] = other;
    next[swapIndex] = current;
    reorderChecklists.mutate({ ids: next.map((c) => c.id) });
  }

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Daily Reports</h2>
      <p className="mt-1 text-sm text-grey">
        Customize the checklists your staff fill out throughout the day. Each
        checklist becomes a tab on the Daily Reports page.
      </p>

      <div className="mt-4">
        <button
          type="button"
          onClick={onAddChecklist}
          disabled={createChecklist.isPending}
          className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {createChecklist.isPending ? "Adding…" : "+ Add checklist"}
        </button>
        {createChecklist.error && (
          <p className="mt-2 text-sm text-red">
            {createChecklist.error.message}
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
          No checklists yet. Click &ldquo;Add checklist&rdquo; above to get
          started.
        </p>
      )}

      {list.data && list.data.length > 0 && (
        <ul className="mt-5 flex flex-col gap-4">
          {list.data.map((checklist, index) => (
            <li key={checklist.id}>
              <ChecklistCard
                checklist={checklist}
                canMoveUp={index > 0}
                canMoveDown={index < list.data!.length - 1}
                onMoveUp={() => onMoveChecklist(index, -1)}
                onMoveDown={() => onMoveChecklist(index, 1)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// ChecklistCard — one card per checklist
// ---------------------------------------------------------------------

function ChecklistCard({
  checklist,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  checklist: Checklist;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const utils = trpc.useUtils();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(checklist.name);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const updateChecklist = trpc.admin.dailyReports.updateChecklist.useMutation({
    onSuccess: () => {
      utils.admin.dailyReports.listChecklists.invalidate();
      setRenaming(false);
    },
  });
  const deleteChecklist = trpc.admin.dailyReports.deleteChecklist.useMutation({
    onSuccess: () => utils.admin.dailyReports.listChecklists.invalidate(),
  });
  const reorderItems = trpc.admin.dailyReports.reorderItems.useMutation({
    onSuccess: () => utils.admin.dailyReports.listChecklists.invalidate(),
  });

  function onSaveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    updateChecklist.mutate({ id: checklist.id, name: trimmed });
  }

  function onDelete() {
    if (
      !window.confirm(
        `Delete the "${checklist.name}" checklist? This removes all of its items. Submissions made against this checklist will block the delete.`,
      )
    ) {
      return;
    }
    deleteChecklist.mutate({ id: checklist.id });
  }

  function onMoveItem(index: number, direction: -1 | 1) {
    const next = [...checklist.items];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= next.length) return;
    const current = next[index];
    const other = next[swapIndex];
    if (!current || !other) return;
    next[index] = other;
    next[swapIndex] = current;
    reorderItems.mutate({
      checklist_id: checklist.id,
      ids: next.map((i) => i.id),
    });
  }

  return (
    <div className="rounded border border-grey/20 bg-darkbg/60 p-4">
      <header className="flex items-start justify-between gap-3">
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
              disabled={updateChecklist.isPending}
              className="rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setName(checklist.name);
                setRenaming(false);
              }}
              className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
            >
              Cancel
            </button>
          </form>
        ) : (
          <h3 className="flex-1 text-lg font-semibold text-white">
            {checklist.name}
          </h3>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp || reorderItems.isPending}
            title="Move up"
            className="rounded border border-grey/40 px-2 py-1 text-xs text-grey hover:border-white hover:text-white disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown || reorderItems.isPending}
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
            onClick={onDelete}
            disabled={deleteChecklist.isPending}
            className="rounded border border-red/40 px-2 py-1 text-xs text-red hover:border-red hover:bg-red/10 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </header>

      {updateChecklist.error && (
        <p className="mt-2 text-sm text-red">
          {updateChecklist.error.message}
        </p>
      )}
      {deleteChecklist.error && (
        <p className="mt-2 text-sm text-red">
          {deleteChecklist.error.message}
        </p>
      )}

      {checklist.items.length === 0 ? (
        <p className="mt-3 text-sm text-grey">No items yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {checklist.items.map((item, index) => (
            <li key={item.id}>
              {editingItemId === item.id ? (
                <ItemEditor
                  mode="edit"
                  item={item}
                  onCancel={() => setEditingItemId(null)}
                  onDone={() => setEditingItemId(null)}
                />
              ) : (
                <ItemRow
                  item={item}
                  canMoveUp={index > 0}
                  canMoveDown={index < checklist.items.length - 1}
                  onMoveUp={() => onMoveItem(index, -1)}
                  onMoveDown={() => onMoveItem(index, 1)}
                  onEdit={() => setEditingItemId(item.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {addingItem ? (
        <div className="mt-3">
          <ItemEditor
            mode="create"
            checklistId={checklist.id}
            onCancel={() => setAddingItem(false)}
            onDone={() => setAddingItem(false)}
          />
        </div>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setAddingItem(true)}
            className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
          >
            + Add item
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// ItemRow — static display of a single item
// ---------------------------------------------------------------------

function ItemRow({
  item,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onEdit,
}: {
  item: ChecklistItem;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
}) {
  const utils = trpc.useUtils();
  const deleteItem = trpc.admin.dailyReports.deleteItem.useMutation({
    onSuccess: () => utils.admin.dailyReports.listChecklists.invalidate(),
  });

  function onDelete() {
    if (!window.confirm(`Delete the "${item.label}" item?`)) return;
    deleteItem.mutate({ id: item.id });
  }

  return (
    <div className="flex items-center gap-3 rounded border border-grey/10 bg-darkbg/40 px-3 py-2">
      <div className="flex-1">
        <div className="text-sm text-white">{item.label}</div>
        <div className="text-xs text-grey">
          {ITEM_TYPE_LABELS[item.type]}
          {item.required ? " · required" : ""}
          {item.type === "dropdown" && item.options && item.options.length > 0
            ? ` · ${item.options.length} option${item.options.length === 1 ? "" : "s"}`
            : ""}
        </div>
      </div>
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
        <button
          type="button"
          onClick={onEdit}
          className="rounded border border-grey/30 px-2 py-1 text-xs text-grey hover:border-white hover:text-white"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleteItem.isPending}
          className="rounded border border-red/40 px-2 py-1 text-xs text-red hover:border-red hover:bg-red/10 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {deleteItem.error && (
        <p className="w-full basis-full pt-2 text-xs text-red">
          {deleteItem.error.message}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// ItemEditor — inline form for creating or editing an item
// ---------------------------------------------------------------------

type ItemEditorProps =
  | {
      mode: "create";
      checklistId: string;
      onCancel: () => void;
      onDone: () => void;
    }
  | {
      mode: "edit";
      item: ChecklistItem;
      onCancel: () => void;
      onDone: () => void;
    };

function ItemEditor(props: ItemEditorProps) {
  const utils = trpc.useUtils();
  const createItem = trpc.admin.dailyReports.createItem.useMutation({
    onSuccess: () => {
      utils.admin.dailyReports.listChecklists.invalidate();
      props.onDone();
    },
  });
  const updateItem = trpc.admin.dailyReports.updateItem.useMutation({
    onSuccess: () => {
      utils.admin.dailyReports.listChecklists.invalidate();
      props.onDone();
    },
  });

  const initial = props.mode === "edit" ? props.item : null;
  const [label, setLabel] = useState(initial?.label ?? "");
  const [type, setType] = useState<ItemType>(initial?.type ?? "text");
  const [required, setRequired] = useState(initial?.required ?? false);
  const [optionsText, setOptionsText] = useState(
    initial?.options ? initial.options.join("\n") : "",
  );

  const pending = createItem.isPending || updateItem.isPending;
  const error = createItem.error ?? updateItem.error;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedLabel = label.trim();
    if (trimmedLabel.length === 0) return;

    let options: string[] | undefined;
    if (type === "dropdown") {
      options = optionsText
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (options.length === 0) {
        // Surface a client-side check so the user isn't confused by
        // a server error about missing options.
        window.alert("Dropdown items need at least one option.");
        return;
      }
    }

    if (props.mode === "create") {
      createItem.mutate({
        checklist_id: props.checklistId,
        label: trimmedLabel,
        type,
        required,
        options,
      });
    } else {
      updateItem.mutate({
        id: props.item.id,
        label: trimmedLabel,
        type,
        required,
        options: type === "dropdown" ? options : null,
      });
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded border border-navy/50 bg-darkbg/80 p-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-grey">Label</span>
        <input
          type="text"
          required
          maxLength={200}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
          className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-grey">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ItemType)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          >
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {ITEM_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-grey">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="h-4 w-4 accent-green"
          />
          Required
        </label>
      </div>

      {type === "dropdown" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Options (one per line)</span>
          <textarea
            rows={4}
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
            placeholder={"Good\nFair\nPoor"}
          />
        </label>
      )}

      {error && <p className="text-sm text-red">{error.message}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending
            ? "Saving…"
            : props.mode === "create"
              ? "Add item"
              : "Save changes"}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded border border-grey/40 px-4 py-2 text-sm text-grey hover:border-white hover:text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
