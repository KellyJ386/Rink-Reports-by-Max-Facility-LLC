"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import { TemperatureUnitEnum } from "@/modules/communications/schema";

/**
 * Communications admin panel.
 *
 * Two facility-wide settings drive the Universal Module Header on
 * generated PDFs:
 *   - Postal code + country (ISO) for the outdoor temp lookup
 *   - Temperature unit preference (°F vs °C)
 *
 * All three live in `facility_config` under module='communications'.
 * The form remounts on server-data identity change so admin edits
 * aren't silently overwritten by background refetches.
 */
export function CommunicationsConfigCard() {
  const config = trpc.admin.getConfig.useQuery({ module: "communications" });

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Communications</h2>
      <p className="mt-1 text-sm text-grey">
        Configure the postal code and temperature unit shown on every
        PDF&rsquo;s Universal Module Header. Outdoor temperature is
        looked up live via the Open-Meteo + Zippopotam.us APIs (no
        keys required).
      </p>

      {config.isLoading && (
        <p className="mt-4 text-sm text-grey">Loading…</p>
      )}
      {config.error && (
        <p className="mt-4 text-sm text-red">{config.error.message}</p>
      )}
      {config.data !== undefined && (
        <SettingsForm
          key={configKey(config.data)}
          initialPostalCode={pickString(config.data, "postal_code")}
          initialCountry={pickString(config.data, "country") || "us"}
          initialTempUnit={
            (pickString(config.data, "temp_unit") as "f" | "c") || "f"
          }
        />
      )}
    </section>
  );
}

function SettingsForm({
  initialPostalCode,
  initialCountry,
  initialTempUnit,
}: {
  initialPostalCode: string;
  initialCountry: string;
  initialTempUnit: "f" | "c";
}) {
  const utils = trpc.useUtils();
  const setSettings = trpc.admin.communications.setSettings.useMutation({
    onSuccess: () => {
      utils.admin.getConfig.invalidate({ module: "communications" });
      setSaved(true);
    },
  });

  const [postalCode, setPostalCode] = useState(initialPostalCode);
  const [country, setCountry] = useState(initialCountry);
  const [tempUnit, setTempUnit] = useState<"f" | "c">(initialTempUnit);
  const [saved, setSaved] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = postalCode.trim();
    if (trimmed.length === 0) {
      window.alert("Postal code is required");
      return;
    }
    const parsedUnit = TemperatureUnitEnum.safeParse(tempUnit);
    if (!parsedUnit.success) return;
    setSettings.mutate({
      postal_code: trimmed,
      country: country.trim() || "us",
      temp_unit: parsedUnit.data,
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Postal code</span>
          <input
            type="text"
            required
            maxLength={20}
            value={postalCode}
            onChange={(e) => {
              setSaved(false);
              setPostalCode(e.target.value);
            }}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Country (ISO 2-letter)</span>
          <input
            type="text"
            required
            maxLength={8}
            value={country}
            onChange={(e) => {
              setSaved(false);
              setCountry(e.target.value);
            }}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
        </label>
      </div>

      <fieldset className="text-sm">
        <legend className="text-grey">Temperature unit</legend>
        <div className="mt-2 flex items-center gap-4">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="temp_unit"
              checked={tempUnit === "f"}
              onChange={() => {
                setSaved(false);
                setTempUnit("f");
              }}
            />
            <span className="text-white">°F</span>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="temp_unit"
              checked={tempUnit === "c"}
              onChange={() => {
                setSaved(false);
                setTempUnit("c");
              }}
            />
            <span className="text-white">°C</span>
          </label>
        </div>
      </fieldset>

      {setSettings.error && (
        <p className="text-sm text-red">{setSettings.error.message}</p>
      )}
      {saved && <p className="text-sm text-green">Settings saved.</p>}

      <div>
        <button
          type="submit"
          disabled={setSettings.isPending}
          className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {setSettings.isPending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}

function configKey(rows: unknown): string {
  if (!Array.isArray(rows)) return "empty";
  return JSON.stringify(rows);
}

function pickString(rows: unknown, key: string): string {
  if (!Array.isArray(rows)) return "";
  for (const row of rows) {
    if (
      row !== null &&
      typeof row === "object" &&
      "key" in row &&
      "value" in row &&
      (row as { key: unknown }).key === key
    ) {
      const v = (row as { value: unknown }).value;
      if (typeof v === "string") return v;
    }
  }
  return "";
}
