"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { usePushSubscription } from "@/hooks/usePushSubscription";

/**
 * NotificationPrefsCard — "My Notification Preferences"
 *
 * Displayed in the Admin Control Center. Lets the signed-in user
 * configure which channels receive alert fan-out and at what
 * minimum severity.
 *
 * Push toggle is only shown when the browser supports PushManager.
 * Enabling push calls usePushSubscription().subscribe() which
 * requests permission and registers the device.
 */

const KNOWN_ALERT_TYPES = [
  { value: "refrigeration_drift", label: "Refrigeration Drift" },
  { value: "missed_daily_report", label: "Missed Daily Report" },
  { value: "air_quality_escalation", label: "Air Quality Escalation" },
  { value: "ice_depth_thin_spot", label: "Ice Depth Thin Spot" },
] as const;

type KnownAlertType = (typeof KNOWN_ALERT_TYPES)[number]["value"];

export function NotificationPrefsCard() {
  const prefsQuery = trpc.notifications.getNotificationPrefs.useQuery();
  const upsertMutation = trpc.notifications.upsertNotificationPrefs.useMutation(
    {
      onSuccess: () => {
        void prefsQuery.refetch();
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      },
      onError: (err) => {
        setSaveError(err.message);
        setSaveStatus("error");
      },
    },
  );

  const { isSupported: isPushSupported, subscribe: subscribePush } =
    usePushSubscription();

  // Local form state — mirrors server prefs
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [minSeverity, setMinSeverity] = useState<
    "info" | "warning" | "critical"
  >("warning");
  const [alertTypes, setAlertTypes] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  // Populate form once prefs load
  useEffect(() => {
    const prefs = prefsQuery.data;
    if (!prefs) return;
    setEmailEnabled(prefs.emailEnabled);
    setSmsEnabled(prefs.smsEnabled);
    setPushEnabled(prefs.pushEnabled);
    setPhoneNumber(prefs.phoneNumber ?? "");
    setMinSeverity(prefs.minSeverity);
    setAlertTypes(prefs.alertTypes);
  }, [prefsQuery.data]);

  async function handlePushToggle(enabled: boolean) {
    setPushError(null);
    if (enabled) {
      try {
        await subscribePush();
        setPushEnabled(true);
      } catch (err) {
        setPushError(
          err instanceof Error ? err.message : "Push subscription failed",
        );
        setPushEnabled(false);
      }
    } else {
      setPushEnabled(false);
    }
  }

  function toggleAlertType(type: KnownAlertType) {
    setAlertTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  function handleSave() {
    setSaveStatus("saving");
    setSaveError(null);
    upsertMutation.mutate({
      emailEnabled,
      smsEnabled,
      pushEnabled,
      phoneNumber: phoneNumber.trim() || null,
      minSeverity,
      alertTypes,
    });
  }

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">
        My Notification Preferences
      </h2>
      <p className="mt-1 text-sm text-grey">
        Choose how you receive alerts for this facility. Only{" "}
        <span className="text-yellow">Warning</span> and{" "}
        <span className="text-red">Critical</span> alerts trigger
        notifications; Info alerts are UI-only.
      </p>

      {prefsQuery.isLoading && (
        <p className="mt-4 text-sm text-grey">Loading preferences…</p>
      )}
      {prefsQuery.error && (
        <p className="mt-4 text-sm text-red" role="alert">
          {prefsQuery.error.message}
        </p>
      )}

      {(prefsQuery.data || !prefsQuery.isLoading) && !prefsQuery.error && (
        <div className="mt-6 flex flex-col gap-5">
          {/* ── Channels ── */}
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-white">Channels</legend>

            {/* Email */}
            <label className="flex items-center gap-3 text-sm text-grey">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-grey/40 bg-darkbg accent-navy"
              />
              <span className="text-white">Email notifications</span>
            </label>

            {/* SMS */}
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={smsEnabled}
                  onChange={(e) => setSmsEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-grey/40 bg-darkbg accent-navy"
                />
                <span className="text-white">SMS notifications</span>
              </label>
              {smsEnabled && (
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+15551234567 (E.164 format)"
                  className="ml-7 max-w-xs rounded border border-grey/40 bg-darkbg/80 px-3 py-1.5 text-sm text-white placeholder-grey/50 focus:border-navy focus:outline-none"
                />
              )}
            </div>

            {/* Push — only shown when PushManager is available */}
            {isPushSupported && (
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={pushEnabled}
                    onChange={(e) => void handlePushToggle(e.target.checked)}
                    className="h-4 w-4 rounded border-grey/40 bg-darkbg accent-navy"
                  />
                  <span className="text-white">Browser push notifications</span>
                </label>
                {pushError && (
                  <p className="ml-7 text-xs text-red" role="alert">
                    {pushError}
                  </p>
                )}
              </div>
            )}
          </fieldset>

          {/* ── Minimum Severity ── */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-white">
              Minimum severity to notify
            </legend>
            <div className="flex gap-4">
              {(
                [
                  { value: "info", label: "Info" },
                  { value: "warning", label: "Warning" },
                  { value: "critical", label: "Critical" },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 text-sm text-grey"
                >
                  <input
                    type="radio"
                    name="min-severity"
                    value={opt.value}
                    checked={minSeverity === opt.value}
                    onChange={() => setMinSeverity(opt.value)}
                    className="accent-navy"
                  />
                  <span className="text-white">{opt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* ── Alert Types ── */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-white">
              Alert types{" "}
              <span className="font-normal text-grey">
                (leave all unchecked to receive all types)
              </span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {KNOWN_ALERT_TYPES.map((type) => (
                <label
                  key={type.value}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={alertTypes.includes(type.value)}
                    onChange={() => toggleAlertType(type.value)}
                    className="h-4 w-4 rounded border-grey/40 bg-darkbg accent-navy"
                  />
                  <span className="text-white">{type.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* ── Save ── */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveStatus === "saving"}
              className="rounded bg-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saveStatus === "saving" ? "Saving…" : "Save preferences"}
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
