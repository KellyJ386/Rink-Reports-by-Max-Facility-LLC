-- =====================================================================
-- RinkReports 3.0 — Phase E: Ingest audit log
-- Migration: 022_ingest_log.sql
--
-- Every ingest attempt (accepted / rejected / duplicate) is written
-- here by the ingest endpoints using the service-role client. This
-- provides an audit trail and powers the dedup check that prevents
-- the same payload hash from being inserted twice within a window.
--
-- CLAUDE.md rules:
--   Rule 1: facility_id is set server-side from the verified
--           device_credentials row, never from the request payload.
--   Rule 8: RLS at the DB AND the server. Force RLS on this table.
-- =====================================================================

CREATE TABLE ingest_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id        TEXT        NOT NULL,
  facility_id      UUID        NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  endpoint         TEXT        NOT NULL,
  payload_hash     TEXT        NOT NULL,
  status           TEXT        NOT NULL CHECK (status IN ('accepted', 'rejected', 'duplicate')),
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary read pattern: most recent entries for a given device
CREATE INDEX idx_ingest_log_device_created
  ON ingest_log(device_id, created_at DESC);

-- Secondary read pattern: admin listing all ingest activity per facility
CREATE INDEX idx_ingest_log_facility_created
  ON ingest_log(facility_id, created_at DESC);

ALTER TABLE ingest_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_log FORCE ROW LEVEL SECURITY;

-- Admin users can view ingest logs for their facility.
-- All writes go through service-role (ingest endpoints), bypassing RLS.
CREATE POLICY "ingest_log_admin_select" ON ingest_log
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

-- SELECT only for authenticated; inserts go via service-role.
GRANT SELECT ON ingest_log TO authenticated;
