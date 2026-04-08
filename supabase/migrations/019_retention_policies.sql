ALTER TABLE facility_config ADD COLUMN IF NOT EXISTS retention_policies JSONB
  DEFAULT '{
    "dailyReports": 365,
    "iceOperations": 365,
    "refrigerationReadings": 730,
    "airQualityReadings": 1825,
    "iceDepthSessions": 365,
    "incidents": null
  }'::jsonb;

COMMENT ON COLUMN facility_config.retention_policies IS
  'Per-module retention in days. NULL = keep forever. incidents and air_quality_readings are never deleted regardless of value (compliance).';
