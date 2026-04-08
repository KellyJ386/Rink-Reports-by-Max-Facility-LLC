-- =====================================================================
-- RinkReports 3.0 — Daily Weather Integration
-- Migration: 023_daily_weather.sql
--
-- Adds:
--   1. latitude, longitude columns to facility_config table
--   2. daily_weather table for weather caching per facility+date
--   3. RLS policy ensuring users see only their facility's weather
--
-- Open-Meteo daily endpoint fetches historical + forecast weather.
-- Cron at /api/cron/weather pulls daily for all facilities.
-- Surfaces in Daily Reports + Incidents modules.
-- =====================================================================

-- Store lat/long for weather lookups. If missing, cron will geocode
-- from postal_code using Zippopotam API.
ALTER TABLE public.facility_config
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);

-- Daily weather cache: one row per facility + date.
-- Populated by /api/cron/weather, queried by modules for display.
CREATE TABLE IF NOT EXISTS public.daily_weather (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  weather_date DATE NOT NULL,
  -- Temperature in Fahrenheit. Extracted from Open-Meteo daily response.
  high_temp_f NUMERIC(5,1),
  low_temp_f NUMERIC(5,1),
  avg_temp_f NUMERIC(5,1),
  -- Precipitation in inches.
  precipitation_in NUMERIC(5,2),
  -- Snowfall in inches.
  snow_in NUMERIC(5,2),
  -- Wind speed in mph.
  wind_mph NUMERIC(5,1),
  -- Human-readable conditions (may be null if API doesn't provide).
  conditions TEXT,
  -- Full raw response from Open-Meteo for debugging + future use.
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(facility_id, weather_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_weather_facility_date
  ON public.daily_weather(facility_id, weather_date DESC);

-- Row-level security: users see only their facility's weather.
ALTER TABLE public.daily_weather ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_weather_facility_select" ON public.daily_weather
  FOR SELECT USING (facility_id = get_user_facility_id());
