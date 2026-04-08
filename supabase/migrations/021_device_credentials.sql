-- =====================================================================
-- RinkReports 3.0 — Phase E: Device credential store
-- Migration: 021_device_credentials.sql
--
-- Each IoT device (refrigeration controller, air quality sensor,
-- ice depth sensor) that wants to push readings into RinkReports
-- must be registered here by a facility admin. Devices present an
-- HMAC-SHA256 signature on every ingest request; the server verifies
-- by re-computing the HMAC from the stored hashed_secret combined
-- with INGEST_SIGNING_SECRET (server-side env var).
--
-- Security model:
--   * hashed_secret stores SHA-256(plaintext_secret). The plaintext
--     is shown ONCE during device provisioning and then discarded.
--   * INGEST_SIGNING_SECRET (env var) is mixed into the HMAC key so
--     a DB leak alone does not allow forging signatures.
--   * No user-facing INSERT/UPDATE/DELETE policies — devices are
--     managed via the adminRouter (service-role server-side). The
--     SELECT policy allows admin users to view their facility's
--     devices in the admin UI.
--
-- CLAUDE.md rules:
--   Rule 1: facility_id is set server-side, never client input.
--   Rule 8: RLS at the DB AND the server. Force RLS on this table.
-- =====================================================================

CREATE TABLE device_credentials (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id    UUID        NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  device_id      TEXT        NOT NULL UNIQUE,
  device_type    TEXT        NOT NULL CHECK (
    device_type IN (
      'refrigeration_controller',
      'air_quality_sensor',
      'ice_depth_sensor'
    )
  ),
  label          TEXT        NOT NULL,
  hashed_secret  TEXT        NOT NULL,
  last_seen_at   TIMESTAMPTZ,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_device_credentials_facility_id
  ON device_credentials(facility_id);

-- Partial index for fast active-device lookups (hot path on every ingest)
CREATE INDEX idx_device_credentials_active
  ON device_credentials(device_id)
  WHERE is_active = true;

ALTER TABLE device_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_credentials FORCE ROW LEVEL SECURITY;

-- Admin users within the facility can view their own devices via the
-- admin UI. All writes (insert/update/delete) go through the
-- devicesRouter which uses the service-role client server-side.
-- Device secrets must never be readable from the browser — we
-- intentionally exclude hashed_secret from UI queries in the router.
CREATE POLICY "device_credentials_admin_select" ON device_credentials
  FOR SELECT
  TO authenticated
  USING (
    facility_id = (SELECT public.get_user_facility_id())
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
        AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

-- No INSERT/UPDATE/DELETE for authenticated role —
-- the service-role client (devicesRouter) bypasses RLS for writes.
GRANT SELECT ON device_credentials TO authenticated;
