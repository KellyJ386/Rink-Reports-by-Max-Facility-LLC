-- =====================================================================
-- RinkReports 3.0 — Phase 5A: Scheduling data model
-- Migration: 011_scheduling.sql
--
-- The Scheduling module covers the full lifecycle for up to 200 staff
-- across four operational layers:
--
--   1. Availability     — staff submit weekly availability blocks
--   2. Auto-suggest     — manager triggers a greedy algorithm that
--                          assigns shifts to staff based on
--                          availability + certification gates
--   3. Grid edit        — manager rearranges shifts; cert warnings
--   4. Live board       — published, read-only schedule for all
--                          staff with my-shifts highlighting
--
-- Tables:
--   * scheduling_positions             — admin-defined positions
--                                        (e.g. "Operator", "Greeter")
--   * scheduling_certifications        — admin-defined certifications
--                                        (e.g. "Refrigeration II")
--   * scheduling_position_certifications — junction: which certs a
--                                        position requires
--   * scheduling_staff_certifications  — which staff hold which certs
--   * scheduling_availability          — per-user weekly availability
--                                        (recurring template OR
--                                        per-week override)
--   * scheduling_schedules             — one row per scheduled week,
--                                        status draft|published
--   * scheduling_shifts                — individual shift assignments
--                                        on a schedule
--
-- CLAUDE.md rules:
--   Rule 1: facility_id is server-side only.
--   Rule 2: positions, certifications, block granularity all live in
--           facility_config / their own admin-managed tables.
--   Rule 4: tables land empty.
--   Rule 8: RLS at the DB AND the server. Manager+admin gates use
--           the existing user_role enum.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: is the caller a manager-or-admin in their facility?
-- ---------------------------------------------------------------------
create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.user_profiles where user_id = auth.uid())
    in ('admin', 'manager'),
    false
  );
$$;

revoke all on function public.is_manager_or_admin() from public;
grant execute on function public.is_manager_or_admin() to authenticated;

