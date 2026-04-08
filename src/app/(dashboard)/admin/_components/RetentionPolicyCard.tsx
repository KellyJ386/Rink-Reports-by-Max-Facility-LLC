"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

/**
 * RetentionPolicyCard — "Data Retention"
 *
 * Displayed in the Admin Control Center. Lets facility admins
 * configure how many days of records to keep for each module.
 *
 * Rules:
 *   - Minimum value is 365 days for all configurable modules.
 *   - Admin can only increase retention, never decrease below 365.
 *   - incidents and air_quality_readings are compliance records;
 *     their rows show "Never — compliance record" and cannot be
 *     edited.
 *   - A warning banner explains the 30-day grace period before
 *     hard deletion.
 */

type FormState = {
  dailyReports: number;
  iceOperations: number;
  refrigerationReadings: number;
  iceDepthSessions: number;
};

const CONFIGURABLE_FIELDS: {
  key: keyof FormState;
  label: string;
}[] = [
  { key: "dailyReports", label: "Daily Reports" },
  { key: "iceOperations", label: "Ice Operations" },
  { key: "refrigerationReadings", label: "Refrigeration" },
  { key: "iceDepthSessions", label: "Ice Depth" },
];

export function RetentionPolicyCard() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const policiesQuery = (trpc.admin.getRetentionPolicies.useQuery as any)() as {
    data: Record<string, unknown> | undefined;
    isLoading: boolean;
    error: { message: string } | null;
    refetch: () => void;
  };

  const updateMutation = trpc.admin.updateRetentionPolicies.useMutation({
    onSuccess: () => {
      void policiesQuery.refetch();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: (err) => {
      setSaveError(err.message);
      setSaveStatus("error");
    },
  });

  const [form, setForm] = useState<FormState>({
    dailyReports: 365,
    iceOperations: 365,
    refrigerationReadings: 730,
    iceDepthSessions: 365,
  });
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Populate form once policies load
  useEffect(() => {
    const p = policiesQuery.data;
    if (!p) return;
    const cast = p as Record<string, unknown>;
    setForm({
      dailyReports:
        typeof cast.dailyReports === "number" ? cast.dailyReports : 365,
      iceOperations:
        typeof cast.iceOperations === "number" ? cast.iceOperations : 365,
      refrigerationReadings:
        typeof cast.refrigerationReadings === "number"
          ? cast.refrigerationReadings
          : 730,
      iceDepthSessions:
        typeof cast.iceDepthSessions === "number" ? cast.iceDepthSessions : 365,
    });
  }, [policiesQuery.data]);

  function handleChange(key: keyof FormState, rawValue: string) {
    const parsed = parseInt(rawValue, 10);
    if (!isNaN(parsed)) {
      setForm((prev) => ({ ...prev, [key]: parsed }));
    }
  }

  function handleSave() {
    setSaveStatus("saving");
    setSaveError(null);
    updateMutation.mutate({
      ...form,
      airQualityReadings: null,
      incidents: null,
    });
  }

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Data Retention</h2>
      <p className="mt-1 text-sm text-grey">
        Configure how long records are kept for each module. Minimum is 365
        days. Records older than the limit are soft-archived first, then
        permanently deleted after a 30-day grace period.
      </p>

      {/* Warning banner */}
      <div className="mt-4 rounded border border-yellow/50 bg-yellow/10 px-4 py-3 text-sm text-yellow">
        Reducing retention permanently deletes historical data after a 30-day
        grace period.
      </div>

      {policiesQuery.isLoading && (
        <p className="mt-4 text-sm text-grey">Loading retention policies…</p>
      )}
      {policiesQuery.error && (
        <p className="mt-4 text-sm text-red" role="alert">
          {policiesQuery.error.message}
        </p>
      )}

      {!policiesQuery.isLoading && !policiesQuery.error && (
        <div className="mt-6 flex flex-col gap-4">
          {/* Configurable modules */}
          {CONFIGURABLE_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-4">
              <label
                htmlFor={`retention-${key}`}
                className="w-48 text-sm text-white"
              >
                {label}
              </label>
              <input
                id={`retention-${key}`}
                type="number"
                min={365}
                step={1}
                value={form[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-28 rounded border border-grey/40 bg-darkbg/80 px-3 py-1.5 text-sm text-white focus:border-navy focus:outline-none"
              />
              <span className="text-sm text-grey">days</span>
            </div>
          ))}

          {/* Compliance-locked rows */}
          {(
            [
              { label: "Incidents" },
              { label: "Air Quality" },
            ] as const
          ).map(({ label }) => (
            <div key={label} className="flex items-center gap-4">
              <span className="w-48 text-sm text-white">{label}</span>
              <span className="w-28 rounded border border-grey/20 bg-darkbg/40 px-3 py-1.5 text-sm text-grey">
                —
              </span>
              <span className="text-sm text-grey">
                Never — compliance record
              </span>
            </div>
          ))}

          {/* Save */}
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveStatus === "saving"}
              className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saveStatus === "saving" ? "Saving…" : "Save retention policy"}
            </button>
            {saveStatus === "saved" && (
              <span className="text-sm text-green">Saved!</span>
            )}
            {saveStatus === "error" && saveError && (
              <span className="text-sm text-red" role="alert">
                {saveError}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
