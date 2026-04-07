"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import {
  EMPTY_ACTIONS,
  EMPTY_THRESHOLDS,
  POLLUTANT_LABELS,
  TIER_LABELS,
  validateAgainstLimits,
  type ActionProtocol,
  type ThresholdSet,
} from "@/modules/air-quality/schema";

/**
 * Air Quality admin panel.
 *
 * Three sub-forms, each saved independently:
 *   1. Regulatory limits — the legal MAXIMUM threshold per cell.
 *      Admin enters from their jurisdiction.
 *   2. Working thresholds — what the facility actually uses. Must be
 *      ≤ regulatory limits cell-wise (the "tighten only" rule).
 *      Sub-form validates client-side AND server-side.
 *   3. Action protocol text — what the form shows the operator at
 *      each tier.
 *
 * Each sub-form remounts (via key prop) when its server snapshot
 * changes, so admin edits aren't silently overwritten by background
 * refetches and we don't need a setState-in-effect.
 */
export function AirQualityConfigCard() {
  const config = trpc.admin.getConfig.useQuery({ module: "air-quality" });

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Air Quality</h2>
      <p className="mt-1 text-sm text-grey">
        Configure your jurisdiction&rsquo;s regulatory limits, set the
        working thresholds for each escalation tier (you can only
        tighten — never loosen — below the regulatory limit), and write
        the action protocol your staff should follow at each tier.
      </p>

      {config.isLoading && (
        <p className="mt-4 text-sm text-grey">Loading…</p>
      )}
      {config.error && (
        <p className="mt-4 text-sm text-red">{config.error.message}</p>
      )}
      {config.data !== undefined && (
        <div className="mt-6 flex flex-col gap-8">
          <RegulatoryLimitsForm
            key={`limits:${configKey(config.data, "regulatory_limits")}`}
            initial={pickThresholdSet(config.data, "regulatory_limits")}
          />
          <ThresholdsForm
            key={`thresholds:${configKey(config.data, "thresholds")}`}
            initial={pickThresholdSet(config.data, "thresholds")}
            limits={pickThresholdSet(config.data, "regulatory_limits")}
          />
          <ActionsForm
            key={`actions:${configKey(config.data, "actions")}`}
            initial={pickActions(config.data)}
          />
        </div>
      )}
    </section>
  );
}

// =====================================================================
// Regulatory limits form
// =====================================================================

function RegulatoryLimitsForm({ initial }: { initial: ThresholdSet }) {
  const utils = trpc.useUtils();
  const setLimits = trpc.admin.airQuality.setRegulatoryLimits.useMutation({
    onSuccess: () => {
      utils.admin.getConfig.invalidate({ module: "air-quality" });
      setSaved(true);
    },
  });

  const [draft, setDraft] = useState<ThresholdDraft>(() =>
    toDraft(initial),
  );
  const [saved, setSaved] = useState(false);

  function onChange(cell: keyof ThresholdSet, value: string) {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [cell]: value }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseDraft(draft);
    if ("error" in parsed) {
      window.alert(parsed.error);
      return;
    }
    setLimits.mutate({ limits: parsed.value });
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-white">Regulatory limits</h3>
      <p className="mt-1 text-sm text-grey">
        The maximum threshold values your jurisdiction allows. Working
        thresholds (below) cannot exceed these values.
      </p>

      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3">
        <ThresholdGrid draft={draft} onChange={onChange} />

        {setLimits.error && (
          <p className="text-sm text-red">{setLimits.error.message}</p>
        )}
        {saved && <p className="text-sm text-green">Limits saved.</p>}

        <div>
          <button
            type="submit"
            disabled={setLimits.isPending}
            className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {setLimits.isPending ? "Saving…" : "Save limits"}
          </button>
        </div>
      </form>
    </div>
  );
}

// =====================================================================
// Working thresholds form
// =====================================================================

