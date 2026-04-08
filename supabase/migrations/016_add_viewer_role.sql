-- =====================================================================
-- RinkReports 3.0 — Phase C: Add viewer role
-- Migration: 016_add_viewer_role.sql
--
-- Adds 'viewer' to the user_role enum.
-- Viewer = read-only access to insights and alerts only.
-- No data entry, no admin, no mutations.
--
-- The enum is altered in-place so existing rows are unaffected.
-- Existing roles (super_admin, admin, manager, staff) retain all
-- permissions.
-- =====================================================================

-- Postgres ALTER TYPE … ADD VALUE cannot run inside a transaction, so
-- we guard with a check to keep the migration idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.user_role'::regtype
      AND enumlabel = 'viewer'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'viewer';
  END IF;
END$$;
