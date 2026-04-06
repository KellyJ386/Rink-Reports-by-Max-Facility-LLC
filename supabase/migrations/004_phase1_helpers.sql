-- =====================================================================
-- RinkReports 3.0 — Phase 1 Admin Control Center helpers
-- Migration: 004_phase1_helpers.sql
--
-- Adds two SECURITY DEFINER helpers used by the admin tRPC router:
--
--   * list_facility_users() — returns user_id, email, role, full_name
--     for every user in the caller's facility, but ONLY when the caller
--     is themselves an admin in that facility. The function joins
--     public.user_profiles to auth.users (which the type generator
--     cannot reach from public schema) and gates access inside the
--     function body so admins of facility A can never see users of
--     facility B.
--
--   * known_modules() — returns the canonical 8 module slugs as a
--     setof text. The admin UI joins this against facility_modules so
--     the dropdown / toggle list is sourced from the database, not
--     hardcoded in TS (CLAUDE.md Rule 2).
--
-- Both functions are STABLE, run with `set search_path = public, auth`,
-- and are revoked from public + granted to authenticated.
-- =====================================================================

create or replace function public.list_facility_users()
returns table (
  user_id   uuid,
  email     text,
  role      public.user_role,
  full_name text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  caller_facility uuid;
  caller_role     public.user_role;
begin
  caller_facility := public.get_user_facility_id();
  caller_role     := public.get_user_role();

  if caller_facility is null then
    return;
  end if;

  if caller_role is null or caller_role <> 'admin' then
    return;
  end if;

  return query
    select
      up.user_id,
      u.email::text,
      up.role,
      up.full_name
    from public.user_profiles up
    join auth.users u on u.id = up.user_id
    where up.facility_id = caller_facility
    order by up.full_name nulls last, u.email;
end;
$$;

revoke all on function public.list_facility_users() from public;
grant execute on function public.list_facility_users() to authenticated;

create or replace function public.known_modules()
returns setof text
language sql
immutable
set search_path = public
as $$
  select unnest(array[
    'daily-reports',
    'ice-operations',
    'refrigeration',
    'air-quality',
    'ice-depth',
    'incidents',
    'scheduling',
    'communications'
  ]::text[]);
$$;

revoke all on function public.known_modules() from public;
grant execute on function public.known_modules() to authenticated;
