"use client";

import { useEffect, useRef, useState } from "react";

import { trpc } from "@/lib/trpc";
import { db } from "@/lib/offline/db";
import { nudgeSync } from "@/lib/offline/sync-engine";
import { CaliperAdapter, type CaliperReading } from "@/modules/ice-depth/caliper";
import {
  RinkSurface,
  RINK_VIEWBOX_H,
  RINK_VIEWBOX_W,
} from "@/modules/ice-depth/components/RinkSurface";
import { HeatMap } from "@/modules/ice-depth/components/HeatMap";
import {
  IceDepthSessionInput,
  RESURFACING_LABELS,
  type Measurements,
  type ResurfacingStatus,
  type Template,
} from "@/modules/ice-depth/schema";

/**
 * One Ice Depth measurement session.
 *
 * State machine for each numbered point:
 *   unmeasured → active → recorded → (tap again) → active
 *
 * The form persists a stable local_id for the whole session, so
 * "Save draft" and "Complete & Export" both upsert into the same
 * server row via the /api/sync handler. The first save is an
 * INSERT; subsequent saves UPDATE the existing row. Once the row
 * is flipped to status='completed', the freeze trigger refuses any
 * further updates.
 *
 * Bluetooth caliper integration: when connected, every notification
 * frame is treated as the value for the currently active point. If
 * no point is active, the reading is dropped (the operator must tap
 * a point first to declare intent).
 */

interface IceDepthSessionProps {
  template: Template;
}

