-- =====================================================================
-- RinkReports 3.0 — Phase E: Calendar Feed (ICS Export)
-- Migration: 025_calendar_feed.sql
--
-- Adds calendar feed token and enabled flag to facility_config.
-- Each facility can generate a unique token to authenticate calendar
-- feed requests at /api/calendar/{facilityId}?token={token}
-- =====================================================================

ALTER TABLE public.facility_config
  ADD COLUMN IF NOT EXISTS calendar_feed_token TEXT,
  ADD COLUMN IF NOT EXISTS calendar_feed_enabled BOOLEAN NOT NULL DEFAULT false;
