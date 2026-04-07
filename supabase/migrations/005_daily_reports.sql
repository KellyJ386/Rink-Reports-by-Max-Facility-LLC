-- =====================================================================
-- RinkReports 3.0 — Phase 2A: Daily Reports data model
-- Migration: 005_daily_reports.sql
--
-- Creates the three tables that back the Daily Reports module:
--
--   * daily_report_checklists  — one row per checklist (tab) per
--                                facility. Admins create these.
--   * daily_report_items       — ordered items inside a checklist.
--                                Types: text, long_text, number,
--                                checkbox, dropdown. Dropdown items
--                                carry their options as a jsonb array.
--   * daily_reports            — one row per submission. Staff add
--                                these throughout the day. Retention
--                                is enforced by a pg_cron job that
--                                deletes rows older than 30 days.
--
-- Everything is scoped to the caller's facility via
-- get_user_facility_id() and get_user_role(). Writes to the two
-- config tables are admin-only; inserts to daily_reports are allowed
-- for any authenticated member of the facility.
--
-- CLAUDE.md rules enforced:
--   Rule 1: facility_id comes from get_user_facility_id() or is set
--           server-side by the tRPC / /api/sync handlers; never
--           accepted from client input.
--   Rule 4: no business-data seeds. The tables land empty; admins
--           build their checklists in the UI.
--   Rule 8: RLS at the DB AND the server. Force RLS on every table.
-- =====================================================================

-- ---------------------------------------------------------------------
-- daily_report_checklists
-- ---------------------------------------------------------------------
create table if not exists public.daily_report_checklists (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists daily_report_checklists_facility_position_idx
  on public.daily_report_checklists (facility_id, position);

drop trigger if exists daily_report_checklists_set_updated_at
  on public.daily_report_checklists;
create trigger daily_report_checklists_set_updated_at
  before update on public.daily_report_checklists
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- daily_report_items
-- ---------------------------------------------------------------------
create table if not exists public.daily_report_items (
  id           uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.daily_report_checklists (id) on delete cascade,
  position     integer not null default 0,
  label        text not null check (char_length(label) between 1 and 200),
  type         text not null check (type in ('text', 'long_text', 'number', 'checkbox', 'dropdown')),
  required     boolean not null default false,
  options      jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Dropdown items must have at least one option; non-dropdown items must not.
  constraint daily_report_items_options_shape check (
    (type = 'dropdown' and jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 1)
    or (type <> 'dropdown' and options is null)
  )
);

create index if not exists daily_report_items_checklist_position_idx
  on public.daily_report_items (checklist_id, position);

drop trigger if exists daily_report_items_set_updated_at
  on public.daily_report_items;
create trigger daily_report_items_set_updated_at
  before update on public.daily_report_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- daily_reports
-- ---------------------------------------------------------------------
create table if not exists public.daily_reports (
  id           uuid primary key default gen_random_uuid(),
  facility_id  uuid not null references public.facilities (id) on delete cascade,
  -- Use restrict so deleting a checklist that has submissions fails
  -- loudly; admins must decide what to do with the history first.
  checklist_id uuid not null references public.daily_report_checklists (id) on delete restrict,
  submitted_at timestamptz not null default now(),
  submitted_by uuid not null references auth.users (id) on delete cascade,
  answers      jsonb not null,
  local_id     text,
  created_at   timestamptz not null default now()
);

create index if not exists daily_reports_facility_submitted_at_idx
  on public.daily_reports (facility_id, submitted_at desc);

-- Idempotency for the offline sync replay path: if the client retries
-- with the same local_id, the second insert is a duplicate-key error
-- the sync engine can ignore.
create unique index if not exists daily_reports_facility_local_id_uniq
  on public.daily_reports (facility_id, local_id)
  where local_id is not null;

-- No set_updated_at trigger on daily_reports: submissions are
-- append-only. Edits land in a later plan if at all.

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.daily_report_checklists enable row level security;
alter table public.daily_report_checklists force row level security;

drop policy if exists daily_report_checklists_select
  on public.daily_report_checklists;
create policy daily_report_checklists_select
  on public.daily_report_checklists
  for select
  to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists daily_report_checklists_insert_admin
  on public.daily_report_checklists;
create policy daily_report_checklists_insert_admin
  on public.daily_report_checklists
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  );

