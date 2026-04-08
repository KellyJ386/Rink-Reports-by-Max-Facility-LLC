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
-- 013_multi_facility.sql does NOT define this table — safe to create.
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
-- 013_multi_facility.sql does NOT add this column — safe to alter.
-- -----------------------------------------------------------------------
ALTER TABLE public.facilities
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facilities_org ON public.facilities(organization_id);

-- -----------------------------------------------------------------------
-- RLS: Enable on new tables
-- -----------------------------------------------------------------------
ALTER TABLE public.organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_memberships ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------
-- Helper function: get_user_org_ids()
-- Returns the set of organization_ids the current user is a member of.
-- SECURITY DEFINER so it can read org_memberships bypassing RLS
-- (needed during RLS policy evaluation to avoid infinite recursion).
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid();
$$;

-- -----------------------------------------------------------------------
-- Helper function: get_user_org_role(p_org_id UUID)
-- Returns the role the current user has in a specific org, or NULL.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_org_role(p_org_id UUID)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.org_memberships
  WHERE user_id = auth.uid() AND organization_id = p_org_id;
$$;

-- -----------------------------------------------------------------------
-- RLS Policies: organizations
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "organizations_member_select" ON public.organizations;
CREATE POLICY "organizations_member_select" ON public.organizations
  FOR SELECT USING (id IN (SELECT public.get_user_org_ids()));

-- Only the service-role (super_admin server code) can INSERT/UPDATE/DELETE.
-- No authenticated client policy for writes intentionally.

-- -----------------------------------------------------------------------
-- RLS Policies: org_memberships
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "org_memberships_self_select" ON public.org_memberships;
CREATE POLICY "org_memberships_self_select" ON public.org_memberships
  FOR SELECT USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT public.get_user_org_ids())
  );

-- -----------------------------------------------------------------------
-- RLS Policies: facilities (additive — existing policies unchanged)
-- Add an org-level read policy so org_admins can read cross-facility
-- data within their org without touching facility-staff RLS.
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "facilities_org_member_select" ON public.facilities;
CREATE POLICY "facilities_org_member_select" ON public.facilities
  FOR SELECT USING (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT public.get_user_org_ids())
  );
