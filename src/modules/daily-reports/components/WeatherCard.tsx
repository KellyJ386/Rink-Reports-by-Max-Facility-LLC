"use client";

import { trpc } from "@/lib/trpc";

/**
 * Small read-only weather summary card for Daily Reports.
 * Fetches today's weather via trpc.weather.getForDate.
 * If data is null, the card is silently hidden.
 */
export function WeatherCard() {
  // Get today's date in YYYY-MM-DD format
  const todayDate = new Date().toISOString().split("T")[0] ?? "";

  const { data: weather, isLoading } = trpc.weather.getForDate.useQuery(
    { date: todayDate },
    {
      // Don't show error toast if the query fails; just hide the card
      retry: false,
    },
  );

  // Hide if loading or if no data
  if (isLoading || !weather) {
    return null;
  }

  return (
    <div className="rounded-lg border border-grey/30 bg-darkbg/40 p-4">
      <h3 className="mb-3 text-sm font-semibold text-grey">Today's Weather</h3>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
        {weather.highTempF !== null && (
          <div>
            <p className="text-xs text-grey">High</p>
            <p className="text-lg font-medium text-white">{weather.highTempF}°F</p>
          </div>
        )}
        {weather.lowTempF !== null && (
          <div>
            <p className="text-xs text-grey">Low</p>
            <p className="text-lg font-medium text-white">{weather.lowTempF}°F</p>
          </div>
        )}
        {weather.precipitationIn !== null && weather.precipitationIn > 0 && (
          <div>
            <p className="text-xs text-grey">Precipitation</p>
            <p className="text-lg font-medium text-white">
              {weather.precipitationIn}"
            </p>
          </div>
        )}
        {weather.snowIn !== null && weather.snowIn > 0 && (
          <div>
            <p className="text-xs text-grey">Snow</p>
            <p className="text-lg font-medium text-white">{weather.snowIn}"</p>
          </div>
        )}
        {weather.windMph !== null && (
          <div>
            <p className="text-xs text-grey">Wind</p>
            <p className="text-lg font-medium text-white">{weather.windMph} mph</p>
          </div>
        )}
      </div>
    </div>
  );
}
