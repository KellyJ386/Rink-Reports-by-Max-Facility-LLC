-- =====================================================================
-- RinkReports 3.0 — Phase 3A: Refrigeration data model
-- Migration: 007_refrigeration.sql
--
-- Refrigeration is a periodic plant-monitoring log: every couple of
-- hours an operator walks the plant and records readings for each
-- compressor plus the facility-wide brine, ice, and condenser fields.
--
-- The field CATALOG is fixed in TypeScript (the same 10 fields apply
-- at every ice rink), but per-field RANGES, COMPRESSOR COUNT, and
-- compressor names are admin-configurable per facility — see
-- CLAUDE.md Rule 2 ("compressor counts" and "thresholds" are
-- explicitly listed as facility_config-driven values).
--
-- Tables:
--   * refrigeration_compressors  — admin-configured list of
--                                  compressors at this facility.
--                                  Mirrors the ice_equipment shape:
--                                  named, ordered, active flag for
--                                  retiring units without losing log
--                                  history.
--   * refrigeration_readings     — one row per reading. Append-only.
--                                  Facility-wide measurements get
--                                  typed numeric columns (queryable
--                                  for charting later); per-compressor
--                                  measurements live in a JSONB array
--                                  whose shape is validated server-
--                                  side at insert time. 90-day cron
--                                  retention.
--
-- Field thresholds live in `facility_config` under
-- module='refrigeration', key='thresholds.<field_key>',
-- value={"min": number, "max": number}. The admin UI writes them
-- via admin.setConfig and the staff form reads them via
-- useModuleConfig().
--
-- CLAUDE.md rules:
--   Rule 1: facility_id is set server-side, never client input.
--   Rule 2: compressor count + ranges come from facility config.
--   Rule 4: tables land empty; admins build their compressor list.
--   Rule 8: RLS at the DB AND the server. Force RLS on every table.
-- =====================================================================

-- ---------------------------------------------------------------------
-- refrigeration_compressors
-- ---------------------------------------------------------------------
create table if not exists public.refrigeration_compressors (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  position    integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists refrigeration_compressors_facility_position_idx
  on public.refrigeration_compressors (facility_id, position);

drop trigger if exists refrigeration_compressors_set_updated_at
  on public.refrigeration_compressors;
create trigger refrigeration_compressors_set_updated_at
  before update on public.refrigeration_compressors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- refrigeration_readings
-- ---------------------------------------------------------------------
create table if not exists public.refrigeration_readings (
  id            uuid primary key default gen_random_uuid(),
  facility_id   uuid not null references public.facilities (id) on delete cascade,
  submitted_by  uuid not null references auth.users (id) on delete cascade,
  submitted_at  timestamptz not null default now(),
  -- Facility-wide measurements (numeric, nullable to allow partial
  -- readings if a sensor is offline). Units are documented in the
  -- TypeScript field catalog and surfaced in the form labels.
  brine_supply       numeric,
  brine_return       numeric,
  brine_flow         numeric,
  ice_surface_temp   numeric,
  condenser_temp     numeric,
  -- Per-compressor measurements. Shape:
  --   [{
  --     "compressor_id": uuid,
  --     "suction_pressure":   number | null,
  --     "discharge_pressure": number | null,
  --     "oil_pressure":       number | null,
  --     "amps":               number | null,
  --     "oil_temperature":    number | null
  --   }]
  -- Validated server-side by the /api/sync handler against the Zod
  -- schema. Stored as JSONB so the per-compressor row count varies
  -- with the admin's compressor list.
  compressor_readings jsonb not null default '[]'::jsonb,
  local_id      text,
  created_at    timestamptz not null default now()
);

create index if not exists refrigeration_readings_facility_submitted_at_idx
  on public.refrigeration_readings (facility_id, submitted_at desc);

create unique index if not exists refrigeration_readings_facility_local_id_uniq
  on public.refrigeration_readings (facility_id, local_id)
  where local_id is not null;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

-- refrigeration_compressors --------------------------------------------
alter table public.refrigeration_compressors enable row level security;
alter table public.refrigeration_compressors force row level security;

drop policy if exists refrigeration_compressors_select on public.refrigeration_compressors;
create policy refrigeration_compressors_select
  on public.refrigeration_compressors
  for select
  to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists refrigeration_compressors_insert_admin on public.refrigeration_compressors;
create policy refrigeration_compressors_insert_admin
  on public.refrigeration_compressors
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  );

drop policy if exists refrigeration_compressors_update_admin on public.refrigeration_compressors;
create policy refrigeration_compressors_update_admin
  on public.refrigeration_compressors
  for update
  to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  )
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  );

drop policy if exists refrigeration_compressors_delete_admin on public.refrigeration_compressors;
create policy refrigeration_compressors_delete_admin
  on public.refrigeration_compressors
  for delete
  to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  );

-- refrigeration_readings -----------------------------------------------
alter table public.refrigeration_readings enable row level security;
alter table public.refrigeration_readings force row level security;

drop policy if exists refrigeration_readings_select on public.refrigeration_readings;
create policy refrigeration_readings_select
  on public.refrigeration_readings
  for select
  to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists refrigeration_readings_insert on public.refrigeration_readings;
create policy refrigeration_readings_insert
  on public.refrigeration_readings
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and submitted_by = (select auth.uid())
  );

-- No update / delete policies on refrigeration_readings: append-only.

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant select, insert, update, delete on
  public.refrigeration_compressors,
  public.refrigeration_readings
  to authenticated;

-- ---------------------------------------------------------------------
-- pg_cron retention job (90 days)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'delete-old-refrigeration-readings') then
    perform cron.unschedule('delete-old-refrigeration-readings');
  end if;
  perform cron.schedule(
    'delete-old-refrigeration-readings',
    '30 */6 * * *',
    $sql$ delete from public.refrigeration_readings where submitted_at < now() - interval '90 days' $sql$
  );
end$$;
