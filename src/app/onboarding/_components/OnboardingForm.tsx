"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { trpc } from "@/lib/trpc";

const COMMON_TIMEZONES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "America/Halifax", label: "Atlantic (Halifax)" },
  { value: "America/Toronto", label: "Eastern Canada (Toronto)" },
  { value: "America/Edmonton", label: "Mountain Canada (Edmonton)" },
  { value: "Europe/London", label: "UK (London)" },
];

/**
 * Onboarding form. Calls the SECURITY DEFINER `create_facility()`
 * Postgres function via the `onboarding.createFacility` tRPC
 * procedure, then hard-navigates to /dashboard so the new
 * user_profiles row is picked up by the dashboard layout's
 * server-side auth gate.
 */
export function OnboardingForm({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const create = trpc.onboarding.createFacility.useMutation({
    onSuccess: () => {
      // Hard navigate so the server-side dashboard layout re-fetches
      // the user_profiles row and sees the new facility_id.
      router.push("/dashboard");
      router.refresh();
    },
  });

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    create.mutate({ name: trimmed, timezone });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-grey/30 bg-darkbg/40 p-6"
    >
      <div className="text-xs text-grey">
        Signed in as <span className="text-white">{userEmail}</span>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-grey">Facility name *</span>
        <input
          type="text"
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Northshore Ice Center"
          className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-grey">Timezone</span>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
      </label>

      <p className="text-xs text-grey">
        You can change the facility name and timezone later from the
        Admin Control Center. All eight modules will be created in
        the disabled state — turn them on as you&apos;re ready to use
        them.
      </p>

      {create.error && (
        <p className="text-sm text-red" role="alert">
          {create.error.message}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "Create facility & start trial"}
        </button>
      </div>
    </form>
  );
}
