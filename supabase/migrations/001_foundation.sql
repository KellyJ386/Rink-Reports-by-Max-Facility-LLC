-- =====================================================================
-- RinkReports 3.0 — Phase 0 Foundation Schema
-- Migration: 001_foundation.sql
--
-- This migration establishes:
--   * Core tables: facilities, user_profiles, facility_modules,
--                  facility_config, sync_log
--   * Helper functions: get_user_facility_id(), get_user_role(),
--                       set_updated_at(), handle_new_user()
--   * Triggers: updated_at on every table, auth.users insert hook
--   * Row Level Security policies on every table — every read/write
--     is scoped to the caller's facility via get_user_facility_id().
--
-- CLAUDE.md rules enforced here:
--   Rule 1: facility_id is never accepted from client input.
--           RLS policies override the value with get_user_facility_id().
--   Rule 4: No business-data seeds in this file. Only DDL.
--           Tennity facility row + module list live in 002_tennity_seed.
--   Rule 8: RLS at the database AND the server. This file is the DB layer.
-- =====================================================================

set check_function_bodies = off;

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Helper: set_updated_at()
-- Generic trigger function that bumps updated_at on every UPDATE.
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Table: facilities
-- A facility is a single rink (or building containing rinks). It is
-- the tenant boundary. Every other table is scoped to a facility_id.
-- ---------------------------------------------------------------------
create table if not exists public.facilities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  timezone    text not null default 'America/New_York',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists facilities_slug_idx on public.facilities (slug);

drop trigger if exists facilities_set_updated_at on public.facilities;
create trigger facilities_set_updated_at
  before update on public.facilities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Table: user_profiles
-- One row per auth.users row. Owns the user's facility membership and
-- role. The tRPC server reads facility_id from this table on every
-- request — see CLAUDE.md Rule 1.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'manager', 'staff');
  end if;
end$$;

create table if not exists public.user_profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  facility_id uuid not null references public.facilities (id) on delete restrict,
  role        public.user_role not null default 'staff',
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists user_profiles_facility_idx
  on public.user_profiles (facility_id);

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Helper: get_user_facility_id()
-- Returns the facility_id of the calling user. Used by every RLS
-- policy below and by the get_user_facility_id() reference in
-- CLAUDE.md Rule 8. STABLE so the planner can cache it per statement.
-- ---------------------------------------------------------------------
create or replace function public.get_user_facility_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select facility_id
  from public.user_profiles
  where user_id = auth.uid();
$$;

revoke all on function public.get_user_facility_id() from public;
grant execute on function public.get_user_facility_id() to authenticated;

-- ---------------------------------------------------------------------
-- Helper: get_user_role()
-- Returns the role of the calling user, or null if no profile exists.
-- ---------------------------------------------------------------------
create or replace function public.get_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.user_profiles
  where user_id = auth.uid();
$$;

revoke all on function public.get_user_role() from public;
grant execute on function public.get_user_role() to authenticated;

-- ---------------------------------------------------------------------
-- Table: facility_modules
-- Which modules are enabled for a given facility. The list of valid
-- module slugs is enforced by a check constraint to keep typos out
-- of the wire — but the *values* configured for each module live in
-- facility_config and come from the Admin Control Center UI.
-- ---------------------------------------------------------------------
create table if not exists public.facility_modules (
  facility_id uuid not null references public.facilities (id) on delete cascade,
  module      text not null,
  enabled     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (facility_id, module),
  constraint facility_modules_known_module check (
    module in (
      'daily-reports',
      'ice-operations',
      'refrigeration',
      'air-quality',
      'ice-depth',
      'incidents',
      'scheduling',
      'communications'
    )
  )
);

create index if not exists facility_modules_facility_idx
  on public.facility_modules (facility_id);

drop trigger if exists facility_modules_set_updated_at on public.facility_modules;
create trigger facility_modules_set_updated_at
  before update on public.facility_modules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Table: facility_config
-- Per-facility, per-module key/value config. This is the *only*
-- source of dropdown values, thresholds, tab names, equipment lists,
-- etc. (CLAUDE.md Rule 2). Reads must go through useModuleConfig.
-- ---------------------------------------------------------------------
create table if not exists public.facility_config (
  facility_id uuid not null references public.facilities (id) on delete cascade,
  module      text not null,
  key         text not null,
  value       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (facility_id, module, key)
);

create index if not exists facility_config_facility_module_idx
  on public.facility_config (facility_id, module);

