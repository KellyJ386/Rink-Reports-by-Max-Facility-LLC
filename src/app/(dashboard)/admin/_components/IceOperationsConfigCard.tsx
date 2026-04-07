"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import {
  FieldType as FieldTypeEnum,
  type Equipment,
  type FieldType,
  type OperationType,
  type OperationTypeField,
} from "@/modules/ice-operations/schema";

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short text",
  long_text: "Long text",
  number: "Number",
  checkbox: "Checkbox",
  dropdown: "Dropdown",
};

const FIELD_TYPES = FieldTypeEnum.options;

// =====================================================================
// Top-level admin panel
// =====================================================================

export function IceOperationsConfigCard() {
  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Ice Operations</h2>
      <p className="mt-1 text-sm text-grey">
        Configure the operation types your staff log against (each becomes
        a tab on the Ice Operations page) and the list of equipment they
        can pick from. Both lists are facility-specific and entirely
        admin-controlled.
      </p>

      <div className="mt-6 flex flex-col gap-8">
        <EquipmentEditor />
        <OperationTypesEditor />
      </div>
    </section>
  );
}

// =====================================================================
// Equipment editor
// =====================================================================

function EquipmentEditor() {
  const utils = trpc.useUtils();
  const list = trpc.admin.iceOperations.listEquipment.useQuery();

  const createEquipment = trpc.admin.iceOperations.createEquipment.useMutation({
    onSuccess: () => utils.admin.iceOperations.listEquipment.invalidate(),
  });
  const reorderEquipment =
    trpc.admin.iceOperations.reorderEquipment.useMutation({
      onSuccess: () => utils.admin.iceOperations.listEquipment.invalidate(),
    });

  function onAdd() {
    const name = window.prompt("Name for the new equipment item:");
    if (!name) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    createEquipment.mutate({ name: trimmed });
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
    reorderEquipment.mutate({ ids: next.map((e) => e.id) });
  }

  return (
    <div>
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Equipment</h3>
        <button
          type="button"
          onClick={onAdd}
          disabled={createEquipment.isPending}
          className="rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {createEquipment.isPending ? "Adding…" : "+ Add equipment"}
        </button>
      </header>

      {createEquipment.error && (
        <p className="mt-2 text-sm text-red">{createEquipment.error.message}</p>
      )}

      {list.isLoading && (
        <p className="mt-3 text-sm text-grey">Loading…</p>
      )}
      {list.error && (
        <p className="mt-3 text-sm text-red">{list.error.message}</p>
      )}
      {list.data && list.data.length === 0 && !list.isLoading && (
        <p className="mt-3 text-sm text-grey">
          No equipment yet. Add at least one item before staff can log
          operations.
        </p>
      )}

      {list.data && list.data.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {list.data.map((equipment, index) => (
            <li key={equipment.id}>
              <EquipmentRow
                equipment={equipment}
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

function EquipmentRow({
  equipment,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  equipment: Equipment;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const utils = trpc.useUtils();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(equipment.name);

  const updateEquipment = trpc.admin.iceOperations.updateEquipment.useMutation({
    onSuccess: () => {
      utils.admin.iceOperations.listEquipment.invalidate();
      setRenaming(false);
    },
  });
  const deleteEquipment = trpc.admin.iceOperations.deleteEquipment.useMutation({
    onSuccess: () => utils.admin.iceOperations.listEquipment.invalidate(),
  });

  function onSaveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    updateEquipment.mutate({ id: equipment.id, name: trimmed });
  }

  function onToggleActive() {
    updateEquipment.mutate({ id: equipment.id, active: !equipment.active });
  }

  function onDelete() {
    if (
      !window.confirm(
        `Delete "${equipment.name}"? Equipment with logged operations cannot be deleted — mark it inactive instead.`,
      )
    ) {
      return;
    }
    deleteEquipment.mutate({ id: equipment.id });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-grey/20 bg-darkbg/60 px-3 py-2">
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
            disabled={updateEquipment.isPending}
            className="rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setName(equipment.name);
              setRenaming(false);
            }}
            className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex flex-1 items-center gap-3">
          <span className="text-sm text-white">{equipment.name}</span>
          {!equipment.active && (
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
          disabled={updateEquipment.isPending}
          className="rounded border border-grey/40 px-2 py-1 text-xs text-grey hover:border-white hover:text-white disabled:opacity-50"
        >
          {equipment.active ? "Mark inactive" : "Mark active"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleteEquipment.isPending}
          className="rounded border border-red/40 px-2 py-1 text-xs text-red hover:border-red hover:bg-red/10 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {(updateEquipment.error || deleteEquipment.error) && (
        <p className="w-full basis-full pt-1 text-xs text-red">
          {(updateEquipment.error ?? deleteEquipment.error)!.message}
        </p>
      )}
    </div>
  );
}

// =====================================================================
// Operation types editor
// =====================================================================

function OperationTypesEditor() {
  const utils = trpc.useUtils();
  const list = trpc.admin.iceOperations.listOperationTypes.useQuery();

  const createOperationType =
    trpc.admin.iceOperations.createOperationType.useMutation({
      onSuccess: () =>
        utils.admin.iceOperations.listOperationTypes.invalidate(),
    });
  const reorderOperationTypes =
    trpc.admin.iceOperations.reorderOperationTypes.useMutation({
      onSuccess: () =>
        utils.admin.iceOperations.listOperationTypes.invalidate(),
    });

  function onAdd() {
    const name = window.prompt("Name for the new operation type:");
    if (!name) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    createOperationType.mutate({ name: trimmed });
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
    reorderOperationTypes.mutate({ ids: next.map((c) => c.id) });
  }

  return (
    <div>
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Operation types</h3>
        <button
          type="button"
          onClick={onAdd}
          disabled={createOperationType.isPending}
          className="rounded bg-navy px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {createOperationType.isPending ? "Adding…" : "+ Add operation type"}
        </button>
      </header>

      {createOperationType.error && (
        <p className="mt-2 text-sm text-red">
          {createOperationType.error.message}
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
          No operation types yet. Add one (e.g. &ldquo;Ice Cut&rdquo;) to
          create the first staff tab.
        </p>
      )}

      {list.data && list.data.length > 0 && (
        <ul className="mt-3 flex flex-col gap-4">
          {list.data.map((opType, index) => (
            <li key={opType.id}>
              <OperationTypeCard
                opType={opType}
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

function OperationTypeCard({
  opType,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  opType: OperationType;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const utils = trpc.useUtils();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(opType.name);
  const [addingField, setAddingField] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  const updateOperationType =
    trpc.admin.iceOperations.updateOperationType.useMutation({
      onSuccess: () => {
        utils.admin.iceOperations.listOperationTypes.invalidate();
        setRenaming(false);
      },
    });
  const deleteOperationType =
    trpc.admin.iceOperations.deleteOperationType.useMutation({
      onSuccess: () =>
        utils.admin.iceOperations.listOperationTypes.invalidate(),
    });
  const reorderFields = trpc.admin.iceOperations.reorderFields.useMutation({
    onSuccess: () => utils.admin.iceOperations.listOperationTypes.invalidate(),
  });

  function onSaveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    updateOperationType.mutate({ id: opType.id, name: trimmed });
  }

  function onDelete() {
    if (
      !window.confirm(
        `Delete the "${opType.name}" operation type? This removes all of its fields. Logged operations against this type will block the delete.`,
      )
    ) {
      return;
    }
    deleteOperationType.mutate({ id: opType.id });
  }

  function onMoveField(index: number, direction: -1 | 1) {
    const next = [...opType.fields];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= next.length) return;
    const current = next[index];
    const other = next[swapIndex];
    if (!current || !other) return;
    next[index] = other;
    next[swapIndex] = current;
    reorderFields.mutate({
      operation_type_id: opType.id,
      ids: next.map((f) => f.id),
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
              disabled={updateOperationType.isPending}
              className="rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setName(opType.name);
                setRenaming(false);
              }}
              className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
            >
              Cancel
            </button>
          </form>
        ) : (
          <h4 className="flex-1 text-base font-semibold text-white">
            {opType.name}
          </h4>
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp || reorderFields.isPending}
            title="Move up"
            className="rounded border border-grey/40 px-2 py-1 text-xs text-grey hover:border-white hover:text-white disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown || reorderFields.isPending}
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
            disabled={deleteOperationType.isPending}
            className="rounded border border-red/40 px-2 py-1 text-xs text-red hover:border-red hover:bg-red/10 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </header>

      {updateOperationType.error && (
        <p className="mt-2 text-sm text-red">
          {updateOperationType.error.message}
        </p>
      )}
      {deleteOperationType.error && (
        <p className="mt-2 text-sm text-red">
          {deleteOperationType.error.message}
        </p>
      )}

      {opType.fields.length === 0 ? (
        <p className="mt-3 text-sm text-grey">
          No fields yet. Operation entries will only capture the equipment
          and timestamp until you add fields below.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {opType.fields.map((field, index) => (
            <li key={field.id}>
              {editingFieldId === field.id ? (
                <FieldEditor
                  mode="edit"
                  field={field}
                  onCancel={() => setEditingFieldId(null)}
                  onDone={() => setEditingFieldId(null)}
                />
              ) : (
                <FieldRow
                  field={field}
                  canMoveUp={index > 0}
                  canMoveDown={index < opType.fields.length - 1}
                  onMoveUp={() => onMoveField(index, -1)}
                  onMoveDown={() => onMoveField(index, 1)}
                  onEdit={() => setEditingFieldId(field.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {addingField ? (
        <div className="mt-3">
          <FieldEditor
            mode="create"
            operationTypeId={opType.id}
            onCancel={() => setAddingField(false)}
            onDone={() => setAddingField(false)}
          />
        </div>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setAddingField(true)}
            className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
          >
            + Add field
          </button>
        </div>
      )}
    </div>
  );
}

function FieldRow({
  field,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onEdit,
}: {
  field: OperationTypeField;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
}) {
  const utils = trpc.useUtils();
  const deleteField = trpc.admin.iceOperations.deleteField.useMutation({
    onSuccess: () => utils.admin.iceOperations.listOperationTypes.invalidate(),
  });

  function onDelete() {
    if (!window.confirm(`Delete the "${field.label}" field?`)) return;
    deleteField.mutate({ id: field.id });
  }

  return (
    <div className="flex items-center gap-3 rounded border border-grey/10 bg-darkbg/40 px-3 py-2">
      <div className="flex-1">
        <div className="text-sm text-white">{field.label}</div>
        <div className="text-xs text-grey">
          {FIELD_TYPE_LABELS[field.type]}
          {field.required ? " · required" : ""}
          {field.type === "dropdown" && field.options && field.options.length > 0
            ? ` · ${field.options.length} option${field.options.length === 1 ? "" : "s"}`
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
          disabled={deleteField.isPending}
          className="rounded border border-red/40 px-2 py-1 text-xs text-red hover:border-red hover:bg-red/10 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {deleteField.error && (
        <p className="w-full basis-full pt-2 text-xs text-red">
          {deleteField.error.message}
        </p>
      )}
    </div>
  );
}

type FieldEditorProps =
  | {
      mode: "create";
      operationTypeId: string;
      onCancel: () => void;
      onDone: () => void;
    }
  | {
      mode: "edit";
      field: OperationTypeField;
      onCancel: () => void;
      onDone: () => void;
    };

function FieldEditor(props: FieldEditorProps) {
  const utils = trpc.useUtils();
  const createField = trpc.admin.iceOperations.createField.useMutation({
    onSuccess: () => {
      utils.admin.iceOperations.listOperationTypes.invalidate();
      props.onDone();
    },
  });
  const updateField = trpc.admin.iceOperations.updateField.useMutation({
    onSuccess: () => {
      utils.admin.iceOperations.listOperationTypes.invalidate();
      props.onDone();
    },
  });

  const initial = props.mode === "edit" ? props.field : null;
  const [label, setLabel] = useState(initial?.label ?? "");
  const [type, setType] = useState<FieldType>(initial?.type ?? "text");
  const [required, setRequired] = useState(initial?.required ?? false);
  const [optionsText, setOptionsText] = useState(
    initial?.options ? initial.options.join("\n") : "",
  );

  const pending = createField.isPending || updateField.isPending;
  const error = createField.error ?? updateField.error;

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
        window.alert("Dropdown fields need at least one option.");
        return;
      }
    }

    if (props.mode === "create") {
      createField.mutate({
        operation_type_id: props.operationTypeId,
        label: trimmedLabel,
        type,
        required,
        options,
      });
    } else {
      updateField.mutate({
        id: props.field.id,
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
            onChange={(e) => setType(e.target.value as FieldType)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABELS[t]}
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
            placeholder={"Sharp\nFair\nDull"}
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
              ? "Add field"
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
