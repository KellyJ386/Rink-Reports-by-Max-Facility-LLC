-- =====================================================================
-- RinkReports 3.0 — Phase 6A: Multi-facility onboarding
-- Migration: 013_multi_facility.sql
--
-- Adds the platform-layer pieces for self-serve facility creation.
-- Anyone with a confirmed Supabase Auth account can land on
-- /onboarding and create a new facility for which they become the
-- admin. Subsequent invites happen through the existing admin user
-- management UI.
--
-- Tables:
--   * facility_subscriptions — one row per facility tracking the
--     Stripe customer + active subscription. Status defaults to
--     'trialing' on facility creation; the Stripe webhook (Phase 6B)
--     keeps it in sync. The presence of this table here in 6A lets
--     onboarding stamp the trial start date in the same transaction
--     as facility creation.
--
-- Functions:
--   * public.create_facility(p_name text, p_timezone text) →
--     SECURITY DEFINER; inserts the facility, the user_profiles row
--     (with role='admin' for the caller), the trialing
--     facility_subscriptions row, and seeds the module catalog so
--     the new admin can immediately enable modules. Returns the new
--     facility id.
--
-- CLAUDE.md rules:
--   Rule 1: caller's facility is the one they JUST created — the
--           function uses auth.uid() server-side, never accepts a
--           facility_id from the client.
--   Rule 4: only the seed allowed is the facility row + module list,
--           which is exactly what this function does.
--   Rule 8: RLS at the DB AND the server. The new facility_subscriptions
--           table is admin-read-only inside the facility.
-- =====================================================================

create table if not exists public.facility_subscriptions (
  facility_id            uuid primary key references public.facilities (id) on delete cascade,
  -- Stripe customer is created lazily on first checkout, so it can
  -- be null during the trial period.
  stripe_customer_id     text,
  stripe_subscription_id text,
  -- Synced from Stripe webhook in Phase 6B. Mirrors Stripe's
  -- own subscription status enum so app code can compare directly.
  status                 text not null default 'trialing'
                          check (status in (
                            'trialing',
                            'active',
                            'past_due',
                            'canceled',
                            'incomplete',
                            'incomplete_expired',
                            'unpaid',
                            'paused'
                          )),
  -- Free-form plan tag set by the checkout flow ('starter', 'pro',
  -- 'enterprise', or null while trialing).
  plan                   text,
  -- Updated by the webhook on every status change.
  current_period_end     timestamptz,
  trial_end              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists facility_subscriptions_set_updated_at
  on public.facility_subscriptions;
create trigger facility_subscriptions_set_updated_at
  before update on public.facility_subscriptions
  for each row execute function public.set_updated_at();

alter table public.facility_subscriptions enable row level security;
alter table public.facility_subscriptions force row level security;

drop policy if exists facility_subscriptions_select on public.facility_subscriptions;
create policy facility_subscriptions_select
  on public.facility_subscriptions for select to authenticated
  using (facility_id = (select public.get_user_facility_id()));

-- No insert/update/delete from the client — only the SECURITY
-- DEFINER create_facility() function (insert) and the Phase 6B
-- service-role webhook handler (update) touch this table.

grant select on public.facility_subscriptions to authenticated;

-- ---------------------------------------------------------------------
-- create_facility(p_name, p_timezone)
--
-- Atomically:
--   1. Insert a new facilities row owned by the caller
--   2. Upsert a user_profiles row for the caller pointing at the new
--      facility with role='admin'
--   3. Insert a facility_subscriptions row in 'trialing' status with
--      a 14-day trial_end
--   4. Seed the facility_modules catalog with every known module,
--      defaulting to disabled (admin enables in the Control Center)
--
-- Returns the new facility id. The whole thing runs as SECURITY
-- DEFINER so it can bypass RLS for the inserts; the function itself
-- gates access by reading auth.uid() — it never accepts a user_id
-- from the caller.
-- ---------------------------------------------------------------------
create or replace function public.create_facility(
  p_name text,
  p_timezone text default 'America/New_York'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id        uuid;
  v_facility_id    uuid;
  v_existing_fac   uuid;
  v_module         text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'create_facility: not authenticated';
  end if;

  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'create_facility: name is required';
  end if;
  if char_length(p_name) > 200 then
    raise exception 'create_facility: name too long';
  end if;

  -- Block users who already belong to a facility from creating a
  -- second one through this entry point. Multi-facility-per-user is
  -- a future capability and would need a junction table.
  select facility_id into v_existing_fac
  from public.user_profiles
  where user_id = v_user_id;

  if v_existing_fac is not null then
    raise exception 'create_facility: user is already linked to a facility';
  end if;

  insert into public.facilities (name, timezone)
  values (trim(p_name), coalesce(nullif(trim(p_timezone), ''), 'America/New_York'))
  returning id into v_facility_id;

  insert into public.user_profiles (user_id, facility_id, role, full_name)
  values (v_user_id, v_facility_id, 'admin', null)
  on conflict (user_id) do update
    set facility_id = excluded.facility_id,
        role = excluded.role;

  insert into public.facility_subscriptions
    (facility_id, status, trial_end)
  values
    (v_facility_id, 'trialing', now() + interval '14 days');

  -- Seed every known module as disabled. The admin enables what
  -- they want in the Control Center.
  for v_module in select unnest(public.known_modules()) loop
    insert into public.facility_modules (facility_id, module, enabled)
    values (v_facility_id, v_module, false)
    on conflict (facility_id, module) do nothing;
  end loop;

  return v_facility_id;
end;
$$;

revoke all on function public.create_facility(text, text) from public;
grant execute on function public.create_facility(text, text) to authenticated;
