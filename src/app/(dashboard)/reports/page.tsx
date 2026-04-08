"use client";

import { useState } from "react";

import { trpc } from "@/lib/trpc";

// ============================================================================
// Types
// ============================================================================

interface PackCard {
  id: string;
  title: string;
  description: string;
}

const PACK_CARDS: PackCard[] = [
  {
    id: "osha",
    title: "OSHA Injury Log (300/300A)",
    description:
      "Generates a OSHA 300 Log of Work-Related Injuries and Illnesses and the 300A Annual Summary per 29 CFR 1904 for a full calendar year. All incidents recorded in RinkReports for the selected year are included. The admin must pre-filter for recordability.",
  },
  {
    id: "epa",
    title: "EPA RMP Refrigerant Log",
    description:
      "Generates an operational refrigerant log per 40 CFR Part 68 for a full calendar year. Includes facility identification, inventory summary, and a table of all refrigeration readings. Full RMP compliance requires additional documentation — consult your environmental compliance officer.",
  },
  {
    id: "usahockey",
    title: "USA Hockey Rink Safety",
    description:
      "Generates a best-effort rink safety report covering ice surface conditions, air quality compliance, incident summary, and daily checklist completion for the selected month. Verify current USA Hockey standards at usahockey.com before official use.",
  },
  {
    id: "board",
    title: "Monthly Board Pack",
    description:
      "Management summary for the selected month. Covers air quality overview, refrigeration summary, incident log, active alerts, and operational checklist completion rates. This is a management report, not a regulatory filing.",
  },
];

// ============================================================================
// Helpers
// ============================================================================

function localStorageKey(packId: string): string {
  return `rr:report-pack:last-generated:${packId}`;
}

function getLastGenerated(packId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(localStorageKey(packId));
  } catch {
    return null;
  }
}

function setLastGenerated(packId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(localStorageKey(packId), new Date().toISOString());
  } catch {
    // localStorage quota exceeded or unavailable — ignore
  }
}

/**
 * Trigger a browser download from a base64-encoded PDF string.
 * Creates a temporary anchor element, clicks it, then removes it.
 */
