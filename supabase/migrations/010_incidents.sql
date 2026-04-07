-- =====================================================================
-- RinkReports 3.0 — Phase 4B: Incidents data model
-- Migration: 010_incidents.sql
--
-- Incidents covers two distinct report shapes:
--
--   * INCIDENT — property damage / near-miss / behavioral / equipment
--                / etc. The base form: when, where, who, what, what
--                we did, follow-up.
--   * ACCIDENT — incident + injury fields: injured person, injury
--                description, body-region tags from the SVG human
--                figure, first aid, EMS, hospital transport.
--
-- Both kinds share a single table with a discriminator column. The
-- variable per-kind fields live in a JSONB `data` column whose shape
-- is validated server-side at insert time by the /api/sync handler
-- against a discriminated union Zod schema. Common fields (date,
-- location, who) get typed columns so they're easy to query/filter.
--
-- Per CLAUDE.md Rule 2, the dropdown choices for incident types,
-- locations, injured-person types, and body-region labels are all
-- entered by the admin in `facility_config` under module='incidents'.
-- Nothing is hardcoded.
--
-- CLAUDE.md rules:
--   Rule 1: facility_id is set server-side, never client input.
--   Rule 2: types/locations/regions all live in facility_config.
--   Rule 4: table lands empty.
--   Rule 8: RLS at the DB AND the server. Append-only — incidents
--           cannot be edited or deleted by RLS, only inserted.
-- =====================================================================

create table if not exists public.incidents (
  id              uuid primary key default gen_random_uuid(),
  facility_id     uuid not null references public.facilities (id) on delete cascade,
  -- Discriminator. Drives the shape of `data`.
  kind            text not null check (kind in ('incident', 'accident')),
  -- Common typed columns for filtering / sorting.
  occurred_at     timestamptz not null,
  location        text not null,
  incident_type   text not null,
  description     text not null,
  -- Variable per-kind fields stored as JSONB. Validated server-side.
  data            jsonb not null default '{}'::jsonb,
  submitted_at    timestamptz not null default now(),
  submitted_by    uuid not null references auth.users (id) on delete cascade,
  local_id        text,
  created_at      timestamptz not null default now()
);

create index if not exists incidents_facility_occurred_at_idx
  on public.incidents (facility_id, occurred_at desc);

create index if not exists incidents_facility_kind_idx
  on public.incidents (facility_id, kind, occurred_at desc);

create unique index if not exists incidents_facility_local_id_uniq
  on public.incidents (facility_id, local_id)
  where local_id is not null;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.incidents enable row level security;
alter table public.incidents force row level security;

drop policy if exists incidents_select on public.incidents;
create policy incidents_select
  on public.incidents
  for select
  to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists incidents_insert on public.incidents;
create policy incidents_insert
  on public.incidents
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and submitted_by = (select auth.uid())
  );

-- No update / delete policies — append-only.

grant select, insert, update, delete on public.incidents to authenticated;

-- ---------------------------------------------------------------------
-- pg_cron retention: 5 years for incidents (often legally required
-- to retain longer than other modules).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'delete-old-incidents') then
    perform cron.unschedule('delete-old-incidents');
  end if;
  perform cron.schedule(
    'delete-old-incidents',
    '0 2 * * *',
    $sql$ delete from public.incidents where occurred_at < now() - interval '5 years' $sql$
  );
end$$;
