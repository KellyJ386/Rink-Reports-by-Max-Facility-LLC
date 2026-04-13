-- =====================================================================
-- RinkReports 3.0 — Migration 030: Scheduling V2
--
-- Extends the scheduling module (011_scheduling.sql) with:
--   * scheduling_areas           — facility areas / tabs
--   * scheduling_employees       — scheduling-specific employee metadata
--   * scheduling_templates       — saved weekly schedule templates
--   * scheduling_template_shifts — shifts within a template
--   * scheduling_time_off_requests — time-off request lifecycle
--   * scheduling_shift_swaps     — shift swap request lifecycle
--   * scheduling_notifications   — in-app scheduling notification log
--   * scheduling_facility_config — per-facility scheduling settings
--
-- Also ALTERs:
--   * scheduling_shifts   — adds is_mod, is_open, area_id, status;
--                           makes user_id nullable (open shifts)
--   * scheduling_schedules — adds is_locked
--
-- CLAUDE.md rules:
--   Rule 1: facility_id is server-side only.
--   Rule 4: tables land empty.
--   Rule 8: RLS at the DB AND the server.
-- =====================================================================

-- =====================================================================
-- ALTER existing tables
-- =====================================================================

-- scheduling_shifts: make user_id nullable for open shifts, add new cols
alter table public.scheduling_shifts
  alter column user_id drop not null;

alter table public.scheduling_shifts
  add column if not exists is_mod boolean not null default false,
  add column if not exists is_open boolean not null default false,
  add column if not exists area_id uuid,
  add column if not exists status text not null default 'unconfirmed'
    check (status in ('confirmed', 'unconfirmed'));

-- scheduling_schedules: add is_locked
alter table public.scheduling_schedules
  add column if not exists is_locked boolean not null default false;

-- Performance index for cross-schedule double-booking detection
create index if not exists scheduling_shifts_user_time_idx
  on public.scheduling_shifts (user_id, start_at, end_at)
  where user_id is not null;

-- =====================================================================
-- scheduling_areas
-- =====================================================================
create table if not exists public.scheduling_areas (
  id            uuid primary key default gen_random_uuid(),
  facility_id   uuid not null references public.facilities (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 120),
  display_order integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists scheduling_areas_facility_order_idx
  on public.scheduling_areas (facility_id, display_order);

drop trigger if exists scheduling_areas_set_updated_at
  on public.scheduling_areas;
create trigger scheduling_areas_set_updated_at
  before update on public.scheduling_areas
  for each row execute function public.set_updated_at();

-- FK from scheduling_shifts.area_id → scheduling_areas
alter table public.scheduling_shifts
  add constraint scheduling_shifts_area_id_fkey
  foreign key (area_id) references public.scheduling_areas (id)
  on delete set null;

-- =====================================================================
-- scheduling_employees
-- =====================================================================
create table if not exists public.scheduling_employees (
  id              uuid primary key default gen_random_uuid(),
  facility_id     uuid not null references public.facilities (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 200),
  email           text,
  phone           text,
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time')),
  home_area_id    uuid references public.scheduling_areas (id) on delete set null,
  hire_date       date,
  is_active       boolean not null default true,
  max_hours_week  numeric(5,2),
  min_hours_week  numeric(5,2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One scheduling profile per user per facility
create unique index if not exists scheduling_employees_user_facility_uniq
  on public.scheduling_employees (user_id, facility_id);

create index if not exists scheduling_employees_facility_active_idx
  on public.scheduling_employees (facility_id, is_active);

drop trigger if exists scheduling_employees_set_updated_at
  on public.scheduling_employees;
create trigger scheduling_employees_set_updated_at
  before update on public.scheduling_employees
  for each row execute function public.set_updated_at();

-- =====================================================================
-- scheduling_templates
-- =====================================================================
create table if not exists public.scheduling_templates (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now()
);

create index if not exists scheduling_templates_facility_idx
  on public.scheduling_templates (facility_id);

-- =====================================================================
-- scheduling_template_shifts
-- =====================================================================
create table if not exists public.scheduling_template_shifts (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.scheduling_templates (id) on delete cascade,
  position_id  uuid not null references public.scheduling_positions (id) on delete cascade,
  area_id      uuid references public.scheduling_areas (id) on delete set null,
  day_of_week  integer not null check (day_of_week between 0 and 6),
  start_time   time not null,
  end_time     time not null,
  is_mod       boolean not null default false
);

create index if not exists scheduling_template_shifts_template_idx
  on public.scheduling_template_shifts (template_id);

-- =====================================================================
-- scheduling_time_off_requests
-- =====================================================================
create table if not exists public.scheduling_time_off_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.scheduling_employees (id) on delete cascade,
  facility_id  uuid not null references public.facilities (id) on delete cascade,
  start_date   date not null,
  end_date     date not null check (end_date >= start_date),
  category     text not null check (category in ('vacation', 'sick', 'personal', 'unpaid')),
  status       text not null default 'pending'
    check (status in ('pending', 'approved', 'denied')),
  reason       text,
  admin_note   text,
  requested_at timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references auth.users (id)
);

create index if not exists scheduling_time_off_facility_status_idx
  on public.scheduling_time_off_requests (facility_id, status);

create index if not exists scheduling_time_off_employee_date_idx
  on public.scheduling_time_off_requests (employee_id, start_date);

-- =====================================================================
-- scheduling_shift_swaps
-- =====================================================================
create table if not exists public.scheduling_shift_swaps (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references public.facilities (id) on delete cascade,
  requester_shift_id  uuid not null references public.scheduling_shifts (id) on delete cascade,
  target_shift_id     uuid references public.scheduling_shifts (id) on delete set null,
  requester_id        uuid not null references public.scheduling_employees (id) on delete cascade,
  target_employee_id  uuid references public.scheduling_employees (id) on delete set null,
  status              text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'cancelled')),
  requires_approval   boolean not null default true,
  approved_by         uuid references auth.users (id),
  requested_at        timestamptz not null default now(),
  resolved_at         timestamptz
);

