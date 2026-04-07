"use client";

/**
 * Outdoor temperature lookup for the Universal Module Header.
 *
 * Two-step pipeline, both APIs free + key-less:
 *
 *   1. Zippopotam.us — convert a postal code (US ZIP, CA / UK
 *      postcodes, etc.) into a (lat, lng) pair.
 *   2. Open-Meteo — fetch the current temperature at that lat/lng,
 *      in either °F or °C depending on the facility's preference.
 *
 * Both calls go straight from the browser. We cache the result for
 * 5 minutes per (postal_code, country, unit) tuple so generating
 * multiple PDFs in a row doesn't hit the network N times.
 */

export type TemperatureUnit = "f" | "c";

export interface TemperatureReading {
  value: number;
  unit: TemperatureUnit;
  fetchedAt: number;
}

interface CacheEntry {
  reading: TemperatureReading;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(postalCode: string, country: string, unit: TemperatureUnit): string {
  return `${country}:${postalCode}:${unit}`;
}

interface ZippopotamResponse {
  places?: Array<{
    latitude?: string;
    longitude?: string;
  }>;
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
  };
}

export async function fetchOutdoorTemperature(
  postalCode: string,
  country: string,
  unit: TemperatureUnit,
): Promise<TemperatureReading | null> {
  const trimmed = postalCode.trim();
  if (trimmed === "") return null;
  const ctry = (country || "us").trim().toLowerCase();

  // Cache check.
  const key = cacheKey(trimmed, ctry, unit);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.reading;
  }

  // Step 1: ZIP → lat/lng.
  let lat: number;
  let lng: number;
  try {
    const res = await fetch(
      `https://api.zippopotam.us/${encodeURIComponent(ctry)}/${encodeURIComponent(trimmed)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as ZippopotamResponse;
    const place = data.places?.[0];
    if (!place?.latitude || !place?.longitude) return null;
    lat = Number(place.latitude);
    lng = Number(place.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  } catch {
    return null;
  }

  // Step 2: Open-Meteo current temperature in the requested unit.
  try {
    const tempUnitParam = unit === "c" ? "celsius" : "fahrenheit";
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("current", "temperature_2m");
    url.searchParams.set("temperature_unit", tempUnitParam);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = (await res.json()) as OpenMeteoResponse;
    const v = data.current?.temperature_2m;
    if (typeof v !== "number" || !Number.isFinite(v)) return null;

    const reading: TemperatureReading = {
      value: Math.round(v * 10) / 10,
      unit,
      fetchedAt: Date.now(),
    };
    cache.set(key, {
      reading,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return reading;
  } catch {
    return null;
  }
}