function ThresholdsForm({
  initial,
  limits,
}: {
  initial: ThresholdSet;
  limits: ThresholdSet;
}) {
  const utils = trpc.useUtils();
  const setThresholds = trpc.admin.airQuality.setThresholds.useMutation({
    onSuccess: () => {
      utils.admin.getConfig.invalidate({ module: "air-quality" });
      setSaved(true);
    },
  });

  const [draft, setDraft] = useState<ThresholdDraft>(() => toDraft(initial));
  const [saved, setSaved] = useState(false);

  function onChange(cell: keyof ThresholdSet, value: string) {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [cell]: value }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseDraft(draft);
    if ("error" in parsed) {
      window.alert(parsed.error);
      return;
    }
    // Client-side validation against the regulatory limits, so the
    // admin sees the issue immediately rather than after a server
    // round-trip.
    const issues = validateAgainstLimits(parsed.value, limits);
    if (issues.length > 0) {
      window.alert(issues.map((i) => i.message).join("\n"));
      return;
    }
    setThresholds.mutate({ thresholds: parsed.value });
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-white">Working thresholds</h3>
      <p className="mt-1 text-sm text-grey">
        The actual readings (in ppm) at which each escalation tier
        triggers. Must be ≤ the regulatory limit for the same cell.
        You can save before entering regulatory limits, but order
        within a pollutant (caution ≤ action ≤ evacuate) is always
        enforced.
      </p>

      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3">
        <ThresholdGrid draft={draft} onChange={onChange} limits={limits} />

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
    </div>
  );
}

// =====================================================================
// Threshold grid (shared by both threshold forms)
// =====================================================================

type ThresholdDraft = Record<keyof ThresholdSet, string>;

const POLLUTANT_KEYS = ["co", "no2"] as const;
const TIER_KEYS = ["caution", "action", "evacuate"] as const;

function toDraft(set: ThresholdSet): ThresholdDraft {
  return {
    co_caution: set.co_caution !== null ? String(set.co_caution) : "",
    co_action: set.co_action !== null ? String(set.co_action) : "",
    co_evacuate: set.co_evacuate !== null ? String(set.co_evacuate) : "",
    no2_caution: set.no2_caution !== null ? String(set.no2_caution) : "",
    no2_action: set.no2_action !== null ? String(set.no2_action) : "",
    no2_evacuate: set.no2_evacuate !== null ? String(set.no2_evacuate) : "",
  };
}

function parseDraft(
  draft: ThresholdDraft,
): { value: ThresholdSet } | { error: string } {
  const out: Record<string, number | null> = {};
  for (const cell of Object.keys(draft) as (keyof ThresholdSet)[]) {
    const raw = draft[cell].trim();
    if (raw === "") {
      out[cell] = null;
      continue;
    }
    const n = Number(raw);
    if (Number.isNaN(n) || n < 0) {
      return { error: `${cell}: must be a non-negative number` };
    }
    out[cell] = n;
  }
  return { value: out as unknown as ThresholdSet };
}