-- ---------------------------------------------------------------------
-- scheduling_positions
-- ---------------------------------------------------------------------
create table if not exists public.scheduling_positions (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  position    integer not null default 0,
  -- A free-form color hex string (e.g. "#4DFF00") used to tint
  -- shift blocks on the grid. Optional; defaults to navy.
  color       text not null default '#003B6F' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists scheduling_positions_facility_position_idx
  on public.scheduling_positions (facility_id, position);

drop trigger if exists scheduling_positions_set_updated_at
  on public.scheduling_positions;
create trigger scheduling_positions_set_updated_at
  before update on public.scheduling_positions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- scheduling_certifications
-- ---------------------------------------------------------------------
create table if not exists public.scheduling_certifications (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists scheduling_certifications_facility_position_idx
  on public.scheduling_certifications (facility_id, position);

drop trigger if exists scheduling_certifications_set_updated_at
  on public.scheduling_certifications;
create trigger scheduling_certifications_set_updated_at
  before update on public.scheduling_certifications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- scheduling_position_certifications (junction)
-- ---------------------------------------------------------------------
create table if not exists public.scheduling_position_certifications (
  position_id      uuid not null references public.scheduling_positions (id) on delete cascade,
  certification_id uuid not null references public.scheduling_certifications (id) on delete cascade,
  primary key (position_id, certification_id)
);

-- ---------------------------------------------------------------------
-- scheduling_staff_certifications
-- ---------------------------------------------------------------------
create table if not exists public.scheduling_staff_certifications (
  user_id          uuid not null references auth.users (id) on delete cascade,
  certification_id uuid not null references public.scheduling_certifications (id) on delete cascade,
  granted_at       timestamptz not null default now(),
  primary key (user_id, certification_id)
);

-- ---------------------------------------------------------------------
-- scheduling_availability
-- ---------------------------------------------------------------------
-- One row per (user_id, week_start) for an explicit week override,
-- OR one row per user with recurring=true and week_start=null for
-- the default weekly template. Blocks are stored as a JSONB array
-- of {dow: 0..6, start_minute: 0..1440, end_minute, status} entries.
create table if not exists public.scheduling_availability (
  id           uuid primary key default gen_random_uuid(),
  facility_id  uuid not null references public.facilities (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  week_start   date,
  recurring    boolean not null default false,
  blocks       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- A user can have at most one recurring template AND at most one
  -- override per concrete week.
  constraint scheduling_availability_xor
    check ((recurring = true and week_start is null)
        or (recurring = false and week_start is not null))
);

create unique index if not exists scheduling_availability_recurring_uniq
  on public.scheduling_availability (user_id)
  where recurring = true;

create unique index if not exists scheduling_availability_week_uniq
  on public.scheduling_availability (user_id, week_start)
  where week_start is not null;

drop trigger if exists scheduling_availability_set_updated_at
  on public.scheduling_availability;
create trigger scheduling_availability_set_updated_at
  before update on public.scheduling_availability
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- scheduling_schedules
-- ---------------------------------------------------------------------
create table if not exists public.scheduling_schedules (
  id            uuid primary key default gen_random_uuid(),
  facility_id   uuid not null references public.facilities (id) on delete cascade,
  week_start    date not null,
  status        text not null default 'draft' check (status in ('draft', 'published')),
  created_by    uuid not null references auth.users (id),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One schedule per (facility, week).
create unique index if not exists scheduling_schedules_facility_week_uniq
  on public.scheduling_schedules (facility_id, week_start);

drop trigger if exists scheduling_schedules_set_updated_at
  on public.scheduling_schedules;
create trigger scheduling_schedules_set_updated_at
  before update on public.scheduling_schedules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- scheduling_shifts
-- ---------------------------------------------------------------------
create table if not exists public.scheduling_shifts (
  id           uuid primary key default gen_random_uuid(),
  schedule_id  uuid not null references public.scheduling_schedules (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  position_id  uuid not null references public.scheduling_positions (id) on delete restrict,
  start_at     timestamptz not null,
  end_at       timestamptz not null check (end_at > start_at),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists scheduling_shifts_schedule_user_idx
  on public.scheduling_shifts (schedule_id, user_id, start_at);

drop trigger if exists scheduling_shifts_set_updated_at
  on public.scheduling_shifts;
create trigger scheduling_shifts_set_updated_at
  before update on public.scheduling_shifts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

-- Positions ------------------------------------------------------------
alter table public.scheduling_positions enable row level security;
alter table public.scheduling_positions force row level security;

drop policy if exists scheduling_positions_select on public.scheduling_positions;
create policy scheduling_positions_select
  on public.scheduling_positions for select to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists scheduling_positions_write_admin on public.scheduling_positions;
create policy scheduling_positions_write_admin
  on public.scheduling_positions for all to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  )
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  );

-- Certifications -------------------------------------------------------
alter table public.scheduling_certifications enable row level security;
alter table public.scheduling_certifications force row level security;

drop policy if exists scheduling_certifications_select on public.scheduling_certifications;
create policy scheduling_certifications_select
  on public.scheduling_certifications for select to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists scheduling_certifications_write_admin on public.scheduling_certifications;
create policy scheduling_certifications_write_admin
  on public.scheduling_certifications for all to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  )
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  );

-- Position certifications junction ------------------------------------
alter table public.scheduling_position_certifications enable row level security;
alter table public.scheduling_position_certifications force row level security;

drop policy if exists scheduling_position_certifications_select on public.scheduling_position_certifications;
create policy scheduling_position_certifications_select
  on public.scheduling_position_certifications for select to authenticated
  using (
    exists (
      select 1 from public.scheduling_positions p
      where p.id = position_id
        and p.facility_id = (select public.get_user_facility_id())
    )
  );

drop policy if exists scheduling_position_certifications_write_admin on public.scheduling_position_certifications;
create policy scheduling_position_certifications_write_admin
  on public.scheduling_position_certifications for all to authenticated
  using (
    (select public.get_user_role()) = 'admin'
    and exists (
      select 1 from public.scheduling_positions p
      where p.id = position_id
        and p.facility_id = (select public.get_user_facility_id())
    )
  )
  with check (
    (select public.get_user_role()) = 'admin'
    and exists (
      select 1 from public.scheduling_positions p
      where p.id = position_id
        and p.facility_id = (select public.get_user_facility_id())
    )
  );

-- Staff certifications -------------------------------------------------
alter table public.scheduling_staff_certifications enable row level security;
alter table public.scheduling_staff_certifications force row level security;

drop policy if exists scheduling_staff_certifications_select on public.scheduling_staff_certifications;
create policy scheduling_staff_certifications_select
  on public.scheduling_staff_certifications for select to authenticated
  using (
    exists (
      select 1 from public.scheduling_certifications c
      where c.id = certification_id
        and c.facility_id = (select public.get_user_facility_id())
    )
  );

drop policy if exists scheduling_staff_certifications_write_admin on public.scheduling_staff_certifications;
create policy scheduling_staff_certifications_write_admin
  on public.scheduling_staff_certifications for all to authenticated
  using (
    (select public.get_user_role()) = 'admin'
    and exists (
      select 1 from public.scheduling_certifications c
      where c.id = certification_id
        and c.facility_id = (select public.get_user_facility_id())
    )
  )
  with check (
    (select public.get_user_role()) = 'admin'
    and exists (
      select 1 from public.scheduling_certifications c
      where c.id = certification_id
        and c.facility_id = (select public.get_user_facility_id())
    )
  );

-- Availability ---------------------------------------------------------
alter table public.scheduling_availability enable row level security;
alter table public.scheduling_availability force row level security;

drop policy if exists scheduling_availability_select on public.scheduling_availability;
create policy scheduling_availability_select
  on public.scheduling_availability for select to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists scheduling_availability_write_self on public.scheduling_availability;
create policy scheduling_availability_write_self
  on public.scheduling_availability for all to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and user_id = (select auth.uid())
  )
  with check (
    facility_id = (select public.get_user_facility_id())
    and user_id = (select auth.uid())
  );

-- Schedules ------------------------------------------------------------
alter table public.scheduling_schedules enable row level security;
alter table public.scheduling_schedules force row level security;

drop policy if exists scheduling_schedules_select on public.scheduling_schedules;
create policy scheduling_schedules_select
  on public.scheduling_schedules for select to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (
      status = 'published'
      or (select public.is_manager_or_admin())
    )
  );

