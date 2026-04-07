-- =====================================================================
-- RinkReports 3.0 — Phase 4A: Ice Depth data model
-- Migration: 009_ice_depth.sql
--
-- Ice Depth tracks ice thickness across the rink surface using
-- admin-configured measurement templates. Each template names a set
-- of (x, y) point positions on a fixed NHL rink background. Operators
-- pick a template, walk the surface, tap each point in turn, and
-- enter a thickness value (or capture it via the Web Bluetooth
-- CaliperAdapter).
--
-- Sessions can be saved as DRAFTS (mutable, only by the submitter)
-- and later finalized to COMPLETED (immutable). Once completed, the
-- row is append-only — historical reports can't be retroactively
-- edited.
--
-- Tables:
--   * ice_depth_templates — admin-managed templates (up to 8 per
--     facility, soft cap enforced in the admin UI). Each template
--     has a unit ('in' or 'mm') and a JSONB array of up to 60 points,
--     each with a 1-based number n and normalized (x, y) coordinates
--     in [0, 1] over the rink viewport.
--   * ice_depth_sessions  — one row per measurement session. Stores
--     the picked template_id, the operator's measurement map keyed
--     by point number, the resurfacing status, free-text notes, and
--     a status flag. Sessions land in the queue with status='draft'
--     and flip to 'completed' on the final upsert.
--
-- CLAUDE.md rules:
--   Rule 1: facility_id is set server-side, never client input.
--   Rule 2: templates are admin-defined per facility. The unit
--           ('in'/'mm') is part of the template, not hardcoded.
--   Rule 4: tables land empty.
--   Rule 8: RLS at the DB AND the server.
-- =====================================================================

create table if not exists public.ice_depth_templates (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  position    integer not null default 0,
  unit        text not null default 'in' check (unit in ('in', 'mm')),
  points      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ice_depth_templates_facility_position_idx
  on public.ice_depth_templates (facility_id, position);

drop trigger if exists ice_depth_templates_set_updated_at
  on public.ice_depth_templates;
create trigger ice_depth_templates_set_updated_at
  before update on public.ice_depth_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- ice_depth_sessions
-- ---------------------------------------------------------------------
create table if not exists public.ice_depth_sessions (
  id                  uuid primary key default gen_random_uuid(),
  facility_id         uuid not null references public.facilities (id) on delete cascade,
  template_id         uuid not null references public.ice_depth_templates (id) on delete restrict,
  submitted_by        uuid not null references auth.users (id) on delete cascade,
  submitted_at        timestamptz not null default now(),
  status              text not null default 'draft' check (status in ('draft', 'completed')),
  resurfacing_status  text check (resurfacing_status in ('pre', 'mid', 'post')),
  notes               text,
  -- Map of point_number → measurement value. Numeric values stored
  -- in the template's unit (in or mm). Validated server-side at
  -- insert/upsert by the /api/sync handler.
  measurements        jsonb not null default '{}'::jsonb,
  local_id            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists ice_depth_sessions_facility_submitted_at_idx
  on public.ice_depth_sessions (facility_id, submitted_at desc);

create index if not exists ice_depth_sessions_facility_status_idx
  on public.ice_depth_sessions (facility_id, status, submitted_at desc);

create unique index if not exists ice_depth_sessions_facility_local_id_uniq
  on public.ice_depth_sessions (facility_id, local_id)
  where local_id is not null;

drop trigger if exists ice_depth_sessions_set_updated_at
  on public.ice_depth_sessions;
create trigger ice_depth_sessions_set_updated_at
  before update on public.ice_depth_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Trigger: completed sessions are immutable.
-- Once status='completed', any further UPDATE is rejected. The trigger
-- runs in addition to the RLS policy below (defense in depth).
-- ---------------------------------------------------------------------
create or replace function public.ice_depth_sessions_freeze_completed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'completed' then
    raise exception 'ice_depth_sessions: completed sessions are immutable (id=%)', old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists ice_depth_sessions_freeze_completed
  on public.ice_depth_sessions;
create trigger ice_depth_sessions_freeze_completed
  before update on public.ice_depth_sessions
  for each row execute function public.ice_depth_sessions_freeze_completed();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

-- ice_depth_templates --------------------------------------------------
alter table public.ice_depth_templates enable row level security;
alter table public.ice_depth_templates force row level security;

drop policy if exists ice_depth_templates_select on public.ice_depth_templates;
create policy ice_depth_templates_select
  on public.ice_depth_templates
  for select
  to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists ice_depth_templates_insert_admin on public.ice_depth_templates;
create policy ice_depth_templates_insert_admin
  on public.ice_depth_templates
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  );

drop policy if exists ice_depth_templates_update_admin on public.ice_depth_templates;
create policy ice_depth_templates_update_admin
  on public.ice_depth_templates
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

drop policy if exists ice_depth_templates_delete_admin on public.ice_depth_templates;
create policy ice_depth_templates_delete_admin
  on public.ice_depth_templates
  for delete
  to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and (select public.get_user_role()) = 'admin'
  );

-- ice_depth_sessions ---------------------------------------------------
alter table public.ice_depth_sessions enable row level security;
alter table public.ice_depth_sessions force row level security;

drop policy if exists ice_depth_sessions_select on public.ice_depth_sessions;
create policy ice_depth_sessions_select
  on public.ice_depth_sessions
  for select
  to authenticated
  using (facility_id = (select public.get_user_facility_id()));

drop policy if exists ice_depth_sessions_insert on public.ice_depth_sessions;
create policy ice_depth_sessions_insert
  on public.ice_depth_sessions
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and submitted_by = (select auth.uid())
  );

-- Drafts can be updated by their own submitter. The freeze trigger
-- above ensures status='completed' rows can't be updated; the policy
-- here is the second line of defense.
drop policy if exists ice_depth_sessions_update_draft on public.ice_depth_sessions;
create policy ice_depth_sessions_update_draft
  on public.ice_depth_sessions
  for update
  to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and submitted_by = (select auth.uid())
    and status = 'draft'
  )
  with check (
    facility_id = (select public.get_user_facility_id())
    and submitted_by = (select auth.uid())
  );

-- No delete policy.

grant select, insert, update, delete on
  public.ice_depth_templates,
  public.ice_depth_sessions
  to authenticated;

-- ---------------------------------------------------------------------
-- pg_cron retention: 365 days for ice depth (longer than the other
-- modules — these reports are useful for season-over-season trend
-- analysis).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'delete-old-ice-depth-sessions') then
    perform cron.unschedule('delete-old-ice-depth-sessions');
  end if;
  perform cron.schedule(
    'delete-old-ice-depth-sessions',
    '0 1 * * *',
    $sql$ delete from public.ice_depth_sessions where submitted_at < now() - interval '365 days' $sql$
  );
end$$;
