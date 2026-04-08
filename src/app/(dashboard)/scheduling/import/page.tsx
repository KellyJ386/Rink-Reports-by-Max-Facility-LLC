"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";

type Format = "ics" | "isportsman" | "maxgalaxy" | "active_network";

type StaffMatchRow = {
  shiftIndex: number;
  parsed: string;
  matched: { id: string; name: string; email: string | null } | null;
  confidence: number;
};

type ParsedShiftRow = {
  externalId: string;
  title: string;
  startAt: Date | string;
  endAt: Date | string;
  location: string | null;
  attendees: string[];
};

type ConflictRow = {
  shift: ParsedShiftRow;
  conflictsWith: { id: string; startAt: string; endAt: string };
};

type PreviewResult = {
  shifts: ParsedShiftRow[];
  staffMatches: StaffMatchRow[];
  conflicts: ConflictRow[];
  unmatchedStaff: string[];
};

type Step = 1 | 2 | 3;

export default function SchedulingImportPage() {
  const [step, setStep] = useState<Step>(1);
  const [format, setFormat] = useState<Format>("ics");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [scheduleId, setScheduleId] = useState("");
  // Map of shiftIndex → resolved staffId (from dropdown overrides)
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const previewMutation = trpc.scheduling.previewImport.useMutation({
    onSuccess: (data) => {
      setPreview(data as unknown as PreviewResult);
      setParseError(null);
      setStep(2);
    },
    onError: (err) => {
      setParseError(err.message);
    },
  });

  const commitMutation = trpc.scheduling.commitImport.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setStep(3);
    },
    onError: (err) => {
      setParseError(err.message);
    },
  });

  const roster = trpc.scheduling.listRoster.useQuery();
  const rosterList = roster.data ?? [];

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setContent((ev.target?.result as string) ?? "");
    };
    reader.readAsText(file);
  }

  function handlePreview() {
    if (!content.trim()) return;
    setParseError(null);
    previewMutation.mutate({ content, format });
  }

  function resolvedStaffId(match: StaffMatchRow): string | null {
    if (overrides[match.shiftIndex] !== undefined) {
      return overrides[match.shiftIndex]!;
    }
    if (match.matched && match.confidence >= 0.8) {
      return match.matched.id;
    }
    return null;
  }

  function handleCommit() {
    if (!preview || !scheduleId.trim()) return;
    const shifts = preview.shifts.map((shift, idx) => {
      const matchRow = preview.staffMatches.find((m) => m.shiftIndex === idx);
      const staffId = matchRow ? resolvedStaffId(matchRow) : null;
      return {
        externalId: shift.externalId,
        title: shift.title,
        startAt: new Date(shift.startAt as string | Date).toISOString(),
        endAt: new Date(shift.endAt as string | Date).toISOString(),
        location: shift.location ?? null,
        staffId: staffId ?? null,
        scheduleId,
      };
    });
    setParseError(null);
    commitMutation.mutate({ shifts });
  }

  function confidenceLabel(conf: number): string {
    if (conf >= 1.0) return "Exact";
    if (conf >= 0.9) return "High";
    if (conf >= 0.8) return "Fuzzy";
    return "No match";
  }

  function confidenceColor(conf: number): string {
    if (conf >= 0.9) return "text-green-600";
    if (conf >= 0.8) return "text-yellow-600";
    return "text-red-500";
  }

  const conflictIds = new Set(
    (preview?.conflicts ?? []).map((c) => c.shift.externalId),
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-navy">Import Schedule</h1>
        <p className="text-sm text-grey">
          Import shifts from ICS, iSportsman, Maxgalaxy, or Active Network.
        </p>
      </header>

      {/* Step indicator */}
      <div className="flex gap-4 text-sm font-medium">
        {([1, 2, 3] as Step[]).map((s) => (
          <span
            key={s}
            className={s === step ? "text-navy font-bold" : "text-grey"}
          >
            Step {s}
          </span>
        ))}
      </div>

      {parseError && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {parseError}
        </div>
      )}

      {/* Step 1: format + content */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-navy">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
              className="rounded border border-grey px-3 py-2 text-sm"
            >
              <option value="ics">ICS / iCalendar</option>
              <option value="isportsman">iSportsman (ICS variant)</option>
              <option value="maxgalaxy">Maxgalaxy (CSV)</option>
              <option value="active_network">Active Network (JSON)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-navy">
              Upload file or paste content
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".ics,.csv,.json,.txt"
              onChange={handleFileChange}
              className="text-sm"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              placeholder="Paste file content here…"
              className="mt-2 rounded border border-grey px-3 py-2 font-mono text-xs"
            />
          </div>

          <button
            onClick={handlePreview}
            disabled={!content.trim() || previewMutation.isPending}
            className="self-start rounded bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {previewMutation.isPending ? "Parsing…" : "Preview Import"}
          </button>
        </div>
      )}

      {/* Step 2: review shifts + staff matching */}
      {step === 2 && preview && (
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-sm text-grey">
              Found <strong>{preview.shifts.length}</strong> shift(s).{" "}
              {preview.conflicts.length > 0 && (
                <span className="text-red-500">
                  {preview.conflicts.length} conflict(s) detected.
                </span>
              )}
            </p>
          </div>

          {/* Schedule ID input */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-navy">
              Target Schedule ID (UUID)
            </label>
            <input
              type="text"
              value={scheduleId}
              onChange={(e) => setScheduleId(e.target.value)}
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
              className="rounded border border-grey px-3 py-2 text-sm"
            />
            <p className="text-xs text-grey">
              You must create the schedule first from the Scheduling page.
            </p>
          </div>

          {/* Shifts table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-navy text-white">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Start</th>
                  <th className="px-3 py-2 text-left">End</th>
                  <th className="px-3 py-2 text-left">Location</th>
                  <th className="px-3 py-2 text-left">Staff Match</th>
                  <th className="px-3 py-2 text-left">Confidence</th>
                  <th className="px-3 py-2 text-left">Override</th>
                </tr>
              </thead>
              <tbody>
                {preview.shifts.map((shift, idx) => {
                  const matchRow = preview.staffMatches.find(
                    (m) => m.shiftIndex === idx,
                  );
                  const isConflict = conflictIds.has(shift.externalId);
                  return (
                    <tr
                      key={shift.externalId + String(idx)}
                      className={isConflict ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                    >
                      <td className="px-3 py-2 text-grey">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium">
                        {shift.title}
                        {isConflict && (
                          <span className="ml-1 text-xs text-red-500">(conflict)</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {new Date(shift.startAt as string | Date).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {new Date(shift.endAt as string | Date).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-grey">{shift.location ?? "—"}</td>
                      <td className="px-3 py-2">
                        {matchRow?.matched ? matchRow.matched.name : (
                          <span className="text-grey">Unmatched</span>
                        )}
                      </td>
                      <td className={`px-3 py-2 ${matchRow ? confidenceColor(matchRow.confidence) : "text-grey"}`}>
                        {matchRow ? confidenceLabel(matchRow.confidence) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={overrides[idx] ?? ""}
                          onChange={(e) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [idx]: e.target.value,
                            }))
                          }
                          className="rounded border border-grey px-2 py-1 text-xs"
                        >
                          <option value="">— use auto —</option>
                          <option value="SKIP">Skip this shift</option>
                          {rosterList.map((r) => (
                            <option key={r.user_id} value={r.user_id}>
                              {r.full_name ?? r.user_id}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {preview.unmatchedStaff.length > 0 && (
            <div className="rounded border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm">
              <strong>Unmatched staff identifiers:</strong>{" "}
              {preview.unmatchedStaff.join(", ")}. Use the Override column to
              assign them manually.
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="rounded border border-grey px-4 py-2 text-sm text-navy"
            >
              Back
            </button>
            <button
              onClick={handleCommit}
              disabled={!scheduleId.trim() || commitMutation.isPending}
              className="rounded bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {commitMutation.isPending ? "Importing…" : "Confirm Import"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: success */}
      {step === 3 && result && (
        <div className="flex flex-col gap-4">
          <div className="rounded border border-green-300 bg-green-50 px-6 py-4">
            <p className="text-lg font-semibold text-green-700">
              Import complete
            </p>
            <p className="mt-1 text-sm text-green-600">
              {result.imported} imported, {result.skipped} skipped.
            </p>
          </div>
          <button
            onClick={() => {
              setStep(1);
              setContent("");
              setPreview(null);
              setResult(null);
              setOverrides({});
              setScheduleId("");
              setParseError(null);
            }}
            className="self-start rounded border border-grey px-4 py-2 text-sm text-navy"
          >
            Import another file
          </button>
        </div>
      )}
    </main>
  );
}
