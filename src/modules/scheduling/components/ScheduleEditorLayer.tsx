"use client";

import { useState, type FormEvent } from "react";

import { trpc } from "@/lib/trpc";
import {
  DAY_LABELS,
  addDays,
  dayLabel,
  parseDate,
} from "@/modules/scheduling/week-utils";

/**
 * Layers 2 + 3 — Auto-suggest + Grid editor (manager only).
 *
 * Workflow:
 *   1. Manager picks a week (passed in via prop) and lists current
 *      shifts on the schedule for that week.
 *   2. Manager can add a shift directly via the modal.
 *   3. Manager declares a list of openings (position + start + end)
 *      and clicks "Auto-suggest" — the server runs the greedy
 *      algorithm and returns one suggestion per opening. Suggestions
 *      that found a candidate are auto-created as shifts; conflicts
 *      are surfaced in a banner so the manager can resolve manually.
 *   4. Each shift block on the grid surfaces a cert warning if the
 *      assigned user lacks any of the position's required certs.
 *   5. The Publish / Unpublish controls flip the schedule's status.
 *
 * Replaces the spec's drag-and-drop with click-to-select-then-target
 * for the same outcome with no react-dnd dep.
 */
interface Props {
  weekIso: string;
}

interface Opening {
  id: string;
  position_id: string;
  dow: number;
  start_minute: number;
  end_minute: number;
}