function downloadPdf(base64: string, filename: string): void {
  const a = document.createElement("a");
  a.href = `data:application/pdf;base64,${base64}`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ============================================================================
// Per-pack form components
// ============================================================================

function OshaCard({ card }: { card: PackCard }) {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [lastGenerated, setLastGeneratedState] = useState<string | null>(
    () => getLastGenerated(card.id),
  );

  const mutation = trpc.exports.oshaLog.useMutation({
    onSuccess(data) {
      downloadPdf(data.base64, data.filename);
      setLastGenerated(card.id);
      setLastGeneratedState(new Date().toISOString());
    },
  });

  return (
    <PackCardShell
      card={card}
      lastGenerated={lastGenerated}
      loading={mutation.isPending}
      error={mutation.error?.message ?? null}
      onGenerate={() => mutation.mutate({ year })}
    >
      <label className="block text-sm text-grey mb-1">Calendar Year</label>
      <input
        type="number"
        min={2020}
        max={2030}
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        className="w-32 px-3 py-1.5 rounded border border-grey bg-dark text-white text-sm"
      />
    </PackCardShell>
  );
}

function EpaCard({ card }: { card: PackCard }) {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [refrigerantType, setRefrigerantType] = useState("R-717 (Ammonia)");
  const [lastGenerated, setLastGeneratedState] = useState<string | null>(
    () => getLastGenerated(card.id),
  );

  const mutation = trpc.exports.epaRmpLog.useMutation({
    onSuccess(data) {
      downloadPdf(data.base64, data.filename);
      setLastGenerated(card.id);
      setLastGeneratedState(new Date().toISOString());
    },
  });

  return (
    <PackCardShell
      card={card}
      lastGenerated={lastGenerated}
      loading={mutation.isPending}
      error={mutation.error?.message ?? null}
      onGenerate={() => mutation.mutate({ year, refrigerantType })}
    >
      <div className="flex gap-4 flex-wrap">
        <div>
          <label className="block text-sm text-grey mb-1">Calendar Year</label>
          <input
            type="number"
            min={2020}
            max={2030}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-32 px-3 py-1.5 rounded border border-grey bg-dark text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-grey mb-1">Refrigerant Type</label>
          <input
            type="text"
            value={refrigerantType}
            onChange={(e) => setRefrigerantType(e.target.value)}
            placeholder="e.g. R-717 (Ammonia)"
            className="w-52 px-3 py-1.5 rounded border border-grey bg-dark text-white text-sm"
          />
        </div>
      </div>
    </PackCardShell>
  );
}

function UsaHockeyCard({ card }: { card: PackCard }) {
  const currentDate = new Date();
  const defaultMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  const defaultReportDate = currentDate.toISOString().slice(0, 10);

  const [month, setMonth] = useState(defaultMonth);
  const [reportDate, setReportDate] = useState(defaultReportDate);
  const [lastGenerated, setLastGeneratedState] = useState<string | null>(
    () => getLastGenerated(card.id),
  );

  const mutation = trpc.exports.usaHockeySafety.useMutation({
    onSuccess(data) {
      downloadPdf(data.base64, data.filename);
      setLastGenerated(card.id);
      setLastGeneratedState(new Date().toISOString());
    },
  });

  return (
    <PackCardShell
      card={card}
      lastGenerated={lastGenerated}
      loading={mutation.isPending}
      error={mutation.error?.message ?? null}
      onGenerate={() => mutation.mutate({ month, reportDate })}
    >
      <div className="flex gap-4 flex-wrap">
        <div>
          <label className="block text-sm text-grey mb-1">Report Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-44 px-3 py-1.5 rounded border border-grey bg-dark text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-grey mb-1">Report Date</label>
          <input
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
            className="w-44 px-3 py-1.5 rounded border border-grey bg-dark text-white text-sm"
          />
        </div>
      </div>
    </PackCardShell>
  );
}

function BoardPackCard({ card }: { card: PackCard }) {
  const currentDate = new Date();
  const defaultMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [lastGenerated, setLastGeneratedState] = useState<string | null>(
    () => getLastGenerated(card.id),
  );

  /** Format YYYY-MM as a human-readable label, e.g. "March 2026" */
  function formatMonthLabel(yyyyMm: string): string {
    const [yr, mo] = yyyyMm.split("-").map(Number) as [number, number];
    return new Date(yr, mo - 1, 1).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
  }

  const mutation = trpc.exports.monthlyBoardPack.useMutation({
    onSuccess(data) {
      downloadPdf(data.base64, data.filename);
      setLastGenerated(card.id);
      setLastGeneratedState(new Date().toISOString());
    },
  });

  return (
    <PackCardShell
      card={card}
      lastGenerated={lastGenerated}
      loading={mutation.isPending}
      error={mutation.error?.message ?? null}
      onGenerate={() =>
        mutation.mutate({ month, monthLabel: formatMonthLabel(month) })
      }
    >
      <label className="block text-sm text-grey mb-1">Report Month</label>
      <input
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="w-44 px-3 py-1.5 rounded border border-grey bg-dark text-white text-sm"
      />
    </PackCardShell>
  );
}

// ============================================================================
// Shared card shell
// ============================================================================

interface PackCardShellProps {
  card: PackCard;
  lastGenerated: string | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
  children: React.ReactNode;
}

function PackCardShell({
  card,
  lastGenerated,
  loading,
  error,
  onGenerate,
  children,
}: PackCardShellProps) {
  return (
    <div className="rounded-lg border border-grey/30 bg-[#001a33] p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-white">{card.title}</h2>
        <p className="mt-1 text-sm text-grey leading-relaxed">{card.description}</p>
      </div>

      <div>{children}</div>

      <div className="flex items-center justify-between gap-4 pt-2">
        <button
          onClick={onGenerate}
          disabled={loading}
          className="px-5 py-2 rounded font-semibold text-sm bg-navy text-white hover:bg-navy/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ backgroundColor: "#003B6F" }}
        >
          {loading ? "Generating…" : "Generate PDF"}
        </button>

        {lastGenerated && (
          <span className="text-xs text-grey">
            Last generated:{" "}
            {new Date(lastGenerated).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-[#F42A2A] rounded bg-[#F42A2A]/10 px-3 py-2">
          Error: {error}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function ReportPacksPage() {
  const [oshaCard, epaCard, usaHockeyCard, boardCard] = PACK_CARDS as [
    PackCard,
    PackCard,
    PackCard,
    PackCard,
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Report Packs</h1>
        <p className="mt-2 text-grey">
          Generate branded, multi-section PDF reports for regulatory filings and
          management review. Each PDF is generated on-demand and downloads
          directly to your device.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <OshaCard card={oshaCard} />
        <EpaCard card={epaCard} />
        <UsaHockeyCard card={usaHockeyCard} />
        <BoardPackCard card={boardCard} />
      </div>
    </div>
  );
}
