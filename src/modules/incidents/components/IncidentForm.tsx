"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import { db } from "@/lib/offline/db";
import { nudgeSync } from "@/lib/offline/sync-engine";
import {
  IncidentSubmissionInput,
  type AccidentInput,
  type BodyMarker,
  type IncidentInput,
} from "@/modules/incidents/schema";

import { BodyDiagram } from "@/modules/incidents/components/BodyDiagram";
import { WeatherSummary } from "@/modules/incidents/components/WeatherSummary";

/**
 * The Incident / Accident form. Per CLAUDE.md Rule 3:
 *
 *   1. Validate locally
 *   2. await db.queue.add(...)
 *   3. Show success immediately
 *   4. nudgeSync() in the background
 *   5. Invalidate the recent-incidents query
 *
 * The two kinds share a common header. The accident-only fields
 * (injured person, body markers, first aid, EMS, hospital) only
 * render when `kind === 'accident'`. The form is keyed by tab in
 * the parent so switching tabs gets a fresh state.
 */

interface IncidentFormProps {
  kind: "incident" | "accident";
  locations: readonly string[];
  incidentTypes: readonly string[];
  injuredTypes: readonly string[];
  bodyRegions: readonly string[];
}

function nowLocalDatetime(): string {
  // datetime-local input expects "YYYY-MM-DDTHH:mm" without timezone
  // suffix. Build that from the local clock.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function IncidentForm({
  kind,
  locations,
  incidentTypes,
  injuredTypes,
  bodyRegions,
}: IncidentFormProps) {
  const utils = trpc.useUtils();

  // Common fields
  const [occurredAt, setOccurredAt] = useState<string>(nowLocalDatetime());
  const [reportedBy, setReportedBy] = useState("");
  const [location, setLocation] = useState(locations[0] ?? "");
  const [incidentType, setIncidentType] = useState(incidentTypes[0] ?? "");
  const [personsInvolved, setPersonsInvolved] = useState("");
  const [witnesses, setWitnesses] = useState("");
  const [description, setDescription] = useState("");
  const [immediateAction, setImmediateAction] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState("");

  // Accident-only fields
  const [injuredName, setInjuredName] = useState("");
  const [injuredType, setInjuredType] = useState(injuredTypes[0] ?? "");
  const [injuredAge, setInjuredAge] = useState<string>("");
  const [natureOfInjury, setNatureOfInjury] = useState("");
  const [bodyMarkers, setBodyMarkers] = useState<BodyMarker[]>([]);
  const [firstAidAdministered, setFirstAidAdministered] = useState(false);
  const [firstAidDetails, setFirstAidDetails] = useState("");
  const [emsCalled, setEmsCalled] = useState(false);
  const [emsDetails, setEmsDetails] = useState("");
  const [transportedToHospital, setTransportedToHospital] = useState(false);
  const [hospitalName, setHospitalName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function resetForm() {
    setOccurredAt(nowLocalDatetime());
    setReportedBy("");
    setLocation(locations[0] ?? "");
    setIncidentType(incidentTypes[0] ?? "");
    setPersonsInvolved("");
    setWitnesses("");
    setDescription("");
    setImmediateAction("");
    setFollowUpRequired(false);
    setFollowUpNotes("");
    setInjuredName("");
    setInjuredType(injuredTypes[0] ?? "");
    setInjuredAge("");
    setNatureOfInjury("");
    setBodyMarkers([]);
    setFirstAidAdministered(false);
    setFirstAidDetails("");
    setEmsCalled(false);
    setEmsDetails("");
    setTransportedToHospital(false);
    setHospitalName("");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPending(true);

    // Convert datetime-local string ("2026-04-07T10:30") to ISO with
    // the user's current timezone offset baked in.
    const occurredIso = (() => {
      if (!occurredAt) return new Date().toISOString();
      const d = new Date(occurredAt);
      if (Number.isNaN(d.getTime())) return new Date().toISOString();
      return d.toISOString();
    })();

    let report: IncidentInput | AccidentInput;
    if (kind === "incident") {
      report = {
        kind: "incident",
        occurred_at: occurredIso,
        reported_by: reportedBy.trim(),
        location,
        incident_type: incidentType,
        persons_involved:
          personsInvolved.trim() === "" ? undefined : personsInvolved.trim(),
        witnesses: witnesses.trim() === "" ? undefined : witnesses.trim(),
        description: description.trim(),
        immediate_action:
          immediateAction.trim() === "" ? undefined : immediateAction.trim(),
        follow_up_required: followUpRequired,
        follow_up_notes:
          followUpRequired && followUpNotes.trim() !== ""
            ? followUpNotes.trim()
            : undefined,
      };
    } else {
      const ageNum = injuredAge.trim() === "" ? null : Number(injuredAge);
      if (ageNum !== null && (!Number.isFinite(ageNum) || ageNum < 0)) {
        setError("Age must be a non-negative number");
        setPending(false);
        return;
      }
      report = {
        kind: "accident",
        occurred_at: occurredIso,
        reported_by: reportedBy.trim(),
        location,
        incident_type: incidentType,
        persons_involved:
          personsInvolved.trim() === "" ? undefined : personsInvolved.trim(),
        witnesses: witnesses.trim() === "" ? undefined : witnesses.trim(),
        description: description.trim(),
        immediate_action:
          immediateAction.trim() === "" ? undefined : immediateAction.trim(),
        follow_up_required: followUpRequired,
        follow_up_notes:
          followUpRequired && followUpNotes.trim() !== ""
            ? followUpNotes.trim()
            : undefined,
        injured_name: injuredName.trim(),
        injured_type: injuredType,
        injured_age: ageNum === null ? null : Math.floor(ageNum),
        nature_of_injury: natureOfInjury.trim(),
        body_markers: bodyMarkers,
        first_aid_administered: firstAidAdministered,
        first_aid_details:
          firstAidAdministered && firstAidDetails.trim() !== ""
            ? firstAidDetails.trim()
            : undefined,
        ems_called: emsCalled,
        ems_details:
          emsCalled && emsDetails.trim() !== "" ? emsDetails.trim() : undefined,
        transported_to_hospital: transportedToHospital,
        hospital_name:
          transportedToHospital && hospitalName.trim() !== ""
            ? hospitalName.trim()
            : undefined,
      };
    }

    const payload = {
      local_id: crypto.randomUUID(),
      report,
    };

    const parsed = IncidentSubmissionInput.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid submission");
      setPending(false);
      return;
    }

    try {
      await db.queue.add({
        localId: parsed.data.local_id,
        table: "incidents",
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
    void utils.incidents.listRecent.invalidate();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-grey/30 bg-darkbg/40 p-6"
    >
      <h2 className="text-xl font-semibold text-white">
        {kind === "incident" ? "Incident report" : "Accident report"}
      </h2>

      <WeatherSummary />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date & time *">
          <input
            type="datetime-local"
            required
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
        </Field>
        <Field label="Reported by *">
          <input
            type="text"
            required
            maxLength={120}
            value={reportedBy}
            onChange={(e) => setReportedBy(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
        </Field>
        <Field label="Location *">
          <select
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          >
            {locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Incident type *">
          <select
            required
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          >
            {incidentTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Persons involved">
        <input
          type="text"
          maxLength={2000}
          value={personsInvolved}
          onChange={(e) => setPersonsInvolved(e.target.value)}
          className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
        />
      </Field>

      <Field label="Witnesses">
        <input
          type="text"
          maxLength={2000}
          value={witnesses}
          onChange={(e) => setWitnesses(e.target.value)}
          className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
        />
      </Field>

      <Field label="Description *">
        <textarea
          rows={4}
          required
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
        />
      </Field>

      <Field label="Immediate action taken">
        <textarea
          rows={3}
          maxLength={5000}
          value={immediateAction}
          onChange={(e) => setImmediateAction(e.target.value)}
          className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-grey">
        <input
          type="checkbox"
          checked={followUpRequired}
          onChange={(e) => setFollowUpRequired(e.target.checked)}
          className="h-4 w-4"
        />
        Follow-up required
      </label>

      {followUpRequired && (
        <Field label="Follow-up notes">
          <textarea
            rows={3}
            maxLength={5000}
            value={followUpNotes}
            onChange={(e) => setFollowUpNotes(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
        </Field>
      )}

      {/* Accident-only block */}
      {kind === "accident" && (
        <section className="mt-2 flex flex-col gap-4 rounded border border-grey/20 bg-darkbg/60 p-4">
          <h3 className="text-base font-semibold text-white">Injury details</h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Injured person name *">
              <input
                type="text"
                required
                maxLength={200}
                value={injuredName}
                onChange={(e) => setInjuredName(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              />
            </Field>
            <Field label="Injured person type *">
              <select
                required
                value={injuredType}
                onChange={(e) => setInjuredType(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              >
                {injuredTypes.length === 0 ? (
                  <option value="" disabled>
                    Ask your admin to configure injured-person types
                  </option>
                ) : (
                  injuredTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))
                )}
              </select>
            </Field>
            <Field label="Age">
              <input
                type="number"
                min={0}
                max={120}
                inputMode="numeric"
                value={injuredAge}
                onChange={(e) => setInjuredAge(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              />
            </Field>
          </div>

          <Field label="Nature of injury *">
            <textarea
              rows={3}
              required
              maxLength={5000}
              value={natureOfInjury}
              onChange={(e) => setNatureOfInjury(e.target.value)}
              className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
            />
          </Field>

          <div className="flex flex-col gap-2">
            <span className="text-sm text-grey">Affected body regions</span>
            <BodyDiagram
              markers={bodyMarkers}
              regionLabels={bodyRegions}
              onAdd={(m) => setBodyMarkers((prev) => [...prev, m])}
              onRemove={(i) =>
                setBodyMarkers((prev) => prev.filter((_, idx) => idx !== i))
              }
            />
            {bodyMarkers.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2 text-xs text-grey">
                {bodyMarkers.map((m, i) => (
                  <li
                    key={i}
                    className="rounded border border-grey/40 px-2 py-0.5"
                  >
                    #{i + 1} {m.view} · {m.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-grey">
            <input
              type="checkbox"
              checked={firstAidAdministered}
              onChange={(e) => setFirstAidAdministered(e.target.checked)}
              className="h-4 w-4"
            />
            First aid administered
          </label>
          {firstAidAdministered && (
            <Field label="First aid details">
              <input
                type="text"
                maxLength={2000}
                value={firstAidDetails}
                onChange={(e) => setFirstAidDetails(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              />
            </Field>
          )}

          <label className="flex items-center gap-2 text-sm text-grey">
            <input
              type="checkbox"
              checked={emsCalled}
              onChange={(e) => setEmsCalled(e.target.checked)}
              className="h-4 w-4"
            />
            EMS called
          </label>
          {emsCalled && (
            <Field label="EMS details (agency, arrival time)">
              <input
                type="text"
                maxLength={2000}
                value={emsDetails}
                onChange={(e) => setEmsDetails(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              />
            </Field>
          )}

          <label className="flex items-center gap-2 text-sm text-grey">
            <input
              type="checkbox"
              checked={transportedToHospital}
              onChange={(e) => setTransportedToHospital(e.target.checked)}
              className="h-4 w-4"
            />
            Transported to hospital
          </label>
          {transportedToHospital && (
            <Field label="Hospital name">
              <input
                type="text"
                maxLength={200}
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
              />
            </Field>
          )}
        </section>
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
          {pending ? "Saving…" : "Submit"}
        </button>
      </div>
    </form>
  );
}

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