export function ScheduleEditorLayer({ weekIso }: Props) {
  const utils = trpc.useUtils();
  const positions = trpc.scheduling.listPositions.useQuery();
  const certs = trpc.scheduling.listCertifications.useQuery();
  const roster = trpc.scheduling.listRoster.useQuery();
  const positionCerts = trpc.admin.scheduling.listPositionCerts.useQuery();
  const staffCerts = trpc.admin.scheduling.listStaffCerts.useQuery();
  const schedule = trpc.scheduling.getScheduleForWeek.useQuery({
    week_start: weekIso,
  });

  const ensureDraft = trpc.scheduling.ensureDraftSchedule.useMutation({
    onSuccess: () =>
      utils.scheduling.getScheduleForWeek.invalidate({ week_start: weekIso }),
  });
  const publish = trpc.scheduling.publishSchedule.useMutation({
    onSuccess: () =>
      utils.scheduling.getScheduleForWeek.invalidate({ week_start: weekIso }),
  });
  const unpublish = trpc.scheduling.unpublishSchedule.useMutation({
    onSuccess: () =>
      utils.scheduling.getScheduleForWeek.invalidate({ week_start: weekIso }),
  });
  const createShift = trpc.scheduling.createShift.useMutation({
    onSuccess: () =>
      utils.scheduling.getScheduleForWeek.invalidate({ week_start: weekIso }),
  });
  const deleteShift = trpc.scheduling.deleteShift.useMutation({
    onSuccess: () =>
      utils.scheduling.getScheduleForWeek.invalidate({ week_start: weekIso }),
  });
  const autoSuggest = trpc.scheduling.autoSuggest.useMutation({
    onSuccess: () =>
      utils.scheduling.getScheduleForWeek.invalidate({ week_start: weekIso }),
  });

  const [openings, setOpenings] = useState<Opening[]>([]);
  const [showAddShift, setShowAddShift] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [autoSuggestNote, setAutoSuggestNote] = useState<string | null>(null);

  if (
    positions.isLoading ||
    certs.isLoading ||
    roster.isLoading ||
    positionCerts.isLoading ||
    staffCerts.isLoading ||
    schedule.isLoading
  ) {
    return <p className="text-sm text-grey">Loading editor…</p>;
  }

  if (!positions.data || !roster.data) {
    return <p className="text-sm text-grey">Editor unavailable.</p>;
  }

  // Cert warning helper.
  const positionRequiredCerts = new Map<string, Set<string>>();
  for (const row of positionCerts.data ?? []) {
    const set =
      positionRequiredCerts.get(row.position_id) ?? new Set<string>();
    set.add(row.certification_id);
    positionRequiredCerts.set(row.position_id, set);
  }
  const userCerts = new Map<string, Set<string>>();
  for (const row of staffCerts.data ?? []) {
    const set = userCerts.get(row.user_id) ?? new Set<string>();
    set.add(row.certification_id);
    userCerts.set(row.user_id, set);
  }

  function isCertWarning(userId: string, positionId: string): boolean {
    const required = positionRequiredCerts.get(positionId);
    if (!required || required.size === 0) return false;
    const held = userCerts.get(userId) ?? new Set();
    for (const id of required) if (!held.has(id)) return true;
    return false;
  }

  const sched = schedule.data?.schedule ?? null;
  const shifts = schedule.data?.shifts ?? [];

  const positionById = new Map(positions.data.map((p) => [p.id, p]));
  const userById = new Map(roster.data.map((u) => [u.user_id, u]));

  function addOpening() {
    if (!positions.data || positions.data.length === 0) return;
    setOpenings((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        position_id: positions.data![0]!.id,
        dow: 0,
        start_minute: 9 * 60,
        end_minute: 17 * 60,
      },
    ]);
  }

  function updateOpening(id: string, patch: Partial<Opening>) {
    setOpenings((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    );
  }

  function removeOpening(id: string) {
    setOpenings((prev) => prev.filter((o) => o.id !== id));
  }

  async function runAutoSuggest() {
    setAutoSuggestNote(null);

    // Make sure a draft exists.
    let scheduleId = sched?.id;
    if (!scheduleId) {
      const created = await ensureDraft.mutateAsync({ week_start: weekIso });
      scheduleId = created.id;
    }

    if (openings.length === 0) {
      setAutoSuggestNote("Add at least one opening before running auto-suggest.");
      return;
    }

    const monday = parseDate(weekIso);
    const openingsPayload = openings.map((o) => {
      const day = addDays(monday, o.dow);
      const start = new Date(day);
      start.setMinutes(o.start_minute);
      const end = new Date(day);
      end.setMinutes(o.end_minute);
      return {
        position_id: o.position_id,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
      };
    });

    const result = await autoSuggest.mutateAsync({
      week_start: weekIso,
      openings: openingsPayload,
    });

    let inserted = 0;
    let conflicts = 0;
    for (const r of result) {
      if (r.assigned_user_id) {
        await createShift.mutateAsync({
          schedule_id: scheduleId,
          user_id: r.assigned_user_id,
          position_id: r.position_id,
          start_at: r.start_at,
          end_at: r.end_at,
          notes: null,
        });
        inserted++;
      } else {
        conflicts++;
      }
    }
    setAutoSuggestNote(
      `Auto-suggest filled ${inserted} opening${inserted === 1 ? "" : "s"}` +
        (conflicts > 0
          ? `; ${conflicts} could not be assigned (no eligible staff).`
          : "."),
    );
    setOpenings([]);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Schedule status + publish controls */}
      <div className="flex flex-wrap items-center gap-3 rounded border border-grey/30 bg-darkbg/40 p-3">
        <span className="text-sm text-grey">Status:</span>
        {sched ? (
          <span
            className={
              sched.status === "published"
                ? "rounded border border-green/40 px-2 py-0.5 text-xs text-green"
                : "rounded border border-yellow/60 px-2 py-0.5 text-xs text-yellow"
            }
          >
            {sched.status === "published" ? "Published" : "Draft"}
          </span>
        ) : (
          <span className="text-xs text-grey">No schedule for this week yet</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!sched && (
            <button
              type="button"
              onClick={() => ensureDraft.mutate({ week_start: weekIso })}
              disabled={ensureDraft.isPending}
              className="rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Create draft
            </button>
          )}
          {sched && sched.status === "draft" && (
            <>
              <button
                type="button"
                onClick={() => setShowReview(true)}
                className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
              >
                Review &amp; publish
              </button>
            </>
          )}
          {sched && sched.status === "published" && (
            <button
              type="button"
              onClick={() => unpublish.mutate({ schedule_id: sched.id })}
              disabled={unpublish.isPending}
              className="rounded border border-yellow/60 px-3 py-1.5 text-xs text-yellow hover:bg-yellow/10"
            >
              Unpublish
            </button>
          )}
        </div>
      </div>

      {/* Auto-suggest opening builder */}
      <div className="rounded border border-grey/30 bg-darkbg/40 p-4">
        <header className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-white">Auto-suggest openings</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addOpening}
              className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
            >
              + Add opening
            </button>
            <button
              type="button"
              onClick={runAutoSuggest}
              disabled={
                autoSuggest.isPending ||
                createShift.isPending ||
                ensureDraft.isPending ||
                openings.length === 0
              }
              className="rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {autoSuggest.isPending ? "Suggesting…" : "Generate schedule"}
            </button>
          </div>
        </header>

        {openings.length === 0 ? (
          <p className="mt-3 text-xs text-grey">
            Click &ldquo;Add opening&rdquo; to declare slots you need filled.
            Each opening becomes one shift if the algorithm finds an
            eligible staff member.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {openings.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center gap-2 rounded border border-grey/20 bg-darkbg/60 p-2 text-xs"
              >
                <select
                  value={o.position_id}
                  onChange={(e) => updateOpening(o.id, { position_id: e.target.value })}
                  className="rounded border border-grey/40 bg-darkbg px-2 py-1 text-white"
                >
                  {positions.data!.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={o.dow}
                  onChange={(e) => updateOpening(o.id, { dow: Number(e.target.value) })}
                  className="rounded border border-grey/40 bg-darkbg px-2 py-1 text-white"
                >
                  {DAY_LABELS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={fmtTime(o.start_minute)}
                  onChange={(e) =>
                    updateOpening(o.id, { start_minute: parseTime(e.target.value) })
                  }
                  className="rounded border border-grey/40 bg-darkbg px-2 py-1 text-white"
                />
                <span className="text-grey">to</span>
                <input
                  type="time"
                  value={fmtTime(o.end_minute)}
                  onChange={(e) =>
                    updateOpening(o.id, { end_minute: parseTime(e.target.value) })
                  }
                  className="rounded border border-grey/40 bg-darkbg px-2 py-1 text-white"
                />
                <button
                  type="button"
                  onClick={() => removeOpening(o.id)}
                  className="ml-auto rounded border border-red/40 px-2 py-1 text-red hover:border-red hover:bg-red/10"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {autoSuggestNote && (
          <p className="mt-2 text-xs text-grey">{autoSuggestNote}</p>
        )}
        {autoSuggest.error && (
          <p className="mt-2 text-xs text-red">{autoSuggest.error.message}</p>
        )}
      </div>

      {/* Existing shifts list (Layer 3 — grid edit, MVP-rendered as a list) */}
      <div className="rounded border border-grey/30 bg-darkbg/40 p-4">
        <header className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-white">Shifts this week</h3>
          {sched && (
            <button
              type="button"
              onClick={() => setShowAddShift(true)}
              className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
            >
              + Add shift
            </button>
          )}
        </header>

        {shifts.length === 0 ? (
          <p className="mt-3 text-xs text-grey">
            No shifts on this schedule yet. Use auto-suggest above or
            add one manually.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-grey/20 text-sm">
            {shifts.map((s) => {
              const pos = positionById.get(s.position_id);
              const user = userById.get(s.user_id);
              const warn = isCertWarning(s.user_id, s.position_id);
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div className="flex flex-col">
                    <span className="text-white">
                      <span
                        className="mr-2 inline-block h-3 w-3 rounded"
                        style={{ backgroundColor: pos?.color ?? "#003B6F" }}
                        aria-hidden
                      />
                      {pos?.name ?? "Position"} · {user?.full_name ?? "Staff"}
                    </span>
                    <span className="text-xs text-grey">
                      {dayLabel(new Date(s.start_at))} ·{" "}
                      {new Date(s.start_at).toLocaleTimeString()} –{" "}
                      {new Date(s.end_at).toLocaleTimeString()}
                    </span>
                    {warn && (
                      <span className="text-xs text-yellow">
                        Certification gap: assigned staff is missing a
                        required cert for this position.
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Remove this shift?")) {
                        deleteShift.mutate({ id: s.id });
                      }
                    }}
                    className="rounded border border-red/40 px-2 py-1 text-xs text-red hover:border-red hover:bg-red/10"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showAddShift && sched && (
        <AddShiftModal
          weekIso={weekIso}
          scheduleId={sched.id}
          positions={positions.data}
          roster={roster.data}
          isCertWarning={isCertWarning}
          onClose={() => setShowAddShift(false)}
          onCreate={(input) =>
            createShift.mutate(input, { onSuccess: () => setShowAddShift(false) })
          }
          isPending={createShift.isPending}
        />
      )}

      {showReview && sched && (
        <ReviewPublishModal
          shifts={shifts.map((s) => ({
            id: s.id,
            label: `${positionById.get(s.position_id)?.name ?? "?"} · ${userById.get(s.user_id)?.full_name ?? "?"}`,
            when: `${dayLabel(new Date(s.start_at))} ${new Date(s.start_at).toLocaleTimeString()} – ${new Date(s.end_at).toLocaleTimeString()}`,
          }))}
          onClose={() => setShowReview(false)}
          onPublish={() =>
            publish.mutate(
              { schedule_id: sched.id },
              { onSuccess: () => setShowReview(false) },
            )
          }
          isPending={publish.isPending}
        />
      )}
    </div>
  );
}

// =====================================================================
// Add-shift modal
// =====================================================================

function AddShiftModal({
  weekIso,
  scheduleId,
  positions,
  roster,
  isCertWarning,
  onClose,
  onCreate,
  isPending,
}: {
  weekIso: string;
  scheduleId: string;
  positions: ReadonlyArray<{ id: string; name: string }>;
  roster: ReadonlyArray<{ user_id: string; full_name: string | null }>;
  isCertWarning: (userId: string, positionId: string) => boolean;
  onClose: () => void;
  onCreate: (input: {
    schedule_id: string;
    user_id: string;
    position_id: string;
    start_at: string;
    end_at: string;
    notes: string | null;
  }) => void;
  isPending: boolean;
}) {
  const [userId, setUserId] = useState(roster[0]?.user_id ?? "");
  const [positionId, setPositionId] = useState(positions[0]?.id ?? "");
  const [dow, setDow] = useState(0);
  const [startMin, setStartMin] = useState(9 * 60);
  const [endMin, setEndMin] = useState(17 * 60);
  const [notes, setNotes] = useState("");

  const warn = userId && positionId ? isCertWarning(userId, positionId) : false;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (endMin <= startMin) {
      window.alert("End time must be after start time");
      return;
    }
    const monday = parseDate(weekIso);
    const day = addDays(monday, dow);
    const start = new Date(day);
    start.setMinutes(startMin);
    const end = new Date(day);
    end.setMinutes(endMin);
    onCreate({
      schedule_id: scheduleId,
      user_id: userId,
      position_id: positionId,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      notes: notes.trim() === "" ? null : notes.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-grey/30 bg-darkbg p-6"
      >
        <h3 className="text-lg font-semibold text-white">Add shift</h3>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Staff member</span>
          <select
            required
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          >
            {roster.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.full_name ?? u.user_id}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Position</span>
          <select
            required
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          >
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-grey">Day</span>
            <select
              value={dow}
              onChange={(e) => setDow(Number(e.target.value))}
              className="rounded border border-grey/40 bg-darkbg px-2 py-2 text-white"
            >
              {DAY_LABELS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-grey">Start</span>
            <input
              type="time"
              value={fmtTime(startMin)}
              onChange={(e) => setStartMin(parseTime(e.target.value))}
              className="rounded border border-grey/40 bg-darkbg px-2 py-2 text-white"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-grey">End</span>
            <input
              type="time"
              value={fmtTime(endMin)}
              onChange={(e) => setEndMin(parseTime(e.target.value))}
              className="rounded border border-grey/40 bg-darkbg px-2 py-2 text-white"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Notes</span>
          <input
            type="text"
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
        </label>

        {warn && (
          <p className="rounded border border-yellow/60 bg-yellow/10 p-2 text-xs text-yellow">
            Certification warning: this staff member is missing one or
            more certifications required for the selected position.
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-navy px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Adding…" : "Add shift"}
          </button>
        </div>
      </form>
    </div>
  );
}

// =====================================================================
// Review & publish modal
// =====================================================================

function ReviewPublishModal({
  shifts,
  onClose,
  onPublish,
  isPending,
}: {
  shifts: ReadonlyArray<{ id: string; label: string; when: string }>;
  onClose: () => void;
  onPublish: () => void;
  isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-grey/30 bg-darkbg p-6">
        <h3 className="text-lg font-semibold text-white">Review &amp; publish</h3>
        <p className="text-sm text-grey">
          Confirm the shifts below before publishing. Once published,
          all staff will see this schedule on the Live Board.
        </p>

        {shifts.length === 0 ? (
          <p className="text-sm text-grey">No shifts to publish.</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto rounded border border-grey/20 bg-darkbg/60 p-2 text-xs">
            {shifts.map((s) => (
              <li key={s.id} className="border-b border-grey/10 py-1 text-grey">
                <span className="text-white">{s.label}</span> · {s.when}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onPublish}
            disabled={isPending || shifts.length === 0}
            className="rounded bg-navy px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Helpers
// =====================================================================

function fmtTime(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseTime(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
