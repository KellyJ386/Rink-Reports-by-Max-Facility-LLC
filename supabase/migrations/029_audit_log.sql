-- =====================================================================
-- RinkReports 3.0 — SOC2 Audit Logging
-- Migration: 029_audit_log.sql
--
-- Implements append-only audit log for all admin mutations.
-- Every admin action is logged with before/after snapshots,
-- user context, and network info. No UPDATE or DELETE policies —
-- audit log is immutable by design.
-- =====================================================================

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references public.facilities(id) on delete set null,
  user_id uuid not null references auth.users(id),
  user_email text not null,
  user_role text not null,
  action text not null,
  resource_type text not null,
  resource_id text,
  before_snapshot jsonb,
  after_snapshot jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_facility_created
  on public.audit_log(facility_id, created_at desc);

create index if not exists idx_audit_log_user_created
  on public.audit_log(user_id, created_at desc);

alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

-- Admins (and super_admins) can read audit_log for their facility.
-- No UPDATE or DELETE policies — append-only by design.
drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log for select
  using (
    facility_id = public.get_user_facility_id()
    and (select public.is_admin_or_higher())
  );

grant select on public.audit_log to authenticated;
