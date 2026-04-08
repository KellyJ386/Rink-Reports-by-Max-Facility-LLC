ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE ice_operations ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE refrigeration_readings ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE ice_depth_sessions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
-- NOT adding to incidents or air_quality_readings (compliance records).

CREATE INDEX IF NOT EXISTS idx_daily_reports_archived
  ON daily_reports(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ice_operations_archived
  ON ice_operations(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refrigeration_archived
  ON refrigeration_readings(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ice_depth_archived
  ON ice_depth_sessions(archived_at) WHERE archived_at IS NOT NULL;
