"use client";

import { useState, useMemo } from "react";

import { trpc } from "@/lib/trpc";
import { LineChart, HeatmapGrid, BarChart, CompletionRing } from "@/components/charts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Days = 7 | 30 | 90;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="animate-pulse h-64 rounded bg-[#A5ACAF]/20" />
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded border border-[#F42A2A] bg-[#F42A2A]/10 px-4 py-3 text-sm text-[#F42A2A]">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Air Quality
// ---------------------------------------------------------------------------

function AirQualitySection({ days }: { days: Days }) {
  const { data, isLoading, error } = trpc.analytics.airQualityTrend.useQuery({ days });

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorBanner message={error.message} />;

  const maxTierValue = data && data.length > 0 ? Math.max(...data.map((d) => d.maxTier)) : 0;

  return (
    <div className="flex flex-col gap-2">
      <LineChart
        data={data ?? []}
        lines={[
          { key: "avgCo", label: "CO (ppm)", color: "#3B82F6" },
          { key: "avgNo2", label: "NO\u2082 (ppm)", color: "#F59E0B" },
        ]}
        title="Air Quality"
        unit=" ppm"
      />
      {data && data.length > 0 && (
        <p className="text-xs text-[#A5ACAF]">
          Max tier reached:{" "}
          <span className="font-semibold text-white">{maxTierValue}</span>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Refrigeration
// ---------------------------------------------------------------------------

function RefrigerationSection({ days }: { days: Days }) {
  const { data, isLoading, error } = trpc.analytics.refrigerationBrineDeltaTrend.useQuery({ days });

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorBanner message={error.message} />;

  // Group by shiftLabel (currently always "all", ready for future shift columns)
  const shiftLabels = Array.from(new Set((data ?? []).map((d) => d.shiftLabel)));

  // Pivot to LineChart format: each row has date + one key per shift
  const pivoted = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string | null>>();
    for (const row of data ?? []) {
      const entry = byDate.get(row.date) ?? { date: row.date };
      entry[row.shiftLabel] = row.avgDeltaT;
      byDate.set(row.date, entry);
    }
    return Array.from(byDate.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [data]);

  const SHIFT_COLORS = ["#4DFF00", "#3B82F6", "#F59E0B", "#F42A2A"];
  const lines = shiftLabels.map((label, i) => ({
    key: label,
    label: label === "all" ? "Brine \u0394T (\u00b0F)" : label,
    color: SHIFT_COLORS[i % SHIFT_COLORS.length] ?? "#4DFF00",
  }));

  return (
    <div className="flex flex-col gap-2">
      <LineChart
        data={pivoted}
        lines={lines}
        title="Refrigeration — Brine \u0394T"
        unit="\u00b0F"
      />
      <p className="text-xs text-[#A5ACAF]">
        Reference: target \u0394T \u2248 8\u00b0F. Higher may indicate capacity loss.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Ice Depth
// ---------------------------------------------------------------------------

function IceDepthSection({ days }: { days: Days }) {
  const templates = trpc.iceDepth.listTemplates.useQuery();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Pick a default once templates load
  const templateId = selectedTemplateId ?? templates.data?.[0]?.id ?? "";

  const { data, isLoading, error } = trpc.analytics.iceDepthHeatmapDelta.useQuery(
    { days, templateId },
    { enabled: !!templateId },
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Template selector */}
      {templates.data && templates.data.length > 1 && (
        <select
          className="w-full rounded border border-[#003B6F] bg-[#001122] px-3 py-2 text-sm text-white"
          value={templateId}
          onChange={(e) => setSelectedTemplateId(e.target.value)}
          aria-label="Select ice depth template"
        >
          {templates.data.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {!templateId && (
        <p className="text-sm text-[#A5ACAF]">
          No ice depth templates configured yet.
        </p>
      )}
      {templateId && (
        <>
          {isLoading && <Skeleton />}
          {error && <ErrorBanner message={error.message} />}
          {data && (
            <HeatmapGrid
              points={data}
              gridCols={8}
              title="Ice Depth — Heatmap vs Baseline"
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Incidents
// ---------------------------------------------------------------------------

type IncidentKindFilter = "all" | "incident" | "accident";

function IncidentsSection({ days }: { days: Days }) {
  const { data, isLoading, error } = trpc.analytics.incidentsFrequencyByLocation.useQuery({ days });
  const [kindFilter, setKindFilter] = useState<IncidentKindFilter>("all");

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorBanner message={error.message} />;

  const FILTERS: { label: string; value: IncidentKindFilter }[] = [
    { label: "All", value: "all" },
    { label: "Incidents", value: "incident" },
    { label: "Accidents", value: "accident" },
  ];

  // Filter client-side by incident type (kind)
  const filtered = (data ?? []).filter((d) => {
    if (kindFilter === "all") return true;
    return d.incidentType.toLowerCase().includes(kindFilter);
  });

  // Aggregate by location for the bar chart
  const byLocation = new Map<string, number>();
  for (const row of filtered) {
    byLocation.set(row.location, (byLocation.get(row.location) ?? 0) + row.count);
  }

  const chartData = Array.from(byLocation.entries())
    .map(([label, value]) => ({ label, value, color: "#003B6F" }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="flex flex-col gap-3">
      {/* Kind toggle */}
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setKindFilter(f.value)}
            className="rounded px-3 py-1 text-xs font-medium transition-colors"
            style={
              kindFilter === f.value
                ? { background: "#003B6F", color: "#fff" }
                : { background: "#001122", color: "#A5ACAF", border: "1px solid #A5ACAF33" }
            }
          >
            {f.label}
          </button>
        ))}
      </div>
      <BarChart
        data={chartData}
        title="Incidents by Location"
        unit=" reports"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Daily Report Completion
// ---------------------------------------------------------------------------

function DailyReportsSection({ days }: { days: Days }) {
  const { data, isLoading, error } = trpc.analytics.dailyReportCompletionRate.useQuery({ days });

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorBanner message={error.message} />;

  const avgPct =
    data && data.length > 0
      ? data.reduce((sum, d) => sum + d.completionPct, 0) / data.length
      : 0;

  const lineData = (data ?? []).map((d) => ({
    date: d.date,
    completionPct: d.completionPct,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex-1 min-w-0">
          <LineChart
            data={lineData}
            lines={[{ key: "completionPct", label: "Completion %", color: "#4DFF00" }]}
            title="Daily Report Completion"
            unit="%"
          />
        </div>
        <div className="shrink-0">
          <CompletionRing pct={avgPct} label={`Avg over ${days}d`} size={110} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const DAY_OPTIONS: Days[] = [7, 30, 90];

export default function InsightsPage() {
  const [days, setDays] = useState<Days>(30);

  return (
    <div className="flex flex-col gap-8 px-4 py-6 lg:px-8">
      {/* Heading + date range controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Operational Insights</h1>
        <div className="flex gap-1 rounded border border-[#003B6F] p-0.5">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="rounded px-3 py-1 text-sm font-medium transition-colors"
              style={
                days === d
                  ? { background: "#003B6F", color: "#fff" }
                  : { color: "#A5ACAF" }
              }
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Module sections — 1 col mobile, 2 col lg */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="rounded-lg border border-[#003B6F]/40 bg-[#001122] p-5">
          <AirQualitySection days={days} />
        </section>

        <section className="rounded-lg border border-[#003B6F]/40 bg-[#001122] p-5">
          <RefrigerationSection days={days} />
        </section>

        <section className="rounded-lg border border-[#003B6F]/40 bg-[#001122] p-5">
          <IceDepthSection days={days} />
        </section>

        <section className="rounded-lg border border-[#003B6F]/40 bg-[#001122] p-5">
          <IncidentsSection days={days} />
        </section>

        <section className="rounded-lg border border-[#003B6F]/40 bg-[#001122] p-5 lg:col-span-2">
          <DailyReportsSection days={days} />
        </section>
      </div>
    </div>
  );
}
