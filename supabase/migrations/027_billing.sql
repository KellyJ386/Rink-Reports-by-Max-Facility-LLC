-- =====================================================================
-- RinkReports 3.0 — Phase G: Stripe Billing
-- Migration: 027_billing.sql
--
-- Adds Stripe billing state to facility_config and creates an
-- append-only billing_events audit log.
--
-- Design decisions:
--   * Stripe is the billing source of truth. facility_config fields
--     are a mirror updated only by the webhook handler (service-role).
--   * billing_events has a UNIQUE on stripe_event_id so the handler
--     can use the insert as an idempotency check: if the insert fails
--     with a unique violation, the event was already processed.
--   * plan_status tracks our own state machine, not Stripe's status
--     enum, so the app can express 'locked' (past_due > 7 days) and
--     'trial' without relying on Stripe's 'trialing' string.
--
-- CLAUDE.md rules:
--   Rule 1: facility_id is always from session, never client input.
--   Rule 8: RLS at the DB AND the server.
-- =====================================================================

-- Stripe billing fields on facility_config
ALTER TABLE facility_config
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'trial'
    CHECK (plan_status IN ('trial', 'active', 'past_due', 'locked', 'cancelled')),
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'single_facility',
  ADD COLUMN IF NOT EXISTS enabled_modules JSONB NOT NULL DEFAULT '{
    "dailyReports": true,
    "iceOperations": true,
    "refrigeration": true,
    "airQuality": true,
    "incidentReporting": true,
    "employeeScheduling": true,
    "communications": true,
    "adminControlCenter": true
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS seat_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_seats INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMPTZ;

-- Append-only billing event audit log
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_facility_created
  ON billing_events(facility_id, processed_at DESC);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
-- Service role only (webhook writes). Admins can read via tRPC procedure.
CREATE POLICY "billing_events_admin_select" ON billing_events
  FOR SELECT USING (
    facility_id = get_user_facility_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
        AND user_profiles.role IN ('admin', 'super_admin')
    )
  );
