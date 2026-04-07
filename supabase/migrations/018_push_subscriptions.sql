-- =====================================================================
-- RinkReports 3.0 — Phase C: Push subscriptions
-- Migration: 018_push_subscriptions.sql
--
-- Stores browser push subscription objects (endpoint + keys) per user
-- per facility. Upserted by /api/push/subscribe when a user opts in.
--
-- CLAUDE.md rules:
--   Rule 1: facility_id resolved server-side from user_profiles.
--   Rule 8: RLS at the DB AND the server.
-- =====================================================================

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, facility_id)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_subs_all" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