drop trigger if exists facility_config_set_updated_at on public.facility_config;
create trigger facility_config_set_updated_at
  before update on public.facility_config
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Table: sync_log
-- Append-only audit of offline sync envelope replays. Lets us debug
-- why a Dexie write didn't land server-side without exposing the
-- per-module write tables themselves. Module write handlers append
-- to this in their transaction.
-- ---------------------------------------------------------------------
create table if not exists public.sync_log (
  id           uuid primary key default gen_random_uuid(),
  facility_id  uuid not null references public.facilities (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  module       text not null,
  client_id    text not null,
  payload      jsonb not null,
  status       text not null check (status in ('received', 'applied', 'rejected')),
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists sync_log_facility_idx
  on public.sync_log (facility_id, created_at desc);
create index if not exists sync_log_user_idx
  on public.sync_log (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Auth trigger: handle_new_user()
-- Fires after a row is inserted into auth.users. Creates a stub
-- user_profiles row pointing at the facility encoded in the user's
-- raw_user_meta_data.facility_id (set by the admin invite flow). If
-- no facility is supplied the row is NOT created — the user has no
-- access until an admin assigns them.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_facility uuid;
  meta_role     public.user_role;
  meta_name     text;
begin
  meta_facility := nullif(new.raw_user_meta_data ->> 'facility_id', '')::uuid;
  meta_role := coalesce(
    nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role,
    'staff'::public.user_role
  );
  meta_name := nullif(new.raw_user_meta_data ->> 'full_name', '');

  if meta_facility is not null then
    insert into public.user_profiles (user_id, facility_id, role, full_name)
    values (new.id, meta_facility, meta_role, meta_name)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Row Level Security
-- Enable on every table and write policies that scope every read
-- and write to get_user_facility_id(). The server layer (tRPC) ALSO
-- enforces this via ctx.facilityId — see CLAUDE.md Rule 8.
-- ---------------------------------------------------------------------

-- facilities ----------------------------------------------------------
alter table public.facilities enable row level security;
alter table public.facilities force row level security;

drop policy if exists facilities_select_own on public.facilities;
create policy facilities_select_own
  on public.facilities
  for select
  to authenticated
  using (id = public.get_user_facility_id());

drop policy if exists facilities_update_admin on public.facilities;
create policy facilities_update_admin
  on public.facilities
  for update
  to authenticated
  using (
    id = public.get_user_facility_id()
    and public.get_user_role() = 'admin'
  )
  with check (
    id = public.get_user_facility_id()
    and public.get_user_role() = 'admin'
  );

-- user_profiles -------------------------------------------------------
alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;

drop policy if exists user_profiles_select_self_or_facility on public.user_profiles;
create policy user_profiles_select_self_or_facility
  on public.user_profiles
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or facility_id = public.get_user_facility_id()
  );

drop policy if exists user_profiles_update_self on public.user_profiles;
create policy user_profiles_update_self
  on public.user_profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and facility_id = public.get_user_facility_id());

drop policy if exists user_profiles_admin_manage on public.user_profiles;
create policy user_profiles_admin_manage
  on public.user_profiles
  for all
  to authenticated
  using (
    facility_id = public.get_user_facility_id()
    and public.get_user_role() = 'admin'
  )
  with check (
    facility_id = public.get_user_facility_id()
    and public.get_user_role() = 'admin'
  );

-- facility_modules ----------------------------------------------------
alter table public.facility_modules enable row level security;
alter table public.facility_modules force row level security;

drop policy if exists facility_modules_select_own on public.facility_modules;
create policy facility_modules_select_own
  on public.facility_modules
  for select
  to authenticated
  using (facility_id = public.get_user_facility_id());

drop policy if exists facility_modules_admin_write on public.facility_modules;
create policy facility_modules_admin_write
  on public.facility_modules
  for all
  to authenticated
  using (
    facility_id = public.get_user_facility_id()
    and public.get_user_role() = 'admin'
  )
  with check (
    facility_id = public.get_user_facility_id()
    and public.get_user_role() = 'admin'
  );

-- facility_config -----------------------------------------------------
alter table public.facility_config enable row level security;
alter table public.facility_config force row level security;

drop policy if exists facility_config_select_own on public.facility_config;
create policy facility_config_select_own
  on public.facility_config
  for select
  to authenticated
  using (facility_id = public.get_user_facility_id());

drop policy if exists facility_config_admin_write on public.facility_config;
create policy facility_config_admin_write
  on public.facility_config
  for all
  to authenticated
  using (
    facility_id = public.get_user_facility_id()
    and public.get_user_role() = 'admin'
  )
  with check (
    facility_id = public.get_user_facility_id()
    and public.get_user_role() = 'admin'
  );

-- sync_log ------------------------------------------------------------
alter table public.sync_log enable row level security;
alter table public.sync_log force row level security;

drop policy if exists sync_log_select_own on public.sync_log;
create policy sync_log_select_own
  on public.sync_log
  for select
  to authenticated
  using (facility_id = public.get_user_facility_id());

drop policy if exists sync_log_insert_own on public.sync_log;
create policy sync_log_insert_own
  on public.sync_log
  for insert
  to authenticated
  with check (
    facility_id = public.get_user_facility_id()
    and user_id = auth.uid()
  );

-- ---------------------------------------------------------------------
-- Grants
-- The anon role gets nothing. authenticated gets table-level access
-- gated by the policies above. service_role bypasses RLS by default.
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.facilities,
  public.user_profiles,
  public.facility_modules,
  public.facility_config,
  public.sync_log
  to authenticated;
