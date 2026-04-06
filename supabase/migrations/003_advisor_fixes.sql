-- =====================================================================
-- RinkReports 3.0 — Phase 0 Advisor Cleanups
-- Migration: 003_advisor_fixes.sql
--
-- Resolves the following lints surfaced by Supabase advisors after
-- 001_foundation.sql landed:
--
--   * function_search_path_mutable on public.set_updated_at
--   * auth_rls_initplan on user_profiles_select_self_or_facility,
--     user_profiles_update_self, sync_log_insert_own
--     (auth.uid() must be wrapped as (select auth.uid()) so it is
--     evaluated once per statement, not per row)
--   * multiple_permissive_policies on user_profiles (SELECT, UPDATE),
--     facility_modules (SELECT), facility_config (SELECT)
--     (the *_admin_* policies were declared `for all` and overlapped
--     the dedicated read policies; replace them with narrower
--     INSERT/UPDATE/DELETE policies and fold the self-update path
--     into a single UPDATE policy.)
--
-- The semantic outcome is identical: members of a facility see their
-- own rows, admins of a facility may write any row in their facility,
-- users may update their own profile. CLAUDE.md Rule 8 still holds.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. set_updated_at — pin search_path
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. user_profiles policies — drop the overlapping ones, rebuild
-- ---------------------------------------------------------------------
drop policy if exists user_profiles_select_self_or_facility on public.user_profiles;
drop policy if exists user_profiles_update_self            on public.user_profiles;
drop policy if exists user_profiles_admin_manage           on public.user_profiles;

create policy user_profiles_select
  on public.user_profiles
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or facility_id = (select public.get_user_facility_id())
  );

create policy user_profiles_insert_admin
  on public.user_profiles
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and public.get_user_role() = 'admin'
  );

create policy user_profiles_update
  on public.user_profiles
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      facility_id = (select public.get_user_facility_id())
      and public.get_user_role() = 'admin'
    )
  )
  with check (
    (
      user_id = (select auth.uid())
      and facility_id = (select public.get_user_facility_id())
    )
    or (
      facility_id = (select public.get_user_facility_id())
      and public.get_user_role() = 'admin'
    )
  );

create policy user_profiles_delete_admin
  on public.user_profiles
  for delete
  to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and public.get_user_role() = 'admin'
  );

-- ---------------------------------------------------------------------
-- 3. facility_modules — split the for-all admin policy
-- ---------------------------------------------------------------------
drop policy if exists facility_modules_admin_write on public.facility_modules;

create policy facility_modules_insert_admin
  on public.facility_modules
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and public.get_user_role() = 'admin'
  );

create policy facility_modules_update_admin
  on public.facility_modules
  for update
  to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and public.get_user_role() = 'admin'
  )
  with check (
    facility_id = (select public.get_user_facility_id())
    and public.get_user_role() = 'admin'
  );

create policy facility_modules_delete_admin
  on public.facility_modules
  for delete
  to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and public.get_user_role() = 'admin'
  );

-- ---------------------------------------------------------------------
-- 4. facility_config — split the for-all admin policy
-- ---------------------------------------------------------------------
drop policy if exists facility_config_admin_write on public.facility_config;

create policy facility_config_insert_admin
  on public.facility_config
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and public.get_user_role() = 'admin'
  );

create policy facility_config_update_admin
  on public.facility_config
  for update
  to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and public.get_user_role() = 'admin'
  )
  with check (
    facility_id = (select public.get_user_facility_id())
    and public.get_user_role() = 'admin'
  );

create policy facility_config_delete_admin
  on public.facility_config
  for delete
  to authenticated
  using (
    facility_id = (select public.get_user_facility_id())
    and public.get_user_role() = 'admin'
  );

-- ---------------------------------------------------------------------
-- 5. sync_log_insert_own — wrap auth.uid() in a select
-- ---------------------------------------------------------------------
drop policy if exists sync_log_insert_own on public.sync_log;

create policy sync_log_insert_own
  on public.sync_log
  for insert
  to authenticated
  with check (
    facility_id = (select public.get_user_facility_id())
    and user_id = (select auth.uid())
  );
