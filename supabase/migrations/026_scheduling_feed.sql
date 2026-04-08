-- =====================================================================
-- RinkReports 3.0 — Phase E: Scheduling feed columns
-- Migration: 026_scheduling_feed.sql
--
-- Adds two columns to facility_config so the nightly scheduling-import
-- cron can pull a recurring ICS feed URL for each facility.
-- =====================================================================

ALTER TABLE public.facility_config
  ADD COLUMN IF NOT EXISTS scheduling_feed_url TEXT,
  ADD COLUMN IF NOT EXISTS scheduling_feed_last_imported_at TIMESTAMPTZ;
