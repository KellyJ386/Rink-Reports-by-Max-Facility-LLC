# Phase C — Agent 2 (Anomaly Detection) Completion Marker

## Branch
`phase-c/anomaly-detection`

## Worktree path
`/home/user/Rink-Reports-by-Max-Facility-LLC/.claude/worktrees/agent-ad26ba3a`

## Task Status

### Task 1 — Alerts table migration + TypeScript type
**STATUS: COMPLETE**
Commit: `4c40d6c`

Files:
- `supabase/migrations/015_alerts.sql` — alerts table, 3 indexes
  (facility, created_at DESC, unresolved partial), RLS policies
  (SELECT + UPDATE for authenticated; INSERT intentionally absent —
  only service-role cron writes rows), GRANT SELECT/UPDATE to
  authenticated.
- `src/lib/offline/types.ts` — `Alert` type appended (camelCase,
  matches DB columns).

RLS uses `get_user_facility_id()` from `001_foundation.sql` (the
canonical helper function name confirmed by reading that migration).

### Task 2 — Detection logic
**STATUS: COMPLETE**
Commit: `3bf8346`

Files:
- `src/server/anomaly/types.ts` — `DetectionResult` type
- `src/server/anomaly/detectors/refrigerationDrift.ts`
  - 90-day baseline per compressor per pressure field
  - Last-3-readings average compared to baseline
  - >15% above → warning; >25% → critical
  - alertType: `refrigeration_drift`
  - targetIdentifier: `compressor-{compressor_id}`
- `src/server/anomaly/detectors/missedDailyReports.ts`
  - Reads `daily_report_checklists` (no hardcoded tab names — Rule 2)
  - Checks last 7 completed days per checklist
  - 1 missed day = info, 2 = warning, 3+ = critical
  - alertType: `missed_daily_report`
  - targetIdentifier: `{YYYY-MM-DD}-{checklistId}`
- `src/server/anomaly/detectors/airQualityEscalation.ts`
  - Last 24 hours of air_quality_readings
  - tier="action" → warning; tier="evacuate" → critical
  - alertType: `air_quality_escalation`
  - targetIdentifier: reading `submitted_at` ISO string
- `src/server/anomaly/detectors/iceDepthThinSpots.ts`
  - Last 3 completed ice_depth_sessions vs 90-day baseline
  - Per-point measurements map (JSONB key = point number)
  - 20-35% below baseline → warning; >35% → critical
  - alertType: `ice_depth_thin_spot`
  - targetIdentifier: `point-{pointKey}`
- `src/server/anomaly/index.ts` — `runAllDetectors()` via
  `Promise.allSettled`, Sentry capture for rejections
- `src/lib/database.types.ts` — `alerts` table added (hand-written;
  migration 015 post-dates last type generation)

### Task 3 — Persistence + dedup
**STATUS: COMPLETE**
Commit: `20b204a`

File: `src/server/anomaly/persist.ts`

- `persistAlerts(results, supabase): Promise<{ inserted, skipped, errors }>`
- Per result: SELECT with `.is("resolved_at", null)` + facility_id +
  alert_type + target_identifier (null-safe: `.is()` for null values,
  `.eq()` for non-null)
- Existing unresolved match → skip; else INSERT
- `Promise.allSettled` so one failure doesn't block the batch
- Sentry capture for each rejection

### Task 4 — Vercel cron
**STATUS: COMPLETE**
Commit: `a8bc4b7`

Files:
- `src/app/api/cron/anomaly-scan/route.ts`
  - GET handler (Vercel cron calls GET)
  - Verifies `Authorization: Bearer {CRON_SECRET}` → 401 if wrong
  - `createSupabaseServiceRoleClient()` — bypasses RLS for cross-facility
  - Fetches all facility IDs from `facilities` table
  - `Promise.allSettled` per facility: `runAllDetectors` → `persistAlerts`
  - Returns `{ ok, scanned, alertsCreated }`; never 500s — Sentry absorbs errors
- `vercel.json` — hourly cron: `"0 * * * *"` on `/api/cron/anomaly-scan`
- `.env.example` — `CRON_SECRET=` appended

### Task 5 — tRPC alerts router
**STATUS: COMPLETE**
Commit: `4fc11d6`

Files:
- `src/server/trpc/routers/alerts.ts`
  - `list` query: `{ resolved, severity?, limit }` → `Alert[]`
    ordered by `created_at DESC`, filtered by `ctx.facilityId`
  - `resolve` mutation: verifies ownership → sets `resolved_at = now()`,
    `resolved_by = ctx.user.id`
  - Both use `protectedProcedure` (Rule 8)
- `src/server/trpc/routers/index.ts` — `alerts: alertsRouter` registered

### Task 6 — Tests
**STATUS: COMPLETE — 15 new tests, 105 total passing**
Commit: `32878d4`

Files:
- `src/test/anomaly/refrigerationDrift.test.ts` (5 tests)
  - <3 recent → no alerts
  - within threshold → no alerts
  - +20% → warning
  - +30% → critical
  - no baseline → no alerts
- `src/test/anomaly/persist.test.ts` (5 tests)
  - no existing → inserted=1
  - existing → skipped=1
  - SELECT error → error counted, others processed
  - empty batch → zeros
  - correct INSERT fields
- `src/test/anomaly/cron.route.test.ts` (5 tests)
  - missing header → 401
  - wrong secret → 401
  - missing env var → 401
  - valid secret → 200 summary
  - runAllDetectors called per facility

## Commit SHAs (in order)
1. `4c40d6c` — feat(alerts): create alerts table migration + RLS policies
2. `3bf8346` — feat(anomaly): detection logic for 4 anomaly types
3. `20b204a` — feat(anomaly): alert deduplication + Supabase persistence
4. `a8bc4b7` — feat(anomaly): Vercel cron job — hourly anomaly scan
5. `4fc11d6` — feat(anomaly): tRPC alerts procedures — list + resolve
6. `32878d4` — test: anomaly detection, persistence, cron auth
7. (this file) — chore: phase-c agent 2 completion marker

## Notes for downstream agents (Agent 3 — Notifications)

### New surface area
- `appRouter.alerts.list` and `appRouter.alerts.resolve` are available
  for any UI that wants to display or dismiss alerts.
- `Alert` type is in `src/lib/offline/types.ts`.
- `runAllDetectors(facilityId, supabase)` returns `DetectionResult[]`
  — can be reused if Agent 3 wants to trigger notifications from the
  same scan results.
- `persistAlerts` returns `{ inserted }` — the count of newly created
  alerts can be used to decide whether to fan-out notifications.

### Alerts table schema highlights
- `resolved_at IS NULL` = open alert (the dedup key)
- `severity` ∈ `{ info, warning, critical }`
- `alert_type` + `target_identifier` uniquely identify the anomaly
  context within a facility (used for dedup)
- `metadata JSONB` contains detector-specific detail (pressures,
  depths, checklist names, etc.)
- Service-role only for INSERT; authenticated users can SELECT + UPDATE

### What was NOT built (Phase C Agent 3 scope)
- No notification fan-out (email / SMS / web push)
- No alerts UI component — tRPC endpoint is ready; UI is Agent 3+
- No Dexie cache for alerts — not needed (alerts are not offline-writable)
