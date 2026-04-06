-- =====================================================================
-- RinkReports 3.0 — Tennity Ice Skating Pavilion seed
-- Migration: 002_tennity_seed.sql
--
-- The ONLY data this file inserts is:
--   1. The Tennity facility row.
--   2. One facility_modules row per known module (all disabled by
--      default — the admin enables them in the Control Center).
--
-- CLAUDE.md Rule 4: no business-data seeds. No config values, no
-- dropdown lists, no thresholds, no example reports, no users. The
-- facility admin enters every configuration value through the UI.
-- =====================================================================

-- Stable UUID for Tennity so re-running this migration is idempotent
-- and so application code / fixtures can reference it directly.
insert into public.facilities (id, name, slug, timezone)
values (
  '00000000-0000-4000-a000-000000000001',
  'Tennity Ice Skating Pavilion',
  'tennity',
  'America/New_York'
)
on conflict (id) do nothing;

-- Enable rows for every known module, all disabled. The admin flips
-- enabled = true once they have configured the module.
insert into public.facility_modules (facility_id, module, enabled)
values
  ('00000000-0000-4000-a000-000000000001', 'daily-reports',   false),
  ('00000000-0000-4000-a000-000000000001', 'ice-operations',  false),
  ('00000000-0000-4000-a000-000000000001', 'refrigeration',   false),
  ('00000000-0000-4000-a000-000000000001', 'air-quality',     false),
  ('00000000-0000-4000-a000-000000000001', 'ice-depth',       false),
  ('00000000-0000-4000-a000-000000000001', 'incidents',       false),
  ('00000000-0000-4000-a000-000000000001', 'scheduling',      false),
  ('00000000-0000-4000-a000-000000000001', 'communications',  false)
on conflict (facility_id, module) do nothing;