function ThresholdGrid({
  draft,
  onChange,
  limits,
}: {
  draft: ThresholdDraft;
  onChange: (cell: keyof ThresholdSet, value: string) => void;
  limits?: ThresholdSet;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-grey">
            <th className="py-2 pr-3 font-medium">Pollutant</th>
            {TIER_KEYS.map((tier) => (
              <th key={tier} className="py-2 pr-3 font-medium">
                {TIER_LABELS[tier]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {POLLUTANT_KEYS.map((p) => (
            <tr key={p} className="border-t border-grey/20">
              <td className="py-2 pr-3 text-white">{POLLUTANT_LABELS[p]}</td>
              {TIER_KEYS.map((tier) => {
                const cell = `${p}_${tier}` as keyof ThresholdSet;
                const limit = limits ? limits[cell] : null;
                return (
                  <td key={tier} className="py-2 pr-3">
                    <input
                      type="number"
                      step="any"
                      min={0}
                      inputMode="decimal"
                      value={draft[cell]}
                      onChange={(e) => onChange(cell, e.target.value)}
                      className="w-24 rounded border border-grey/40 bg-darkbg px-2 py-1 text-white focus:border-navy focus:outline-none"
                    />
                    {limits && limit !== null && (
                      <div className="mt-1 text-xs text-grey/70">
                        Limit: {limit}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =====================================================================
// Action protocol form
// =====================================================================

function ActionsForm({ initial }: { initial: ActionProtocol }) {
  const utils = trpc.useUtils();
  const setActions = trpc.admin.airQuality.setActions.useMutation({
    onSuccess: () => {
      utils.admin.getConfig.invalidate({ module: "air-quality" });
      setSaved(true);
    },
  });

  const [draft, setDraft] = useState<ActionProtocol>(initial);
  const [saved, setSaved] = useState(false);

  function setField(key: keyof ActionProtocol, value: string) {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActions.mutate({ actions: draft });
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-white">Action protocol</h3>
      <p className="mt-1 text-sm text-grey">
        The instructions your staff see when a reading triggers each
        tier. Plain text, one block per tier.
      </p>

      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3">
        {(["caution", "action", "evacuate"] as const).map((key) => (
          <label key={key} className="flex flex-col gap-1 text-sm">
            <span className="text-grey">{TIER_LABELS[key]}</span>
            <textarea
              rows={3}
              maxLength={500}
              value={draft[key]}
              onChange={(e) => setField(key, e.target.value)}
              className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              placeholder={defaultPlaceholder(key)}
            />
          </label>
        ))}

        {setActions.error && (
          <p className="text-sm text-red">{setActions.error.message}</p>
        )}
        {saved && <p className="text-sm text-green">Actions saved.</p>}

        <div>
          <button
            type="submit"
            disabled={setActions.isPending}
            className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {setActions.isPending ? "Saving…" : "Save actions"}
          </button>
        </div>
      </form>
    </div>
  );
}

function defaultPlaceholder(tier: keyof ActionProtocol): string {
  // Hint text only — these are not actual defaults written to config.
  switch (tier) {
    case "caution":
      return "e.g. Notify supervisor and increase ventilation";
    case "action":
      return "e.g. Stop ice resurfacer, open all doors, retest in 15 minutes";
    case "evacuate":
      return "e.g. Evacuate the facility immediately and call 911";
  }
}

// =====================================================================
// Config payload helpers
// =====================================================================

function configKey(rows: unknown, key: string): string {
  if (!Array.isArray(rows)) return "empty";
  for (const row of rows) {
    if (
      row !== null &&
      typeof row === "object" &&
      "key" in row &&
      "value" in row &&
      (row as { key: unknown }).key === key
    ) {
      return JSON.stringify((row as { value: unknown }).value);
    }
  }
  return "empty";
}

function pickThresholdSet(rows: unknown, key: string): ThresholdSet {
  if (!Array.isArray(rows)) return EMPTY_THRESHOLDS;
  for (const row of rows) {
    if (
      row !== null &&
      typeof row === "object" &&
      "key" in row &&
      "value" in row &&
      (row as { key: unknown }).key === key
    ) {
      const v = (row as { value: unknown }).value;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        const r = v as Record<string, unknown>;
        return {
          co_caution: numOrNull(r.co_caution),
          co_action: numOrNull(r.co_action),
          co_evacuate: numOrNull(r.co_evacuate),
          no2_caution: numOrNull(r.no2_caution),
          no2_action: numOrNull(r.no2_action),
          no2_evacuate: numOrNull(r.no2_evacuate),
        };
      }
    }
  }
  return EMPTY_THRESHOLDS;
}

function pickActions(rows: unknown): ActionProtocol {
  if (!Array.isArray(rows)) return EMPTY_ACTIONS;
  for (const row of rows) {
    if (
      row !== null &&
      typeof row === "object" &&
      "key" in row &&
      "value" in row &&
      (row as { key: unknown }).key === "actions"
    ) {
      const v = (row as { value: unknown }).value;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        const r = v as Record<string, unknown>;
        return {
          caution: typeof r.caution === "string" ? r.caution : "",
          action: typeof r.action === "string" ? r.action : "",
          evacuate: typeof r.evacuate === "string" ? r.evacuate : "",
        };
      }
    }
  }
  return EMPTY_ACTIONS;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
