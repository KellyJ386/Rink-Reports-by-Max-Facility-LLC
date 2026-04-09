-- =====================================================================
-- RinkReports 3.0 — Phase G: Multi-Facility Roll-up
-- Migration: 028_org_roll_up.sql
--
-- Adds the org-level layer so multiple facilities can be grouped
-- under one organization and a designated org_admin can view
-- aggregated, read-only metrics across all facilities in their org.
--
-- Tables:
--   * organizations        — one org, many facilities
--   * org_memberships      — who belongs to which org in what role
--   * facilities.organization_id (new FK column)
--
-- Functions:
--   * get_user_org_ids()   — returns all org IDs the current user
--                            belongs to (used in RLS policies)
--
-- CLAUDE.md rules:
--   Rule 1: facility_id is never accepted from client input.
--           org_admin queries use ctx.organizationIds from tRPC
--           context, not any client-supplied value.
--   Rule 8: RLS at the DB AND the server. This file is the DB layer.
--           Server layer guards live in orgAdminProcedure in trpc.ts.
-- =====================================================================

-- -----------------------------------------------------------------------
-- Table: organizations
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations(owner_user_id);

-- -----------------------------------------------------------------------
-- Table: org_memberships
-- Maps users to organizations with an org-level role.
-- user_profiles.role is UNCHANGED — it remains facility-scoped.
-- org_admin/org_viewer are orthogonal to facility roles.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('org_admin', 'org_viewer')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON public.org_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org  ON public.org_memberships(organization_id);

-- -----------------------------------------------------------------------
-- Column: facilities.organization_id
-- NULL means the facility is not yet grouped into any org.
-- -----------------------------------------------------------------------
ALTER TABLE public.facilities
  ADD COLUMN IF NOT EXISTS organization_id UUID
    REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facilities_org ON public.facilities(organization_id)
  WHERE organization_id IS NOT NULL;

-- -----------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------
ALTER TABLE public.organizations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_memberships ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------
-- Helper: get_user_org_ids()
-- Returns all organization IDs the current user has a membership in.
-- STABLE + SECURITY DEFINER mirrors the existing get_user_facility_id()
-- pattern from 001_foundation.sql.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM   public.org_memberships
  WHERE  user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_user_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids() TO authenticated;

-- -----------------------------------------------------------------------
-- Helper: get_user_org_role(org_id)
-- Returns the role the current user has in a specific org, or NULL.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_org_role(p_org_id UUID)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM   public.org_memberships
  WHERE  user_id        = auth.uid()
    AND  organization_id = p_org_id;
$$;

REVOKE ALL ON FUNCTION public.get_user_org_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_org_role(UUID) TO authenticated;

-- -----------------------------------------------------------------------
-- RLS policies: organizations
-- Members can read their own orgs; only service_role can write.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "organizations_member_select" ON public.organizations;
CREATE POLICY "organizations_member_select" ON public.organizations
  FOR SELECT
  USING (id IN (SELECT public.get_user_org_ids()));

-- -----------------------------------------------------------------------
-- RLS policies: org_memberships
-- A user can see their own membership row OR any row in an org they
-- already belong to (so org_admin can enumerate members).
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "org_memberships_self_select" ON public.org_memberships;
CREATE POLICY "org_memberships_self_select" ON public.org_memberships
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT public.get_user_org_ids())
  );

-- -----------------------------------------------------------------------
-- RLS policies: facilities — org-level read
-- Adds an additional SELECT policy so org_admins can read cross-facility
-- rows within their org. The existing facilities_select_own policy (from
-- 001_foundation.sql) continues to work for single-facility staff users.
-- Postgres OR-chains multiple SELECT policies, so EITHER condition
-- satisfying is sufficient.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "facilities_org_member_select" ON public.facilities;
CREATE POLICY "facilities_org_member_select" ON public.facilities
  FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT public.get_user_org_ids())
  );

-- -----------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------
GRANT SELECT ON public.organizations   TO authenticated;
GRANT SELECT ON public.org_memberships TO authenticated;
-- INSERT/UPDATE/DELETE on these tables is done server-side via
-- service_role (super-admin tRPC procedures), never directly from the
-- client. Authenticated role gets read-only.