drop policy if exists scheduling_schedules_write_manager on public.scheduling_schedules;
create policy scheduling_schedules_write_manager
  on public.scheduling_schedules for all to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.is_manager_or_admin())
  )
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.is_manager_or_admin())
  );

-- Shifts ---------------------------------------------------------------
alter table public.scheduling_shifts enable row level security;
alter table public.scheduling_shifts force row level security;

drop policy if exists scheduling_shifts_select on public.scheduling_shifts;
create policy scheduling_shifts_select
  on public.scheduling_shifts for select to authenticated
  using (
    exists (
      select 1 from public.scheduling_schedules s
      where s.id = schedule_id
        and s.facility_id = (select public.get_user_facility_id())
        and (
          s.status = 'published'
          or (select public.is_manager_or_admin())
        )
    )
  );

drop policy if exists scheduling_shifts_write_manager on public.scheduling_shifts;
create policy scheduling_shifts_write_manager
  on public.scheduling_shifts for all to authenticated
  using (
    (select public.is_manager_or_admin())
    and exists (
      select 1 from public.scheduling_schedules s
      where s.id = schedule_id
        and s.facility_id = (select public.get_user_facility_id())
    )
  )
  with check (
    (select public.is_manager_or_admin())
    and exists (
      select 1 from public.scheduling_schedules s
      where s.id = schedule_id
        and s.facility_id = (select public.get_user_facility_id())
    )
  );

grant select, insert, update, delete on
  public.scheduling_positions,
  public.scheduling_certifications,
  public.scheduling_position_certifications,
  public.scheduling_staff_certifications,
  public.scheduling_availability,
  public.scheduling_schedules,
  public.scheduling_shifts
  to authenticated;
