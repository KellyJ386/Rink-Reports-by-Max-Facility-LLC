"use client";

import { useMemo, useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import { db } from "@/lib/offline/db";
import { nudgeSync } from "@/lib/offline/sync-engine";
import {
  AirQualityReadingInput,
  TIER_LABELS,
  computeTier,
  type ActionProtocol,
  type Tier,
  type ThresholdSet,
} from "@/modules/air-quality/schema";

/**
 * Air Quality reading form. Per CLAUDE.md Rule 3:
 *
 *   1. Validate locally
 *   2. await db.queue.add(...)
 *   3. Show success immediately
 *   4. nudgeSync() in the background
 *   5. Invalidate the recent-readings query
 *
 * The current tier is computed LIVE as the operator types so they
 * see exactly what protocol they're about to commit to. The server
 * recomputes the tier from the same algorithm at insert time and
 * persists it on the row, so historical reports never shift if the
 * thresholds are later retightened.
 */

interface AirQualityFormProps {
  thresholds: ThresholdSet;
  actions: ActionProtocol;
}

export function AirQualityForm({ thresholds, actions }: AirQualityFormProps) {
  const utils = trpc.useUtils();
  const [coStr, setCoStr] = useState("");
  const [no2Str, setNo2Str] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const previewTier = useMemo<Tier | null>(() => {
    const co = parseNumber(coStr);
    const no2 = parseNumber(no2Str);
    if (co === null || no2 === null) return null;
    return computeTier({ co_ppm: co, no2_ppm: no2 }, thresholds);
  }, [coStr, no2Str, thresholds]);

  function resetForm() {
    setCoStr("");
    setNo2Str("");
    setNotes("");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPending(true);

    const co = parseNumber(coStr);
    const no2 = parseNumber(no2Str);
    if (co === null) {
      setError("CO ppm is required");
      setPending(false);
      return;
    }
    if (no2 === null) {
      setError("NO₂ ppm is required");
      setPending(false);
      return;
    }
    if (co < 0 || no2 < 0) {
      setError("Readings must be non-negative");
      setPending(false);
      return;
    }

    const payload = {
      local_id: crypto.randomUUID(),
      submitted_at: new Date().toISOString(),
      co_ppm: co,
      no2_ppm: no2,
      notes: notes.trim() === "" ? undefined : notes.trim(),
    };

    const parsed = AirQualityReadingInput.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid reading");
      setPending(false);
      return;
    }

    try {
      await db.queue.add({
        localId: parsed.data.local_id,
        table: "air_quality_readings",
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
    void utils.airQuality.listRecent.invalidate();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-grey/30 bg-darkbg/40 p-6"
    >
      <h2 className="text-xl font-semibold text-white">Log a reading</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">CO (ppm) *</span>
          <input
            type="number"
            step="any"
            min={0}
            inputMode="decimal"
            required
            value={coStr}
            onChange={(e) => setCoStr(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
          <span className="text-xs text-grey/70">
            {rangeHint(thresholds.co_caution, thresholds.co_action, thresholds.co_evacuate)}
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">NO₂ (ppm) *</span>
          <input
            type="number"
            step="any"
            min={0}
            inputMode="decimal"
            required
            value={no2Str}
            onChange={(e) => setNo2Str(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
          <span className="text-xs text-grey/70">
            {rangeHint(thresholds.no2_caution, thresholds.no2_action, thresholds.no2_evacuate)}
          </span>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-grey">Notes</span>
        <textarea
          rows={2}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
        />
      </label>

      {previewTier !== null && (
        <TierPreview tier={previewTier} actions={actions} />
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
          {pending ? "Saving…" : "Submit reading"}
        </button>
      </div>
    </form>
  );
}

function TierPreview({
  tier,
  actions,
}: {
  tier: Tier;
  actions: ActionProtocol;
}) {
  const cls = tierClasses(tier);
  const protocol =
    tier === "normal"
      ? "Within normal operating range — no action required."
      : actions[tier] || "No protocol set. Ask your admin to add one.";

  return (
    <div className={`rounded border ${cls.border} ${cls.bg} p-3`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-semibold ${cls.text}`}>
          Current tier: {TIER_LABELS[tier]}
        </span>
      </div>
      <p className={`mt-1 text-sm ${cls.text}`}>{protocol}</p>
    </div>
  );
}

function tierClasses(tier: Tier): {
  border: string;
  bg: string;
  text: string;
} {
  switch (tier) {
    case "normal":
      return {
        border: "border-green/40",
        bg: "bg-green/5",
        text: "text-green",
      };
    case "caution":
      return {
        border: "border-yellow/60",
        bg: "bg-yellow/5",
        text: "text-yellow",
      };
    case "action":
      return {
        border: "border-yellow/80",
        bg: "bg-yellow/10",
        text: "text-yellow",
      };
    case "evacuate":
      return {
        border: "border-red/70",
        bg: "bg-red/10",
        text: "text-red",
      };
  }
}

function rangeHint(
  caution: number | null,
  action: number | null,
  evacuate: number | null,
): string {
  const parts: string[] = [];
  if (caution !== null) parts.push(`Caution ≥ ${caution}`);
  if (action !== null) parts.push(`Action ≥ ${action}`);
  if (evacuate !== null) parts.push(`Evacuate ≥ ${evacuate}`);
  if (parts.length === 0) return "No thresholds set";
  return parts.join(" · ");
}

function parseNumber(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return null;
  return n;
}