create index if not exists scheduling_shift_swaps_facility_status_idx
  on public.scheduling_shift_swaps (facility_id, status);

create index if not exists scheduling_shift_swaps_requester_idx
  on public.scheduling_shift_swaps (requester_id);

-- =====================================================================
-- scheduling_notifications
-- =====================================================================
create table if not exists public.scheduling_notifications (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.scheduling_employees (id) on delete cascade,
  facility_id uuid not null references public.facilities (id) on delete cascade,
  event_type  text not null,
  message     text not null,
  payload     jsonb not null default '{}'::jsonb,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists scheduling_notifications_employee_read_idx
  on public.scheduling_notifications (employee_id, is_read);

create index if not exists scheduling_notifications_facility_created_idx
  on public.scheduling_notifications (facility_id, created_at desc);

-- =====================================================================
-- scheduling_facility_config
-- =====================================================================
create table if not exists public.scheduling_facility_config (
  facility_id            uuid primary key references public.facilities (id) on delete cascade,
  swap_requires_approval boolean not null default true,
  pickup_notice_hours    integer not null default 24,
  swap_notice_hours      integer not null default 48,
  availability_deadline_day integer not null default 20,
  email_events           jsonb not null default '[]'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists scheduling_facility_config_set_updated_at
  on public.scheduling_facility_config;
create trigger scheduling_facility_config_set_updated_at
  before update on public.scheduling_facility_config
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Row Level Security
-- =====================================================================

-- scheduling_areas ------------------------------------------------
alter table public.scheduling_areas enable row level security;
alter table public.scheduling_areas force row level security;

drop policy if exists scheduling_areas_select on public.scheduling_areas;
create policy scheduling_areas_select
  on public.scheduling_areas for select to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists scheduling_areas_write_admin on public.scheduling_areas;
create policy scheduling_areas_write_admin
  on public.scheduling_areas for all to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) in ('admin', 'super_admin')
  )
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) in ('admin', 'super_admin')
  );

-- scheduling_employees --------------------------------------------
alter table public.scheduling_employees enable row level security;
alter table public.scheduling_employees force row level security;

drop policy if exists scheduling_employees_select on public.scheduling_employees;
create policy scheduling_employees_select
  on public.scheduling_employees for select to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists scheduling_employees_write_admin on public.scheduling_employees;
create policy scheduling_employees_write_admin
  on public.scheduling_employees for all to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) in ('admin', 'super_admin')
  )
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) in ('admin', 'super_admin')
  );

-- scheduling_templates --------------------------------------------
alter table public.scheduling_templates enable row level security;
alter table public.scheduling_templates force row level security;

drop policy if exists scheduling_templates_select on public.scheduling_templates;
create policy scheduling_templates_select
  on public.scheduling_templates for select to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.is_manager_or_admin())
  );

drop policy if exists scheduling_templates_write_manager on public.scheduling_templates;
create policy scheduling_templates_write_manager
  on public.scheduling_templates for all to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.is_manager_or_admin())
  )
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.is_manager_or_admin())
  );

-- scheduling_template_shifts --------------------------------------
alter table public.scheduling_template_shifts enable row level security;
alter table public.scheduling_template_shifts force row level security;

drop policy if exists scheduling_template_shifts_select on public.scheduling_template_shifts;
create policy scheduling_template_shifts_select
  on public.scheduling_template_shifts for select to authenticated
  using (
    exists (
      select 1 from public.scheduling_templates t
      where t.id = template_id
        and t.facility_id = (select public.get_user_facility_id())
        and (select public.is_manager_or_admin())
    )
  );

drop policy if exists scheduling_template_shifts_write_manager on public.scheduling_template_shifts;
create policy scheduling_template_shifts_write_manager
  on public.scheduling_template_shifts for all to authenticated
  using (
    (select public.is_manager_or_admin())
    and exists (
      select 1 from public.scheduling_templates t
      where t.id = template_id
        and t.facility_id = (select public.get_user_facility_id())
    )
  )
  with check (
    (select public.is_manager_or_admin())
    and exists (
      select 1 from public.scheduling_templates t
      where t.id = template_id
        and t.facility_id = (select public.get_user_facility_id())
    )
  );

