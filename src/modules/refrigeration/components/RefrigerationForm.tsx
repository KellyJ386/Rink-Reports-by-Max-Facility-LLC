"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import { db } from "@/lib/offline/db";
import { nudgeSync } from "@/lib/offline/sync-engine";
import {
  COMPRESSOR_FIELDS,
  FACILITY_FIELDS,
  RefrigerationReadingInput,
  isOutOfRange,
  type Compressor,
  type CompressorFieldKey,
  type CompressorReadingRow,
  type FacilityFieldKey,
  type RefrigerationFieldDef,
  type ThresholdMap,
  type ThresholdRange,
} from "@/modules/refrigeration/schema";

/**
 * Refrigeration reading form. Per CLAUDE.md Rule 3:
 *
 *   1. Validate locally (numeric parse, threshold render hint only —
 *      out-of-range does NOT block submit; the operator decides)
 *   2. await db.queue.add(...)
 *   3. Show success immediately
 *   4. nudgeSync() in the background
 *   5. Invalidate the recent readings query
 *
 * Threshold ranges from facility_config drive the inline hint
 * ("Normal: 50–80 PSI") and the yellow border/badge on out-of-range
 * inputs. They are NOT enforced — the form lets you save anyway,
 * because the whole point of logging is to capture out-of-range
 * conditions.
 */

interface RefrigerationFormProps {
  compressors: readonly Compressor[];
  thresholds: ThresholdMap;
}

// All inputs are stored as strings so an empty input is "no reading"
// rather than 0.
type CompressorValues = Record<CompressorFieldKey, string>;
type FacilityValues = Record<FacilityFieldKey, string>;

function emptyCompressorValues(): CompressorValues {
  return {
    suction_pressure: "",
    discharge_pressure: "",
    oil_pressure: "",
    amps: "",
    oil_temperature: "",
  };
}

function emptyFacilityValues(): FacilityValues {
  return {
    brine_supply: "",
    brine_return: "",
    brine_flow: "",
    ice_surface_temp: "",
    condenser_temp: "",
  };
}

function parseOptional(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return null;
  return n;
}

export function RefrigerationForm({
  compressors,
  thresholds,
}: RefrigerationFormProps) {
  const utils = trpc.useUtils();
  const [compressorValues, setCompressorValues] = useState<
    Record<string, CompressorValues>
  >(() =>
    Object.fromEntries(compressors.map((c) => [c.id, emptyCompressorValues()])),
  );
  const [facilityValues, setFacilityValues] = useState<FacilityValues>(
    emptyFacilityValues(),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setCompressorField(
    compressorId: string,
    key: CompressorFieldKey,
    value: string,
  ) {
    setCompressorValues((prev) => ({
      ...prev,
      [compressorId]: {
        ...(prev[compressorId] ?? emptyCompressorValues()),
        [key]: value,
      },
    }));
  }

  function setFacilityField(key: FacilityFieldKey, value: string) {
    setFacilityValues((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setCompressorValues(
      Object.fromEntries(
        compressors.map((c) => [c.id, emptyCompressorValues()]),
      ),
    );
    setFacilityValues(emptyFacilityValues());
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPending(true);

    // Build the typed payload from string state.
    const compressorRows: CompressorReadingRow[] = compressors.map((c) => {
      const v = compressorValues[c.id] ?? emptyCompressorValues();
      return {
        compressor_id: c.id,
        suction_pressure: parseOptional(v.suction_pressure),
        discharge_pressure: parseOptional(v.discharge_pressure),
        oil_pressure: parseOptional(v.oil_pressure),
        amps: parseOptional(v.amps),
        oil_temperature: parseOptional(v.oil_temperature),
      };
    });

    const payload = {
      local_id: crypto.randomUUID(),
      submitted_at: new Date().toISOString(),
      brine_supply: parseOptional(facilityValues.brine_supply),
      brine_return: parseOptional(facilityValues.brine_return),
      brine_flow: parseOptional(facilityValues.brine_flow),
      ice_surface_temp: parseOptional(facilityValues.ice_surface_temp),
      condenser_temp: parseOptional(facilityValues.condenser_temp),
      compressor_readings: compressorRows,
    };

    const parsed = RefrigerationReadingInput.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid reading");
      setPending(false);
      return;
    }

    try {
      await db.queue.add({
        localId: parsed.data.local_id,
        table: "refrigeration_readings",
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

    resetForm();
    setSuccess("Saved locally — syncing in the background.");
    setPending(false);

    nudgeSync();
    void utils.refrigeration.listRecent.invalidate();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-6 rounded-lg border border-grey/30 bg-darkbg/40 p-6"
    >
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-white">Compressors</h2>
        <div className="flex flex-col gap-4">
          {compressors.map((c) => (
            <CompressorCard
              key={c.id}
              compressor={c}
              values={compressorValues[c.id] ?? emptyCompressorValues()}
              thresholds={thresholds}
              onChange={(k, v) => setCompressorField(c.id, k, v)}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-white">
          Brine, ice, condenser
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FACILITY_FIELDS.map((f) => (
            <NumericInput
              key={f.key}
              field={f}
              value={facilityValues[f.key as FacilityFieldKey]}
              range={thresholds[f.key]}
              onChange={(v) => setFacilityField(f.key as FacilityFieldKey, v)}
            />
          ))}
        </div>
      </section>

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
          {pending ? "Saving…" : "Submit reading"}
        </button>
      </div>
    </form>
  );
}

function CompressorCard({
  compressor,
  values,
  thresholds,
  onChange,
}: {
  compressor: Compressor;
  values: CompressorValues;
  thresholds: ThresholdMap;
  onChange: (key: CompressorFieldKey, value: string) => void;
}) {
  return (
    <div className="rounded border border-grey/20 bg-darkbg/60 p-4">
      <h3 className="text-base font-semibold text-white">{compressor.name}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COMPRESSOR_FIELDS.map((f) => (
          <NumericInput
            key={f.key}
            field={f}
            value={values[f.key as CompressorFieldKey]}
            range={thresholds[f.key]}
            onChange={(v) => onChange(f.key as CompressorFieldKey, v)}
          />
        ))}
      </div>
    </div>
  );
}

function NumericInput({
  field,
  value,
  range,
  onChange,
}: {
  field: RefrigerationFieldDef;
  value: string;
  range: ThresholdRange | undefined;
  onChange: (next: string) => void;
}) {
  const numeric = parseOptional(value);
  const flagged = isOutOfRange(numeric, range);

  const baseInput =
    "rounded border bg-darkbg px-3 py-2 text-white focus:outline-none";
  const borderClass = flagged
    ? "border-yellow focus:border-yellow"
    : "border-grey/40 focus:border-navy";

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center justify-between gap-2 text-grey">
        <span>
          {field.label}{" "}
          <span className="text-xs text-grey/70">({field.unit})</span>
        </span>
        {flagged && (
          <span className="rounded border border-yellow/60 px-1.5 text-[10px] font-medium uppercase text-yellow">
            Out of range
          </span>
        )}
      </span>
      <input
        type="number"
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${baseInput} ${borderClass}`}
      />
      <span className="text-xs text-grey/70">{rangeHint(range)}</span>
    </label>
  );
}

function rangeHint(range: ThresholdRange | undefined): string {
  if (!range) return "No range set";
  if (range.min !== null && range.max !== null) {
    return `Normal: ${range.min}–${range.max}`;
  }
  if (range.min !== null) return `Normal: ≥ ${range.min}`;
  if (range.max !== null) return `Normal: ≤ ${range.max}`;
  return "No range set";
}
