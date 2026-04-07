-- =====================================================================
-- RinkReports 3.0 — Phase C: Alerts table
-- Migration: 015_alerts.sql
--
-- Stores server-detected anomaly alerts. Rows are written only by the
-- Vercel cron job (/api/cron/anomaly-scan) using the service role
-- client — they are NEVER accepted from user input.
--
-- Dedup contract: do NOT insert a new alert when an unresolved alert
-- with the same (facility_id, alert_type, target_identifier) already
-- exists. The partial index `idx_alerts_unresolved` makes this check
-- fast. See src/server/anomaly/persist.ts.
--
-- CLAUDE.md rules:
--   Rule 1: facility_id comes from the server, never client input.
--   Rule 8: RLS at the DB AND the server. Force RLS on this table.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.alerts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id       UUID        NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  alert_type        TEXT        NOT NULL,
  severity          TEXT        NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  target_identifier TEXT,
  title             TEXT        NOT NULL,
  description       TEXT        NOT NULL,
  metadata          JSONB       NOT NULL DEFAULT '{}',
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID        REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: bump updated_at on every write (reuse existing helper)
DROP TRIGGER IF EXISTS alerts_set_updated_at ON public.alerts;
CREATE TRIGGER alerts_set_updated_at
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- General indexes
CREATE INDEX IF NOT EXISTS idx_alerts_facility_id
  ON public.alerts (facility_id);

CREATE INDEX IF NOT EXISTS idx_alerts_created_at
  ON public.alerts (created_at DESC);

-- Partial index that powers the dedup check:
-- "is there already an unresolved alert for this exact (facility, type, target)?"
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved
  ON public.alerts (facility_id, alert_type, target_identifier)
  WHERE resolved_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- Row Level Security
-- Uses get_user_facility_id() from 001_foundation.sql.
-- The cron writes via service_role which bypasses RLS; authenticated
-- users can select and resolve their facility's alerts.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS facility_alerts_select ON public.alerts;
CREATE POLICY facility_alerts_select ON public.alerts
  FOR SELECT
  TO authenticated
  USING (facility_id = (SELECT public.get_user_facility_id()));

-- Insert is intentionally absent for authenticated users:
-- only the service-role cron inserts rows.

DROP POLICY IF EXISTS facility_alerts_update ON public.alerts;
CREATE POLICY facility_alerts_update ON public.alerts
  FOR UPDATE
  TO authenticated
  USING (facility_id = (SELECT public.get_user_facility_id()))
  WITH CHECK (facility_id = (SELECT public.get_user_facility_id()));

-- ─────────────────────────────────────────────────────────────────
-- Grants
-- authenticated role can SELECT (list) and UPDATE (resolve).
-- INSERT is denied for authenticated; service_role bypasses RLS.
-- ─────────────────────────────────────────────────────────────────
GRANT SELECT, UPDATE ON public.alerts TO authenticated;
