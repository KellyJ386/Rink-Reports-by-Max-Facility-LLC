import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import * as Sentry from "@sentry/nextjs";

export interface DailyWeather {
  facilityId: string;
  date: string;
  highTempF: number | null;
  lowTempF: number | null;
  avgTempF: number | null;
  precipitationIn: number | null;
  snowIn: number | null;
  windMph: number | null;
  conditions: string | null;
}

interface ZippopotamResponse {
  places?: Array<{
    latitude?: string;
    longitude?: string;
  }>;
}

interface OpenMeteoResponse {
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    snowfall_sum?: number[];
    windspeed_10m_max?: number[];
  };
}

/**
 * Fetch weather for a facility on a given date.
 *
 * 1. Check daily_weather cache for facility+date. Return if found.
 * 2. Fetch facility_config for lat/long. If missing, try to geocode from zip_code.
 * 3. Call Open-Meteo daily endpoint. Extract high/low/precip/snow/wind.
 * 4. Upsert into daily_weather. Return the mapped result.
 */
export async function fetchWeatherForFacility(
  facilityId: string,
  date: string,
  supabase: SupabaseClient<Database>,
): Promise<DailyWeather | null> {
  try {
    // Step 1: Check cache in daily_weather table
    const { data: cached, error: cacheError } = await supabase
      .from("daily_weather")
      .select("*")
      .eq("facility_id", facilityId)
      .eq("weather_date", date)
      .maybeSingle();

    if (cacheError) {
      Sentry.captureException(cacheError, {
        tags: { context: "weather-cache-lookup", facilityId, date },
      });
    }

    if (cached) {
      return mapDailyWeatherRow(cached);
    }

    // Step 2: Fetch facility_config for lat/long
    const { data: config, error: configError } = await supabase
      .from("facility_config")
      .select("latitude, longitude, value")
      .eq("facility_id", facilityId)
      .maybeSingle();

    if (configError) {
      Sentry.captureException(configError, {
        tags: { context: "weather-config-fetch", facilityId },
      });
      return null;
    }

    let lat: number | null = config?.latitude ?? null;
    let lng: number | null = config?.longitude ?? null;

    // If no lat/long but we have zip_code in config, geocode it
    if (
      (!lat || !lng) &&
      config?.value &&
      typeof config.value === "object" &&
      "zip_code" in config.value
    ) {
      const zipCode = (config.value as Record<string, unknown>).zip_code;
      if (typeof zipCode === "string" && zipCode.trim()) {
        const geocoded = await geocodeZipCode(zipCode);
        if (geocoded) {
          lat = geocoded.lat;
          lng = geocoded.lng;
        }
      }
    }

    // If we still have no coordinates, return null
    if (!lat || !lng) {
      return null;
    }

    // Step 3: Fetch from Open-Meteo
    const weather = await fetchOpenMeteoDaily(lat, lng, date);
    if (!weather) {
      return null;
    }

    // Step 4: Upsert into daily_weather
    const { error: upsertError } = await supabase.from("daily_weather").upsert(
      {
        facility_id: facilityId,
        weather_date: date,
        high_temp_f: weather.highTempF,
        low_temp_f: weather.lowTempF,
        avg_temp_f: weather.avgTempF,
        precipitation_in: weather.precipitationIn,
        snow_in: weather.snowIn,
        wind_mph: weather.windMph,
        conditions: weather.conditions,
        raw_response: weather.rawResponse,
      },
      { onConflict: "facility_id,weather_date" },
    );

    if (upsertError) {
      Sentry.captureException(upsertError, {
        tags: { context: "weather-upsert", facilityId, date },
      });
      return null;
    }

    return {
      facilityId,
      date,
      highTempF: weather.highTempF,
      lowTempF: weather.lowTempF,
      avgTempF: weather.avgTempF,
      precipitationIn: weather.precipitationIn,
      snowIn: weather.snowIn,
      windMph: weather.windMph,
      conditions: weather.conditions,
    };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { context: "fetchWeatherForFacility", facilityId, date },
    });
    return null;
  }
}

async function geocodeZipCode(zipCode: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://api.zippopotam.us/us/${encodeURIComponent(zipCode.trim())}`,
    );
    if (!res.ok) return null;

    const data = (await res.json()) as ZippopotamResponse;
    const place = data.places?.[0];
    if (!place?.latitude || !place?.longitude) return null;

    const lat = Number(place.latitude);
    const lng = Number(place.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

interface FetchedWeather {
  highTempF: number | null;
  lowTempF: number | null;
  avgTempF: number | null;
  precipitationIn: number | null;
  snowIn: number | null;
  windMph: number | null;
  conditions: string | null;
  rawResponse: Record<string, unknown>;
}

async function fetchOpenMeteoDaily(
  lat: number,
  lng: number,
  date: string,
): Promise<FetchedWeather | null> {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set(
      "daily",
      "temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,windspeed_10m_max",
    );
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("precipitation_unit", "inch");
    url.searchParams.set("start_date", date);
    url.searchParams.set("end_date", date);
    url.searchParams.set("timezone", "auto");

    const res = await fetch(url.toString());
    if (!res.ok) return null;

    const data = (await res.json()) as OpenMeteoResponse;

    if (!data.daily) return null;

    const maxTemp = data.daily.temperature_2m_max?.[0] ?? null;
    const minTemp = data.daily.temperature_2m_min?.[0] ?? null;
    const precip = data.daily.precipitation_sum?.[0] ?? null;
    const snow = data.daily.snowfall_sum?.[0] ?? null;
    const wind = data.daily.windspeed_10m_max?.[0] ?? null;

    let avgTemp: number | null = null;
    if (maxTemp !== null && minTemp !== null) {
      avgTemp = (maxTemp + minTemp) / 2;
    }

    return {
      highTempF: maxTemp,
      lowTempF: minTemp,
      avgTempF: avgTemp,
      precipitationIn: precip,
      snowIn: snow,
      windMph: wind,
      conditions: null, // Open-Meteo daily endpoint doesn't include conditions
      rawResponse: data,
    };
  } catch {
    return null;
  }
}

function mapDailyWeatherRow(
  row: Database["public"]["Tables"]["daily_weather"]["Row"],
): DailyWeather {
  return {
    facilityId: row.facility_id,
    date: row.weather_date,
    highTempF: row.high_temp_f,
    lowTempF: row.low_temp_f,
    avgTempF: row.avg_temp_f,
    precipitationIn: row.precipitation_in,
    snowIn: row.snow_in,
    windMph: row.wind_mph,
    conditions: row.conditions,
  };
}
