-- =====================================================================
-- RinkReports 3.0 — Phase 2B: Ice Operations data model
-- Migration: 006_ice_operations.sql
--
-- Creates the four tables that back the Ice Operations module:
--
--   * ice_operation_types        — admin-configurable operation
--                                  categories (e.g. Ice Cut, Edging,
--                                  Blade Change). Each row becomes a
--                                  tab on /ice-operations.
--   * ice_operation_type_fields  — ordered custom fields per operation
--                                  type. Same shape as
--                                  daily_report_items: text/long_text/
--                                  number/checkbox/dropdown.
--   * ice_equipment              — admin-configurable list of named
--                                  equipment items (e.g. "Zamboni #1",
--                                  "Edger #2"). Per the user spec
--                                  every operation entry must select
--                                  one. `active` lets admins retire
--                                  equipment without losing history.
--   * ice_operations             — one row per logged operation.
--                                  Append-only. submitted_by IS the
--                                  operator (per spec). Retained for
--                                  90 days, then deleted by pg_cron.
--
-- CLAUDE.md rules:
--   Rule 1: facility_id is set server-side from get_user_facility_id()
--           or by the tRPC / /api/sync handler. Never client input.
--   Rule 2: every dropdown / tab / equipment value is admin-entered.
--           No business-data seeds (Rule 4) — tables land empty.
--   Rule 8: RLS at the DB AND the server. Force RLS on every table.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ice_operation_types
-- ---------------------------------------------------------------------
create table if not exists public.ice_operation_types (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ice_operation_types_facility_position_idx
  on public.ice_operation_types (facility_id, position);

drop trigger if exists ice_operation_types_set_updated_at
  on public.ice_operation_types;
create trigger ice_operation_types_set_updated_at
  before update on public.ice_operation_types
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- ice_operation_type_fields
-- ---------------------------------------------------------------------
create table if not exists public.ice_operation_type_fields (
  id                 uuid primary key default gen_random_uuid(),
  operation_type_id  uuid not null references public.ice_operation_types (id) on delete cascade,
  position           integer not null default 0,
  label              text not null check (char_length(label) between 1 and 200),
  type               text not null check (type in ('text', 'long_text', 'number', 'checkbox', 'dropdown')),
  required           boolean not null default false,
  options            jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint ice_operation_type_fields_options_shape check (
    (type = 'dropdown' and jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 1)
    or (type <> 'dropdown' and options is null)
  )
);

create index if not exists ice_operation_type_fields_op_position_idx
  on public.ice_operation_type_fields (operation_type_id, position);

drop trigger if exists ice_operation_type_fields_set_updated_at
  on public.ice_operation_type_fields;
create trigger ice_operation_type_fields_set_updated_at
  before update on public.ice_operation_type_fields
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- ice_equipment
-- ---------------------------------------------------------------------
create table if not exists public.ice_equipment (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  position    integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ice_equipment_facility_position_idx
  on public.ice_equipment (facility_id, position);

drop trigger if exists ice_equipment_set_updated_at
  on public.ice_equipment;
create trigger ice_equipment_set_updated_at
  before update on public.ice_equipment
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- ice_operations
-- ---------------------------------------------------------------------
create table if not exists public.ice_operations (
  id                uuid primary key default gen_random_uuid(),
  facility_id       uuid not null references public.facilities (id) on delete cascade,
  -- restrict so admins can't delete an operation type that has logged
  -- entries without first archiving the history.
  operation_type_id uuid not null references public.ice_operation_types (id) on delete restrict,
  equipment_id      uuid not null references public.ice_equipment (id) on delete restrict,
  submitted_at      timestamptz not null default now(),
  submitted_by      uuid not null references auth.users (id) on delete cascade,
  answers           jsonb not null,
  local_id          text,
  created_at        timestamptz not null default now()
);

create index if not exists ice_operations_facility_submitted_at_idx
  on public.ice_operations (facility_id, submitted_at desc);

create index if not exists ice_operations_facility_op_type_idx
  on public.ice_operations (facility_id, operation_type_id, submitted_at desc);

create unique index if not exists ice_operations_facility_local_id_uniq
  on public.ice_operations (facility_id, local_id)
  where local_id is not null;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

-- ice_operation_types ---------------------------------------------------
alter table public.ice_operation_types enable row level security;
alter table public.ice_operation_types force row level security;

drop policy if exists ice_operation_types_select on public.ice_operation_types;
create policy ice_operation_types_select
  on public.ice_operation_types
  for select
  to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists ice_operation_types_insert_admin on public.ice_operation_types;
create policy ice_operation_types_insert_admin
  on public.ice_operation_types
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  );

drop policy if exists ice_operation_types_update_admin on public.ice_operation_types;
create policy ice_operation_types_update_admin
  on public.ice_operation_types
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

drop policy if exists ice_operation_types_delete_admin on public.ice_operation_types;
create policy ice_operation_types_delete_admin
  on public.ice_operation_types
  for delete
  to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  );

