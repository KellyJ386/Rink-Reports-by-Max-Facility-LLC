-- =====================================================================
-- RinkReports 3.0 — Phase 3B: Air Quality data model
-- Migration: 008_air_quality.sql
--
-- Air Quality is a CO / NO₂ logging tool with a 4-tier escalation
-- system (Normal / Caution / Action / Evacuate). The thresholds and
-- the per-tier action protocol text live in `facility_config` under
-- module='air-quality':
--
--   key='regulatory_limits'  → { co_caution, co_action, co_evacuate,
--                                 no2_caution, no2_action, no2_evacuate }
--                              The legal MAXIMUM the working
--                              thresholds can be set to. Admin enters
--                              these from their jurisdiction.
--   key='thresholds'         → working thresholds, same shape. The
--                              admin form refuses to save a value
--                              that exceeds the corresponding
--                              regulatory_limits cell (you can only
--                              tighten, never loosen).
--   key='actions'            → { caution, action, evacuate } strings.
--                              Free-text protocol per tier shown to
--                              the operator alongside the live tier.
--
-- The single table:
--
--   * air_quality_readings — one row per reading. Operator enters
--     CO ppm and NO₂ ppm. The /api/sync handler computes the tier
--     server-side from the current thresholds and persists it on the
--     row so historical reports do NOT shift if thresholds are later
--     re-tightened. Append-only, 90-day pg_cron retention.
--
-- CLAUDE.md rules:
--   Rule 1: facility_id is set server-side, never client input.
--   Rule 2: thresholds + action protocol come from facility config.
--   Rule 4: table lands empty.
--   Rule 8: RLS at the DB AND the server.
-- =====================================================================

create table if not exists public.air_quality_readings (
  id            uuid primary key default gen_random_uuid(),
  facility_id   uuid not null references public.facilities (id) on delete cascade,
  submitted_by  uuid not null references auth.users (id) on delete cascade,
  submitted_at  timestamptz not null default now(),
  co_ppm        numeric not null check (co_ppm >= 0),
  no2_ppm       numeric not null check (no2_ppm >= 0),
  notes         text,
  -- Snapshot of the highest tier triggered by this reading at the
  -- moment it was submitted. The /api/sync handler computes this
  -- server-side from the facility's current thresholds. Frozen on
  -- the row so retightening thresholds later does not silently
  -- rewrite history.
  tier          text not null check (tier in ('normal', 'caution', 'action', 'evacuate')),
  local_id      text,
  created_at    timestamptz not null default now()
);

create index if not exists air_quality_readings_facility_submitted_at_idx
  on public.air_quality_readings (facility_id, submitted_at desc);

create index if not exists air_quality_readings_facility_tier_idx
  on public.air_quality_readings (facility_id, tier, submitted_at desc);

create unique index if not exists air_quality_readings_facility_local_id_uniq
  on public.air_quality_readings (facility_id, local_id)
  where local_id is not null;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.air_quality_readings enable row level security;
alter table public.air_quality_readings force row level security;

drop policy if exists air_quality_readings_select on public.air_quality_readings;
create policy air_quality_readings_select
  on public.air_quality_readings
  for select
  to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists air_quality_readings_insert on public.air_quality_readings;
create policy air_quality_readings_insert
  on public.air_quality_readings
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and submitted_by = (select auth.uid())
  );

-- No update / delete policies — append-only.

grant select, insert, update, delete on public.air_quality_readings to authenticated;

-- ---------------------------------------------------------------------
-- pg_cron retention job (90 days)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'delete-old-air-quality-readings') then
    perform cron.unschedule('delete-old-air-quality-readings');
  end if;
  perform cron.schedule(
    'delete-old-air-quality-readings',
    '45 */6 * * *',
    $sql$ delete from public.air_quality_readings where submitted_at < now() - interval '90 days' $sql$
  );
end$$;