drop policy if exists daily_report_checklists_update_admin
  on public.daily_report_checklists;
create policy daily_report_checklists_update_admin
  on public.daily_report_checklists
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

drop policy if exists daily_report_checklists_delete_admin
  on public.daily_report_checklists;
create policy daily_report_checklists_delete_admin
  on public.daily_report_checklists
  for delete
  to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  );

-- ---------------------------------------------------------------------

alter table public.daily_report_items enable row level security;
alter table public.daily_report_items force row level security;

drop policy if exists daily_report_items_select on public.daily_report_items;
create policy daily_report_items_select
  on public.daily_report_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.daily_report_checklists c
      where c.id = checklist_id
        and c.facility_id = (select public.get_user_facility_id())
    )
  );

drop policy if exists daily_report_items_insert_admin on public.daily_report_items;
create policy daily_report_items_insert_admin
  on public.daily_report_items
  for insert
  to authenticated
  with check (
    (select public.get_user_role()) = 'admin'
    and exists (
      select 1
      from public.daily_report_checklists c
      where c.id = checklist_id
        and c.facility_id = (select public.get_user_facility_id())
    )
  );

drop policy if exists daily_report_items_update_admin on public.daily_report_items;
create policy daily_report_items_update_admin
  on public.daily_report_items
  for update
  to authenticated
  using (
    (select public.get_user_role()) = 'admin'
    and exists (
      select 1
      from public.daily_report_checklists c
      where c.id = checklist_id
        and c.facility_id = (select public.get_user_facility_id())
    )
  )
  with check (
    (select public.get_user_role()) = 'admin'
    and exists (
      select 1
      from public.daily_report_checklists c
      where c.id = checklist_id
        and c.facility_id = (select public.get_user_facility_id())
    )
  );

drop policy if exists daily_report_items_delete_admin on public.daily_report_items;
create policy daily_report_items_delete_admin
  on public.daily_report_items
  for delete
  to authenticated
  using (
    (select public.get_user_role()) = 'admin'
    and exists (
      select 1
      from public.daily_report_checklists c
      where c.id = checklist_id
        and c.facility_id = (select public.get_user_facility_id())
    )
  );

-- ---------------------------------------------------------------------

alter table public.daily_reports enable row level security;
alter table public.daily_reports force row level security;

drop policy if exists daily_reports_select on public.daily_reports;
create policy daily_reports_select
  on public.daily_reports
  for select
  to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists daily_reports_insert on public.daily_reports;
create policy daily_reports_insert
  on public.daily_reports
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and submitted_by = (select auth.uid())
  );

-- No update or delete policies on daily_reports. pg_cron runs as a
-- superuser-ish role that bypasses RLS for the retention delete.

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant select, insert, update, delete on
  public.daily_report_checklists,
  public.daily_report_items,
  public.daily_reports
  to authenticated;

-- ---------------------------------------------------------------------
-- pg_cron retention job
--
-- Runs every 6 hours and deletes any daily_reports row whose
-- submitted_at is older than 30 days. Idempotent: the DO block
-- unschedules any existing job with the same name before creating
-- the new one, so re-running this migration (or future edits to
-- the schedule) is safe.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'delete-old-daily-reports') then
    perform cron.unschedule('delete-old-daily-reports');
  end if;
  perform cron.schedule(
    'delete-old-daily-reports',
    '0 */6 * * *',
    $sql$ delete from public.daily_reports where submitted_at < now() - interval '30 days' $sql$
  );
end$$;
