-- =====================================================================
-- RinkReports 3.0 — Admin Control Center expansion
-- Migration: 014_admin_control_center.sql
--
-- Brings the data model in line with the 10-section Admin Control
-- Center spec:
--
--   1.  Facility Profile      → adds address, contact, unit prefs to facilities
--   2.  Daily Report Tabs     → no schema change, existing
--   3.  Ice Operations Config → no schema change, existing
--   4.  Ice Depth Templates   → no schema change, existing
--   5.  Refrigeration Config  → no schema change, existing
--   6.  Air Quality Thresholds→ no schema change, existing
--   7.  Positions & Certs     → no schema change, existing (lifted to top-level
--                                section in the UI; same scheduling_* tables)
--   8.  Staff Roster          → adds 'super_admin' to user_role enum
--   9.  Shift Configuration   → NEW shared facility_shifts table used by
--                                Refrigeration + Scheduling
--   10. Branding & Display    → NEW facility_branding table + private
--                                'branding' Storage bucket for logo uploads
--
-- CLAUDE.md rules:
--   Rule 1: facility_id is server-side, never client input.
--   Rule 2: every new field is admin-managed per facility, no
--           hardcoded defaults in module code.
--   Rule 8: RLS at the DB AND the server.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Facility Profile — extended columns
-- ---------------------------------------------------------------------
alter table public.facilities
  add column if not exists address_line1     text,
  add column if not exists address_line2     text,
  add column if not exists city              text,
  add column if not exists state             text,
  add column if not exists postal_code       text,
  add column if not exists country           text not null default 'us',
  add column if not exists contact_email     text,
  add column if not exists contact_phone     text,
  -- Facility-wide unit preferences. Surfaced on every report PDF and
  -- used by modules like Ice Depth as the default template unit.
  add column if not exists temp_unit         text not null default 'f'
    check (temp_unit in ('f', 'c')),
  add column if not exists length_unit       text not null default 'in'
    check (length_unit in ('in', 'mm'));

-- ---------------------------------------------------------------------
-- 8. Staff Roster — add 'super_admin' to user_role enum
-- super_admin is the cross-facility platform role used by RinkReports
-- itself and by parent organizations managing multiple facilities.
-- It is treated as strictly more privileged than 'admin'.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'super_admin'
  ) then
    alter type public.user_role add value 'super_admin' before 'admin';
  end if;
end$$;

-- Update is_manager_or_admin() so it recognizes super_admin too.
create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.user_profiles where user_id = auth.uid())
    in ('super_admin', 'admin', 'manager'),
    false
  );
$$;

-- New helper: is_admin_or_higher() — true for admin OR super_admin.
-- Replaces ad-hoc `get_user_role() = 'admin'` checks throughout the
-- platform without breaking the existing checks (admin is still
-- allowed alongside super_admin).
create or replace function public.is_admin_or_higher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.user_profiles where user_id = auth.uid())
    in ('super_admin', 'admin'),
    false
  );
$$;

revoke all on function public.is_admin_or_higher() from public;
grant execute on function public.is_admin_or_higher() to authenticated;

-- ---------------------------------------------------------------------
-- 9. Shift Configuration — facility_shifts (shared)
--
-- One row per named shift at a facility (e.g. Morning, Afternoon,
-- Overnight). Times are stored as plain time-of-day, not timestamps,
-- so the same shift definition applies every day. The Refrigeration
-- staff form picks a shift name when logging readings; the Scheduling
-- module uses these as quick-pick presets for opening declarations.
-- ---------------------------------------------------------------------
create table if not exists public.facility_shifts (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  start_time  time not null,
  end_time    time not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists facility_shifts_facility_position_idx
  on public.facility_shifts (facility_id, position);

drop trigger if exists facility_shifts_set_updated_at on public.facility_shifts;
create trigger facility_shifts_set_updated_at
  before update on public.facility_shifts
  for each row execute function public.set_updated_at();

alter table public.facility_shifts enable row level security;
alter table public.facility_shifts force row level security;

drop policy if exists facility_shifts_select on public.facility_shifts;
create policy facility_shifts_select
  on public.facility_shifts for select to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists facility_shifts_write_admin on public.facility_shifts;
create policy facility_shifts_write_admin
  on public.facility_shifts for all to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.is_admin_or_higher())
  )
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.is_admin_or_higher())
  );

grant select, insert, update, delete on public.facility_shifts to authenticated;

-- ---------------------------------------------------------------------
-- 10. Branding & Display — facility_branding
-- One row per facility holding the logo path (in the 'branding'
-- bucket), the three brand colors, and the PDF header text override.
-- ---------------------------------------------------------------------
create table if not exists public.facility_branding (
  facility_id      uuid primary key references public.facilities (id) on delete cascade,
  logo_path        text,
  primary_color    text not null default '#003B6F'
    check (primary_color   ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color  text not null default '#A5ACAF'
    check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color     text not null default '#4DFF00'
    check (accent_color    ~ '^#[0-9A-Fa-f]{6}$'),
  pdf_header_text  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists facility_branding_set_updated_at on public.facility_branding;
create trigger facility_branding_set_updated_at
  before update on public.facility_branding
  for each row execute function public.set_updated_at();

alter table public.facility_branding enable row level security;
alter table public.facility_branding force row level security;

drop policy if exists facility_branding_select on public.facility_branding;
create policy facility_branding_select
  on public.facility_branding for select to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists facility_branding_write_admin on public.facility_branding;
create policy facility_branding_write_admin
  on public.facility_branding for all to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.is_admin_or_higher())
  )
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.is_admin_or_higher())
  );

grant select, insert, update, delete on public.facility_branding to authenticated;

-- ---------------------------------------------------------------------
-- Branding Storage bucket
--
-- Logos are uploaded under "<facility_id>/<filename>" so the policies
-- can scope reads/writes to the caller's facility.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', false)
on conflict (id) do nothing;

drop policy if exists branding_read_facility on storage.objects;
create policy branding_read_facility
  on storage.objects for select to authenticated
  using (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = (
      select public.get_user_facility_id()::text
    )
  );

drop policy if exists branding_write_admin on storage.objects;
create policy branding_write_admin
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = (
      select public.get_user_facility_id()::text
    )
    and (select public.is_admin_or_higher())
  );

drop policy if exists branding_delete_admin on storage.objects;
create policy branding_delete_admin
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = (
      select public.get_user_facility_id()::text
    )
    and (select public.is_admin_or_higher())
  );