-- ice_operation_type_fields --------------------------------------------
alter table public.ice_operation_type_fields enable row level security;
alter table public.ice_operation_type_fields force row level security;

drop policy if exists ice_operation_type_fields_select on public.ice_operation_type_fields;
create policy ice_operation_type_fields_select
  on public.ice_operation_type_fields
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ice_operation_types t
      where t.id = operation_type_id
        and t.facility_id = (select public.get_user_facility_id())
    )
  );

drop policy if exists ice_operation_type_fields_insert_admin on public.ice_operation_type_fields;
create policy ice_operation_type_fields_insert_admin
  on public.ice_operation_type_fields
  for insert
  to authenticated
  with check (
    (select public.get_user_role()) = 'admin'
    and exists (
      select 1
      from public.ice_operation_types t
      where t.id = operation_type_id
        and t.facility_id = (select public.get_user_facility_id())
    )
  );

drop policy if exists ice_operation_type_fields_update_admin on public.ice_operation_type_fields;
create policy ice_operation_type_fields_update_admin
  on public.ice_operation_type_fields
  for update
  to authenticated
  using (
    (select public.get_user_role()) = 'admin'
    and exists (
      select 1
      from public.ice_operation_types t
      where t.id = operation_type_id
        and t.facility_id = (select public.get_user_facility_id())
    )
  )
  with check (
    (select public.get_user_role()) = 'admin'
    and exists (
      select 1
      from public.ice_operation_types t
      where t.id = operation_type_id
        and t.facility_id = (select public.get_user_facility_id())
    )
  );

drop policy if exists ice_operation_type_fields_delete_admin on public.ice_operation_type_fields;
create policy ice_operation_type_fields_delete_admin
  on public.ice_operation_type_fields
  for delete
  to authenticated
  using (
    (select public.get_user_role()) = 'admin'
    and exists (
      select 1
      from public.ice_operation_types t
      where t.id = operation_type_id
        and t.facility_id = (select public.get_user_facility_id())
    )
  );

-- ice_equipment --------------------------------------------------------
alter table public.ice_equipment enable row level security;
alter table public.ice_equipment force row level security;

drop policy if exists ice_equipment_select on public.ice_equipment;
create policy ice_equipment_select
  on public.ice_equipment
  for select
  to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists ice_equipment_insert_admin on public.ice_equipment;
create policy ice_equipment_insert_admin
  on public.ice_equipment
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  );

drop policy if exists ice_equipment_update_admin on public.ice_equipment;
create policy ice_equipment_update_admin
  on public.ice_equipment
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

drop policy if exists ice_equipment_delete_admin on public.ice_equipment;
create policy ice_equipment_delete_admin
  on public.ice_equipment
  for delete
  to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  );

-- ice_operations -------------------------------------------------------
alter table public.ice_operations enable row level security;
alter table public.ice_operations force row level security;

drop policy if exists ice_operations_select on public.ice_operations;
create policy ice_operations_select
  on public.ice_operations
  for select
  to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists ice_operations_insert on public.ice_operations;
create policy ice_operations_insert
  on public.ice_operations
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and submitted_by = (select auth.uid())
  );

-- No update / delete policies on ice_operations: append-only.

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant select, insert, update, delete on
  public.ice_operation_types,
  public.ice_operation_type_fields,
  public.ice_equipment,
  public.ice_operations
  to authenticated;

-- ---------------------------------------------------------------------
-- pg_cron retention job (90 days)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'delete-old-ice-operations') then
    perform cron.unschedule('delete-old-ice-operations');
  end if;
  perform cron.schedule(
    'delete-old-ice-operations',
    '15 */6 * * *',
    $sql$ delete from public.ice_operations where submitted_at < now() - interval '90 days' $sql$
  );
end$$;
