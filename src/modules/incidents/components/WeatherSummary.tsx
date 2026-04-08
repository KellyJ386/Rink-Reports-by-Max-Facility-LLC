"use client";

import { trpc } from "@/lib/trpc";

/**
 * Small read-only weather summary for the Incidents form header.
 * Shows today's high/low + conditions.
 * If data is null, the row is silently hidden.
 */
export function WeatherSummary() {
  // Get today's date in YYYY-MM-DD format
  const todayDate = new Date().toISOString().split("T")[0] ?? "";

  const { data: weather } = trpc.weather.getForDate.useQuery(
    { date: todayDate },
    {
      // Don't show error toast if the query fails; just hide
      retry: false,
    },
  );

  // Hide if no data
  if (!weather) {
    return null;
  }

  const tempStr =
    weather.highTempF !== null && weather.lowTempF !== null
      ? `${weather.lowTempF}–${weather.highTempF}°F`
      : weather.highTempF !== null
        ? `${weather.highTempF}°F`
        : "";

  return (
    <div className="rounded border border-grey/30 bg-darkbg/30 p-3">
      <p className="text-xs text-grey">Outdoor conditions</p>
      <p className="text-sm text-white">{tempStr}</p>
    </div>
  );
}
