"use client";

import { useMemo, useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import { db } from "@/lib/offline/db";
import { nudgeSync } from "@/lib/offline/sync-engine";
import {
  IceOperationSubmissionInput,
  type AnswerValue,
  type Equipment,
  type IceOperationAnswers,
  type OperationType,
  type OperationTypeField,
} from "@/modules/ice-operations/schema";

/**
 * Renders one operation type as an editable form. CLAUDE.md Rule 3:
 *
 *   1. Validate locally
 *   2. await db.queue.add(...)
 *   3. Show success immediately
 *   4. nudgeSync() in the background
 *   5. Invalidate the recent-operations query so the new row appears
 *
 * Equipment is required on every entry (per spec). The form
 * pre-selects the first active piece of equipment so the most common
 * "log a Zamboni cut" path stays one click + submit.
 */

interface OperationFormProps {
  opType: OperationType;
  equipment: readonly Equipment[];
}

type FieldValue = string | boolean;

function emptyState(
  fields: readonly OperationTypeField[],
): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const f of fields) {
    out[f.id] = f.type === "checkbox" ? false : "";
  }
  return out;
}

export function OperationForm({ opType, equipment }: OperationFormProps) {
  const utils = trpc.useUtils();
  const initial = useMemo(() => emptyState(opType.fields), [opType.fields]);
  const [values, setValues] = useState<Record<string, FieldValue>>(initial);
  const [equipmentId, setEquipmentId] = useState<string>(
    equipment[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Parent uses key={opType.id} so this component remounts on tab
  // change — no manual reset needed.

  function setField(fieldId: string, next: FieldValue) {
    setValues((prev) => ({ ...prev, [fieldId]: next }));
  }

  function buildAnswers():
    | { ok: true; answers: IceOperationAnswers }
    | { ok: false; error: string } {
    const answers: IceOperationAnswers = {};
    for (const field of opType.fields) {
      const raw = values[field.id];
      let value: AnswerValue;
      switch (field.type) {
        case "checkbox":
          value = raw === true;
          break;
        case "number": {
          if (typeof raw !== "string" || raw.trim() === "") {
            if (field.required)
              return { ok: false, error: `${field.label} is required` };
            value = null;
            break;
          }
          const n = Number(raw);
          if (Number.isNaN(n))
            return { ok: false, error: `${field.label} must be a number` };
          value = n;
          break;
        }
        case "text":
        case "long_text":
        case "dropdown": {
          const s = typeof raw === "string" ? raw.trim() : "";
          if (s.length === 0) {
            if (field.required)
              return { ok: false, error: `${field.label} is required` };
            value = null;
            break;
          }
          value = s;
          break;
        }
      }
      answers[field.id] = value;
    }
    return { ok: true, answers };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPending(true);

    if (!equipmentId) {
      setError("Equipment is required");
      setPending(false);
      return;
    }

    const built = buildAnswers();
    if (!built.ok) {
      setError(built.error);
      setPending(false);
      return;
    }

    const payload = {
      local_id: crypto.randomUUID(),
      operation_type_id: opType.id,
      equipment_id: equipmentId,
      submitted_at: new Date().toISOString(),
      answers: built.answers,
    };

    const parsed = IceOperationSubmissionInput.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid submission");
      setPending(false);
      return;
    }

    try {
      await db.queue.add({
        localId: parsed.data.local_id,
        table: "ice_operations",
        payload: parsed.data,
        syncedAt: 0,
        serverId: null,
        retryCount: 0,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save locally";
      setError(message);
      setPending(false);
      return;
    }

    setValues(emptyState(opType.fields));
    // Keep equipment selected — the same operator usually keeps logging
    // against the same Zamboni for a while.
    setSuccess("Saved locally — syncing in the background.");
    setPending(false);

    nudgeSync();
    void utils.iceOperations.listRecent.invalidate();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-grey/30 bg-darkbg/40 p-6"
    >
      <h2 className="text-xl font-semibold text-white">{opType.name}</h2>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-grey">Equipment *</span>
        <select
          required
          value={equipmentId}
          onChange={(e) => setEquipmentId(e.target.value)}
          className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
        >
          {equipment.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>

      {opType.fields.length > 0 && (
        <div className="flex flex-col gap-4">
          {opType.fields.map((field) => (
            <FieldInput
              key={field.id}
              field={field}
              value={values[field.id]}
              onChange={(v) => setField(field.id, v)}
            />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red" role="alert">
          {error}
        </p>
      )}
      {success && <p className="text-sm text-green">{success}</p>}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Log operation"}
        </button>
      </div>
    </form>
  );
}

interface FieldInputProps {
  field: OperationTypeField;
  value: FieldValue | undefined;
  onChange: (next: FieldValue) => void;
}

function FieldInput({ field, value, onChange }: FieldInputProps) {
  const baseInput =
    "rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none";

  const labelText = field.required ? `${field.label} *` : field.label;

  switch (field.type) {
    case "text":
      return (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">{labelText}</span>
          <input
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={baseInput}
          />
        </label>
      );
    case "long_text":
      return (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">{labelText}</span>
          <textarea
            rows={3}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={baseInput}
          />
        </label>
      );
    case "number":
      return (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">{labelText}</span>
          <input
            type="number"
            inputMode="decimal"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={baseInput}
          />
        </label>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm text-grey">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-grey/40 bg-darkbg"
          />
          <span>{labelText}</span>
        </label>
      );
    case "dropdown":
      return (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">{labelText}</span>
          <select
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={baseInput}
          >
            <option value="">— Select —</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      );
  }
}
