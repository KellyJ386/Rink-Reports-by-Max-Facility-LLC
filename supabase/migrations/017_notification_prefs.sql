-- =====================================================================
-- RinkReports 3.0 — Phase C: User notification preferences
-- Migration: 017_notification_prefs.sql
--
-- Per-user, per-facility notification preferences. Determines which
-- channels (email/SMS/push) receive alert fan-out and at what minimum
-- severity level.
--
-- CLAUDE.md rules:
--   Rule 1: facility_id comes from the server, never client input.
--   Rule 8: RLS at the DB AND the server.
-- =====================================================================

CREATE TABLE user_notification_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  push_enabled BOOLEAN NOT NULL DEFAULT false,
  phone_number TEXT,
  min_severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (min_severity IN ('info','warning','critical')),
  alert_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, facility_id)
);

-- Trigger: bump updated_at on every write
DROP TRIGGER IF EXISTS notification_prefs_set_updated_at ON user_notification_prefs;
CREATE TRIGGER notification_prefs_set_updated_at
  BEFORE UPDATE ON user_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE user_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_prefs_select" ON user_notification_prefs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "own_prefs_insert" ON user_notification_prefs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_prefs_update" ON user_notification_prefs
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