-- scheduling_time_off_requests ------------------------------------
alter table public.scheduling_time_off_requests enable row level security;
alter table public.scheduling_time_off_requests force row level security;

-- Staff can read their own requests
drop policy if exists scheduling_time_off_select_own on public.scheduling_time_off_requests;
create policy scheduling_time_off_select_own
  on public.scheduling_time_off_requests for select to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (
      -- Own requests via employee_id → user_id
      exists (
        select 1 from public.scheduling_employees e
        where e.id = employee_id
          and e.user_id = (select auth.uid())
      )
      -- Or manager/admin sees all
      or (select public.is_manager_or_admin())
    )
  );

-- Staff can insert their own requests
drop policy if exists scheduling_time_off_insert_own on public.scheduling_time_off_requests;
create policy scheduling_time_off_insert_own
  on public.scheduling_time_off_requests for insert to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and exists (
      select 1 from public.scheduling_employees e
      where e.id = employee_id
        and e.user_id = (select auth.uid())
    )
  );

-- Manager/admin can update (approve/deny)
drop policy if exists scheduling_time_off_update_manager on public.scheduling_time_off_requests;
create policy scheduling_time_off_update_manager
  on public.scheduling_time_off_requests for update to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (
      (select public.is_manager_or_admin())
      or exists (
        select 1 from public.scheduling_employees e
        where e.id = employee_id
          and e.user_id = (select auth.uid())
      )
    )
  )
  with check (
    facility_id = (select public.get_user_facility_id())
  );

-- scheduling_shift_swaps ------------------------------------------
alter table public.scheduling_shift_swaps enable row level security;
alter table public.scheduling_shift_swaps force row level security;

drop policy if exists scheduling_shift_swaps_select on public.scheduling_shift_swaps;
create policy scheduling_shift_swaps_select
  on public.scheduling_shift_swaps for select to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (
      exists (
        select 1 from public.scheduling_employees e
        where e.id = requester_id
          and e.user_id = (select auth.uid())
      )
      or exists (
        select 1 from public.scheduling_employees e
        where e.id = target_employee_id
          and e.user_id = (select auth.uid())
      )
      or (select public.is_manager_or_admin())
    )
  );

drop policy if exists scheduling_shift_swaps_insert_own on public.scheduling_shift_swaps;
create policy scheduling_shift_swaps_insert_own
  on public.scheduling_shift_swaps for insert to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and exists (
      select 1 from public.scheduling_employees e
      where e.id = requester_id
        and e.user_id = (select auth.uid())
    )
  );

drop policy if exists scheduling_shift_swaps_update on public.scheduling_shift_swaps;
create policy scheduling_shift_swaps_update
  on public.scheduling_shift_swaps for update to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (
      (select public.is_manager_or_admin())
      or exists (
        select 1 from public.scheduling_employees e
        where e.id = requester_id
          and e.user_id = (select auth.uid())
      )
    )
  )
  with check (
    facility_id = (select public.get_user_facility_id())
  );

-- scheduling_notifications ----------------------------------------
alter table public.scheduling_notifications enable row level security;
alter table public.scheduling_notifications force row level security;

drop policy if exists scheduling_notifications_select on public.scheduling_notifications;
create policy scheduling_notifications_select
  on public.scheduling_notifications for select to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (
      exists (
        select 1 from public.scheduling_employees e
        where e.id = employee_id
          and e.user_id = (select auth.uid())
      )
      or (select public.is_manager_or_admin())
    )
  );

-- Only server-side inserts (via service role or manager context)
drop policy if exists scheduling_notifications_insert on public.scheduling_notifications;
create policy scheduling_notifications_insert
  on public.scheduling_notifications for insert to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
  );

-- Users can mark their own notifications as read
drop policy if exists scheduling_notifications_update_own on public.scheduling_notifications;
create policy scheduling_notifications_update_own
  on public.scheduling_notifications for update to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and exists (
      select 1 from public.scheduling_employees e
      where e.id = employee_id
        and e.user_id = (select auth.uid())
    )
  )
  with check (
    facility_id = (select public.get_user_facility_id())
  );

-- scheduling_facility_config --------------------------------------
alter table public.scheduling_facility_config enable row level security;
alter table public.scheduling_facility_config force row level security;

drop policy if exists scheduling_facility_config_select on public.scheduling_facility_config;
create policy scheduling_facility_config_select
  on public.scheduling_facility_config for select to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists scheduling_facility_config_write_admin on public.scheduling_facility_config;
create policy scheduling_facility_config_write_admin
  on public.scheduling_facility_config for all to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) in ('admin', 'super_admin')
  )
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) in ('admin', 'super_admin')
  );

-- =====================================================================
-- Grants
-- =====================================================================
grant select, insert, update, delete on
  public.scheduling_areas,
  public.scheduling_employees,
  public.scheduling_templates,
  public.scheduling_template_shifts,
  public.scheduling_time_off_requests,
  public.scheduling_shift_swaps,
  public.scheduling_notifications,
  public.scheduling_facility_config
  to authenticated;
