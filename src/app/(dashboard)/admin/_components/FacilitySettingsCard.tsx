"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";

export function FacilitySettingsCard() {
  const utils = trpc.useUtils();
  const facility = trpc.admin.getFacility.useQuery();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const update = trpc.admin.updateFacility.useMutation({
    onSuccess: async () => {
      await utils.admin.getFacility.invalidate();
      setStatus("saved");
    },
    onError: (err) => {
      setStatus("error");
      setErrorMessage(err.message);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("idle");
    setErrorMessage(null);
    const data = new FormData(event.currentTarget);
    update.mutate({
      name: String(data.get("name") ?? "").trim(),
      timezone: String(data.get("timezone") ?? "").trim(),
    });
  }

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Facility settings</h2>
      <p className="mt-1 text-sm text-grey">
        Display name and timezone for this facility.
      </p>

      {facility.isLoading && (
        <p className="mt-4 text-sm text-grey">Loading…</p>
      )}

      {facility.error && (
        <p className="mt-4 text-sm text-red">{facility.error.message}</p>
      )}

      {facility.data && (
        <form
          onSubmit={onSubmit}
          // Remount the form (and reset its uncontrolled inputs) whenever
          // the underlying facility data changes — e.g. after a successful
          // save invalidates the query.
          key={`${facility.data.name}|${facility.data.timezone}`}
          className="mt-4 flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-grey">Facility name</span>
            <input
              type="text"
              name="name"
              required
              maxLength={120}
              defaultValue={facility.data.name}
              onChange={() => setStatus("idle")}
              className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-grey">
              Timezone (IANA, e.g. America/New_York)
            </span>
            <input
              type="text"
              name="timezone"
              required
              maxLength={64}
              defaultValue={facility.data.timezone}
              onChange={() => setStatus("idle")}
              className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={update.isPending}
              className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {update.isPending ? "Saving…" : "Save"}
            </button>
            {status === "saved" && (
              <span className="text-sm text-green">Saved.</span>
            )}
            {status === "error" && errorMessage && (
              <span className="text-sm text-red">{errorMessage}</span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
