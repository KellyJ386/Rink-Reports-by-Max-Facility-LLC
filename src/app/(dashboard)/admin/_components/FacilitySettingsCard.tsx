"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";

/**
 * Facility Profile — section 1 of the Admin Control Center.
 *
 * Captures the full facility identity in a single form: display
 * name, address, contact info, timezone, and the facility-wide
 * unit preferences (°F vs °C, inches vs millimeters). The postal
 * code is the input that powers the weather lookup on every
 * generated PDF's Universal Module Header.
 *
 * The form key is derived from the loaded row so it remounts (and
 * resets every uncontrolled input) whenever the underlying record
 * changes — e.g. after a successful save invalidates the query.
 */
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
    const str = (key: string) => String(data.get(key) ?? "").trim();
    const opt = (key: string) => {
      const v = str(key);
      return v === "" ? null : v;
    };
    update.mutate({
      name:           str("name"),
      timezone:       str("timezone"),
      address_line1:  opt("address_line1"),
      address_line2:  opt("address_line2"),
      city:           opt("city"),
      state:          opt("state"),
      postal_code:    opt("postal_code"),
      country:        str("country") || "us",
      contact_email:  opt("contact_email"),
      contact_phone:  opt("contact_phone"),
      temp_unit:      str("temp_unit") === "c" ? "c" : "f",
      length_unit:    str("length_unit") === "mm" ? "mm" : "in",
    });
  }

  return (
    <section className="rounded-lg border border-grey/30 bg-darkbg/40 p-6">
      <h2 className="text-xl font-semibold text-white">Facility profile</h2>
      <p className="mt-1 text-sm text-grey">
        Identity, contact info, and facility-wide unit preferences. The
        postal code drives outdoor temperature lookup on every PDF
        report header.
      </p>

      {facility.isLoading && <p className="mt-4 text-sm text-grey">Loading…</p>}
      {facility.error && (
        <p className="mt-4 text-sm text-red">{facility.error.message}</p>
      )}

      {facility.data && (
        <form
          onSubmit={onSubmit}
          key={facility.data.updated_at ?? facility.data.id}
          className="mt-4 flex flex-col gap-4"
        >
          {/* ---- Identity --------------------------------------- */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Facility name *">
              <input
                type="text"
                name="name"
                required
                maxLength={200}
                defaultValue={facility.data.name}
                onChange={() => setStatus("idle")}
                className={inputClass}
              />
            </Field>
            <Field label="Timezone (IANA)">
              <input
                type="text"
                name="timezone"
                required
                maxLength={64}
                defaultValue={facility.data.timezone}
                onChange={() => setStatus("idle")}
                className={inputClass}
              />
            </Field>
          </div>

          {/* ---- Address ---------------------------------------- */}
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="col-span-2 text-xs uppercase tracking-wide text-grey">
              Address
            </legend>
            <Field label="Address line 1">
              <input
                type="text"
                name="address_line1"
                maxLength={200}
                defaultValue={facility.data.address_line1 ?? ""}
                onChange={() => setStatus("idle")}
                className={inputClass}
              />
            </Field>
            <Field label="Address line 2">
              <input
                type="text"
                name="address_line2"
                maxLength={200}
                defaultValue={facility.data.address_line2 ?? ""}
                onChange={() => setStatus("idle")}
                className={inputClass}
              />
            </Field>
            <Field label="City">
              <input
                type="text"
                name="city"
                maxLength={120}
                defaultValue={facility.data.city ?? ""}
                onChange={() => setStatus("idle")}
                className={inputClass}
              />
            </Field>
            <Field label="State / region">
              <input
                type="text"
                name="state"
                maxLength={80}
                defaultValue={facility.data.state ?? ""}
                onChange={() => setStatus("idle")}
                className={inputClass}
              />
            </Field>
            <Field label="Postal code (used for weather geocoding)">
              <input
                type="text"
                name="postal_code"
                maxLength={20}
                defaultValue={facility.data.postal_code ?? ""}
                onChange={() => setStatus("idle")}
                className={inputClass}
              />
            </Field>
            <Field label="Country (ISO 2-letter)">
              <input
                type="text"
                name="country"
                maxLength={8}
                defaultValue={facility.data.country ?? "us"}
                onChange={() => setStatus("idle")}
                className={inputClass}
              />
            </Field>
          </fieldset>

          {/* ---- Contact ---------------------------------------- */}
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="col-span-2 text-xs uppercase tracking-wide text-grey">
              Contact info
            </legend>
            <Field label="Contact email">
              <input
                type="email"
                name="contact_email"
                maxLength={200}
                defaultValue={facility.data.contact_email ?? ""}
                onChange={() => setStatus("idle")}
                className={inputClass}
              />
            </Field>
            <Field label="Contact phone">
              <input
                type="tel"
                name="contact_phone"
                maxLength={40}
                defaultValue={facility.data.contact_phone ?? ""}
                onChange={() => setStatus("idle")}
                className={inputClass}
              />
            </Field>
          </fieldset>

          {/* ---- Unit preferences ------------------------------- */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs uppercase tracking-wide text-grey">
              Unit preferences
            </legend>
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-grey">Temperature:</span>
                <label className="flex items-center gap-1 text-white">
                  <input
                    type="radio"
                    name="temp_unit"
                    value="f"
                    defaultChecked={facility.data.temp_unit !== "c"}
                  />
                  °F
                </label>
                <label className="flex items-center gap-1 text-white">
                  <input
                    type="radio"
                    name="temp_unit"
                    value="c"
                    defaultChecked={facility.data.temp_unit === "c"}
                  />
                  °C
                </label>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-grey">Length:</span>
                <label className="flex items-center gap-1 text-white">
                  <input
                    type="radio"
                    name="length_unit"
                    value="in"
                    defaultChecked={facility.data.length_unit !== "mm"}
                  />
                  inches
                </label>
                <label className="flex items-center gap-1 text-white">
                  <input
                    type="radio"
                    name="length_unit"
                    value="mm"
                    defaultChecked={facility.data.length_unit === "mm"}
                  />
                  millimeters
                </label>
              </div>
            </div>
          </fieldset>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={update.isPending}
              className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {update.isPending ? "Saving…" : "Save profile"}
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

const inputClass =
  "rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-grey">{label}</span>
      {children}
    </label>
  );
}