export function IceDepthSession({ template }: IceDepthSessionProps) {
  const utils = trpc.useUtils();

  // Stable local_id for the lifetime of this session. Persisted in
  // a ref so re-renders don't generate a new one.
  const localIdRef = useRef<string>(crypto.randomUUID());

  // Measurements: { "1": 1.25, "3": 1.0, ... }
  const [measurements, setMeasurements] = useState<Measurements>({});
  const [activePoint, setActivePoint] = useState<number | null>(null);
  const [activeInput, setActiveInput] = useState<string>("");
  const [resurfacing, setResurfacing] = useState<ResurfacingStatus | null>(null);
  const [notes, setNotes] = useState("");
  const [showHeatMap, setShowHeatMap] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Caliper adapter — instance lives for the lifetime of the session.
  const caliperRef = useRef<CaliperAdapter | null>(null);
  if (caliperRef.current === null) caliperRef.current = new CaliperAdapter();
  const [caliperConnected, setCaliperConnected] = useState(false);
  const [caliperError, setCaliperError] = useState<string | null>(null);
  const [caliperBusy, setCaliperBusy] = useState(false);
  const [caliperDeviceLabel, setCaliperDeviceLabel] = useState<string | null>(
    null,
  );

  // Subscribe to caliper readings — needs to see the latest activePoint
  // value, so we use a ref to capture it.
  const activePointRef = useRef(activePoint);
  useEffect(() => {
    activePointRef.current = activePoint;
  }, [activePoint]);

  useEffect(() => {
    const adapter = caliperRef.current;
    if (!adapter) return;
    const unsubReading = adapter.onReading((reading: CaliperReading) => {
      const n = activePointRef.current;
      if (n === null) {
        // No active point — drop the frame and tell the operator
        // they need to tap a point first.
        setStatusMessage(
          `Caliper sent ${reading.value}${reading.unit ?? ""} but no point is active.`,
        );
        return;
      }
      // Persist the reading to the active point's measurement and
      // advance to the next unmeasured point if there is one.
      setMeasurements((prev) => ({ ...prev, [String(n)]: reading.value }));
      const next = nextUnmeasured(template, { ...measurements, [String(n)]: reading.value }, n);
      setActivePoint(next);
      setActiveInput("");
      setStatusMessage(`Recorded point ${n}: ${reading.value}${template.unit}`);
    });
    const unsubConn = adapter.onConnectionChange((connected) => {
      setCaliperConnected(connected);
      setCaliperDeviceLabel(connected ? adapter.deviceName : null);
      if (!connected) setCaliperError(null);
    });
    return () => {
      unsubReading();
      unsubConn();
    };
    // We intentionally only set up the subscription once per template
    // mount; the activePoint ref keeps the listener current without
    // forcing re-subscription on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  // Disconnect on unmount.
  useEffect(() => {
    const adapter = caliperRef.current;
    return () => adapter?.disconnect();
  }, []);

  function onPointClick(n: number) {
    if (completed) return;
    if (activePoint === n) {
      // Tapping the active point again deactivates it.
      setActivePoint(null);
      setActiveInput("");
      return;
    }
    setActivePoint(n);
    const existing = measurements[String(n)];
    setActiveInput(existing !== undefined ? String(existing) : "");
    setStatusMessage(null);
  }

  function commitActiveInput() {
    if (activePoint === null) return;
    const trimmed = activeInput.trim();
    if (trimmed === "") {
      // Empty input clears the measurement.
      setMeasurements((prev) => {
        const next = { ...prev };
        delete next[String(activePoint)];
        return next;
      });
      return;
    }
    const v = Number(trimmed);
    if (!Number.isFinite(v) || v <= 0) {
      setError("Measurement must be a positive number");
      return;
    }
    setError(null);
    setMeasurements((prev) => ({ ...prev, [String(activePoint)]: v }));
    const next = nextUnmeasured(
      template,
      { ...measurements, [String(activePoint)]: v },
      activePoint,
    );
    setActivePoint(next);
    setActiveInput("");
  }

  async function onConnectCaliper() {
    if (!CaliperAdapter.isSupported()) {
      setCaliperError(
        "Web Bluetooth is not available in this browser. Use Chrome, Edge, or Opera over HTTPS.",
      );
      return;
    }
    const adapter = caliperRef.current;
    if (!adapter) return;
    setCaliperError(null);
    setCaliperBusy(true);
    try {
      if (adapter.isConnected) {
        adapter.disconnect();
      } else {
        await adapter.connect();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Caliper failed";
      setCaliperError(message);
    } finally {
      setCaliperBusy(false);
    }
  }

  async function persistSession(status: "draft" | "completed") {
    setError(null);
    setStatusMessage(null);
    setPending(true);

    const payload = {
      local_id: localIdRef.current,
      template_id: template.id,
      submitted_at: new Date().toISOString(),
      status,
      resurfacing_status: resurfacing,
      notes: notes.trim() === "" ? null : notes.trim(),
      measurements,
    };

    const parsed = IceDepthSessionInput.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid session");
      setPending(false);
      return false;
    }

    try {
      // Upsert into the queue: if there's already a pending row for
      // this localId (an earlier draft save that hasn't synced yet),
      // overwrite it so the queue doesn't accumulate stale snapshots.
      const existing = await db.queue.get(parsed.data.local_id);
      const record = {
        localId: parsed.data.local_id,
        table: "ice_depth_sessions",
        payload: parsed.data,
        syncedAt: 0,
        serverId: existing?.serverId ?? null,
        retryCount: 0,
      };
      if (existing) {
        await db.queue.put(record);
      } else {
        await db.queue.add(record);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save locally";
      setError(message);
      setPending(false);
      return false;
    }

    setPending(false);
    nudgeSync();
    void utils.iceDepth.listRecent.invalidate();
    return true;
  }

  async function onSaveDraft() {
    const ok = await persistSession("draft");
    if (ok) setStatusMessage("Draft saved locally — syncing in the background.");
  }

  async function onComplete() {
    const totalMeasured = Object.keys(measurements).length;
    if (totalMeasured === 0) {
      setError("Cannot complete a session with no measurements");
      return;
    }
    if (
      !window.confirm(
        `Complete this session with ${totalMeasured} of ${template.points.length} points measured? Once complete it cannot be edited.`,
      )
    ) {
      return;
    }
    const ok = await persistSession("completed");
    if (ok) {
      setCompleted(true);
      setStatusMessage(
        "Session completed and queued for sync. Use the print button below to export a PDF.",
      );
    }
  }

  function onPrint() {
    window.print();
  }

  const measuredCount = Object.keys(measurements).length;
  const totalPoints = template.points.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Caliper bar */}
      <div className="flex flex-wrap items-center gap-3 rounded border border-grey/30 bg-darkbg/40 p-3 text-sm print:hidden">
        <button
          type="button"
          onClick={onConnectCaliper}
          disabled={caliperBusy}
          className="rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {caliperBusy
            ? "Working…"
            : caliperConnected
              ? "Disconnect caliper"
              : "Connect caliper"}
        </button>
        {caliperConnected ? (
          <span className="text-green">
            Connected to {caliperDeviceLabel ?? "caliper"}
            {caliperRef.current?.profileName
              ? ` · ${caliperRef.current.profileName}`
              : ""}
          </span>
        ) : (
          <span className="text-grey">
            {CaliperAdapter.isSupported()
              ? "Bluetooth caliper not connected"
              : "Web Bluetooth unavailable in this browser"}
          </span>
        )}
        {caliperError && (
          <span className="text-red" role="alert">
            {caliperError}
          </span>
        )}
      </div>

      {/* Rink + heat map toggle */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between print:hidden">
          <span className="text-sm text-grey">
            {measuredCount}/{totalPoints} points recorded
          </span>
          <label className="flex items-center gap-2 text-sm text-grey">
            <input
              type="checkbox"
              checked={showHeatMap}
              onChange={(e) => setShowHeatMap(e.target.checked)}
              className="h-4 w-4"
            />
            Show heat map
          </label>
        </div>

        <div className="rounded border border-grey/30 bg-darkbg/60 p-2">
          <RinkSurface
            ariaLabel={`${template.name} measurement session`}
            printMode={false}
          >
            {showHeatMap && (
              <HeatMap
                points={template.points}
                measurements={measurements as Record<string, number>}
              />
            )}
            {template.points.map((p) => {
              const recorded = measurements[String(p.n)] !== undefined;
              const active = p.n === activePoint;
              return (
                <PointMarker
                  key={p.n}
                  cx={p.x * RINK_VIEWBOX_W}
                  cy={p.y * RINK_VIEWBOX_H}
                  n={p.n}
                  state={
                    active ? "active" : recorded ? "recorded" : "unmeasured"
                  }
                  onClick={() => onPointClick(p.n)}
                />
              );
            })}
          </RinkSurface>
        </div>
      </div>

      {/* Active point input */}
      {activePoint !== null && !completed && (
        <div className="rounded border border-navy bg-darkbg/60 p-3 text-sm print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-white">
              Point <strong>{activePoint}</strong>:
            </span>
            <input
              type="number"
              step="any"
              min={0}
              inputMode="decimal"
              value={activeInput}
              onChange={(e) => setActiveInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitActiveInput();
                }
              }}
              autoFocus
              className="w-32 rounded border border-grey/40 bg-darkbg px-3 py-1.5 text-white focus:border-navy focus:outline-none"
            />
            <span className="text-grey">{template.unit}</span>
            <button
              type="button"
              onClick={commitActiveInput}
              className="rounded bg-navy px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Record
            </button>
            <button
              type="button"
              onClick={() => {
                setActivePoint(null);
                setActiveInput("");
              }}
              className="rounded border border-grey/40 px-3 py-1.5 text-xs text-grey hover:border-white hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Notes + resurfacing status */}
      <div className="grid gap-3 sm:grid-cols-2 print:hidden">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Resurfacing status</span>
          <select
            value={resurfacing ?? ""}
            onChange={(e) =>
              setResurfacing(
                e.target.value === ""
                  ? null
                  : (e.target.value as ResurfacingStatus),
              )
            }
            disabled={completed}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          >
            <option value="">— Not specified —</option>
            <option value="pre">{RESURFACING_LABELS.pre}</option>
            <option value="mid">{RESURFACING_LABELS.mid}</option>
            <option value="post">{RESURFACING_LABELS.post}</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm print:hidden">
        <span className="text-grey">Session notes</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={completed}
          className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
        />
      </label>

      {/* Measurement table for printable export */}
      <div className="hidden print:block">
        <h2 className="text-xl font-semibold">{template.name}</h2>
        <p className="text-sm">
          {measuredCount} of {totalPoints} points · Unit: {template.unit}
          {resurfacing && ` · ${RESURFACING_LABELS[resurfacing]}`}
        </p>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">#</th>
              <th className="text-left">Measurement ({template.unit})</th>
            </tr>
          </thead>
          <tbody>
            {template.points.map((p) => (
              <tr key={p.n}>
                <td>{p.n}</td>
                <td>
                  {measurements[String(p.n)] !== undefined
                    ? measurements[String(p.n)]
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {notes && (
          <div className="mt-3">
            <strong>Notes:</strong>
            <p>{notes}</p>
          </div>
        )}
      </div>

      {/* Errors + status */}
      {error && (
        <p className="text-sm text-red" role="alert">
          {error}
        </p>
      )}
      {statusMessage && <p className="text-sm text-green">{statusMessage}</p>}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={pending || completed}
          className="rounded border border-grey/40 px-4 py-2 text-sm text-grey hover:border-white hover:text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={onComplete}
          disabled={pending || completed}
          className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {completed ? "Completed" : "Complete & export"}
        </button>
        {completed && (
          <button
            type="button"
            onClick={onPrint}
            className="rounded border border-grey/40 px-4 py-2 text-sm text-white hover:border-white"
          >
            Print PDF
          </button>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Point marker
// =====================================================================

function PointMarker({
  cx,
  cy,
  n,
  state,
  onClick,
}: {
  cx: number;
  cy: number;
  n: number;
  state: "unmeasured" | "active" | "recorded";
  onClick: () => void;
}) {
  const fill =
    state === "recorded"
      ? "#4DFF00"
      : state === "active"
        ? "#FFB800"
        : "#A5ACAF";
  const stroke = "#003B6F";
  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ cursor: "pointer" }}
    >
      <circle cx={cx} cy={cy} r={16} fill={fill} stroke={stroke} strokeWidth={2} />
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        fontSize={14}
        fontWeight="bold"
        fill="#003B6F"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {n}
      </text>
    </g>
  );
}

// =====================================================================
// Helpers
// =====================================================================

/**
 * Find the next unmeasured point AFTER `from` in the template's
 * point order, wrapping around. Returns null if every point is now
 * measured.
 */
function nextUnmeasured(
  template: Template,
  measurements: Measurements,
  from: number,
): number | null {
  const sorted = [...template.points].sort((a, b) => a.n - b.n);
  const len = sorted.length;
  if (len === 0) return null;
  const startIdx = sorted.findIndex((p) => p.n === from);
  for (let i = 1; i <= len; i++) {
    const cand = sorted[(startIdx + i) % len]!;
    if (measurements[String(cand.n)] === undefined) return cand.n;
  }
  return null;
}
