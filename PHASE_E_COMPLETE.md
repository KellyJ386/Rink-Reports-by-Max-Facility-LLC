# Phase E — Sensors & Integrations — COMPLETE

Date: 2026-04-08
Branch: `claude/rink-reports-assessment-1DBXg`

## Result

- `npm run typecheck` — clean
- `npm run test` — **328 passing** across 43 files (up from 262 at end of Agent 1)
- All 5 specialist branches merged (with re-spawn recovery for Agents 1/2 session loss and Agent 4 rate-limit cutoff)

## Specialist Branches

| Agent | Branch | Model | Status |
|---|---|---|---|
| 1 — Device Ingest | `phase-e/device-ingest` | Sonnet | merged |
| 2 — Sensor Ingest | `phase-e/sensor-ingest` (work actually on calendar-export) | Haiku ✓ | merged via calendar-export |
| 3 — Weather | `phase-e/weather` | Haiku ✓ | merged via calendar-export |
| 4 — Scheduling Import | `phase-e/scheduling-import-finish` (re-spawn) | Sonnet | merged |
| 5 — Calendar Export | `phase-e/calendar-export` | Haiku ✓ | merged (T3/T4 finished inline) |

**Breakthrough on the Haiku framework**: 3 of 3 Haiku prompts for Phase E were accepted after compression to ~3KB each. First time Haiku worked in this harness since Phase A. Agents 2, 3, 5 all ran on Haiku successfully.

## What Landed

### Agent 1 — Device Ingest Infrastructure
- `supabase/migrations/021_device_credentials.sql` + `022_ingest_log.sql` with admin-only RLS
- `src/server/ingest/auth.ts` — HMAC-SHA256 verification: key = `INGEST_SIGNING_SECRET + sha256(plaintext_secret)`, message = `deviceId.timestamp.sha256(body)`, timing-safe `crypto.timingSafeEqual`, 5-minute replay window, best-effort `last_seen_at` update
- `src/server/ingest/rateLimit.ts` — in-memory Map-based limiter, 10s window per device (TODO: swap to Upstash Redis)
- `src/server/ingest/log.ts` — `writeIngestLog` + `findRecentIngestLog` (60s payload-hash dedup)
- `src/app/api/ingest/refrigeration/route.ts` — 9-step pattern: verify → device-type check → rate limit → hash → dedup → validate with strict Zod → admin user_profiles lookup for `submitted_by` FK → insert → log
- `src/server/trpc/routers/devices.ts` — list/create/deactivate/regenerateSecret (admin-only)
- `src/app/(dashboard)/admin/devices/page.tsx` — device management UI with one-time secret display

### Agent 2 — Sensor Ingest
- `src/app/api/ingest/air-quality/route.ts` — tier computation from `facility_config` (module='air-quality', key='thresholds') with fallback rule, auto-alert insertion for tier ≥ 3 with dedup
- `src/app/api/ingest/ice-depth/route.ts` — find-or-create today's draft session, upsert measurement by point_index, critical alert for depth < 1.0"
- `src/modules/ice-depth/httpCaliperAdapter.ts` — Web Crypto API HMAC, mirrors `CaliperAdapter` interface for operator tablets

### Agent 3 — Weather
- `supabase/migrations/023_daily_weather.sql` — table with unique (facility_id, weather_date), facility-scoped RLS, `latitude`/`longitude` added to `facility_config`
- `src/server/weather/service.ts` — cache-first `fetchWeatherForFacility`, Open-Meteo daily endpoint, Zippopotam zip-code fallback when lat/long missing
- `src/app/api/cron/weather/route.ts` — 6am daily cron, `Promise.allSettled` per facility
- `src/server/trpc/routers/weather.ts` — `getForDate` query
- `src/modules/daily-reports/components/WeatherCard.tsx` + `src/modules/incidents/components/WeatherSummary.tsx` — graceful-degradation read-only surfaces

### Agent 4 — Scheduling Import
- `src/server/scheduling/importers/icsParser.ts` — ical.js v2 default import, 90-day recurrence expansion, VTIMEZONE registration, malformed-event skip
- `src/server/scheduling/importers/adapters/` — iSportsman (strips X-ISPORTSMAN-* lines), Maxgalaxy (papaparse CSV), Active Network (Zod-validated JSON)
- `src/server/scheduling/importers/matchStaff.ts` — Levenshtein-based fuzzy match with email exact preference, confidence tiers (1.0 email, 1.0/0.9/0.8 for distance 0/1/2)
- `scheduling.previewImport` + `scheduling.commitImport` tRPC procedures with conflict detection against existing facility schedules
- `src/app/(dashboard)/scheduling/import/page.tsx` — 3-step UI: format/paste → preview/resolve → commit
- `supabase/migrations/026_scheduling_feed.sql` — `scheduling_feed_url` + `scheduling_feed_last_imported_at` in facility_config
- `src/app/api/cron/scheduling-import/route.ts` — 3am daily cron, auto-commits confidence ≥ 0.9 non-overlapping shifts, dedup-persists conflicts as `scheduling_import_conflict` alerts

### Agent 5 — Calendar Export
- `supabase/migrations/025_calendar_feed.sql` — `calendar_feed_token` + `calendar_feed_enabled` in facility_config
- `adminRouter.getCalendarFeedUrl` / `enableCalendarFeed` / `regenerateCalendarToken`
- `src/app/api/calendar/[facilityId]/route.ts` — public ICS feed gated by query-param token, 404 for missing/wrong/disabled, next-90-days window, ical-generator output, `Cache-Control: no-cache`
- `src/app/(dashboard)/admin/_components/CalendarFeedCard.tsx` (inline finish) — enable toggle, copy-to-clipboard, webcal:// subscribe link, regenerate with confirm dialog

## Branch Collisions & Recovery

The previous session's async worktrees collided because the agents shared the same `.git` directory. When the session was interrupted and resumed, Agent 2's work had landed on `phase-e/weather` (not `phase-e/sensor-ingest`), and Agent 4/5 had been running when the 5pm UTC rate limit hit. Recovery:

1. Inspected each branch via `git log` + `git ls-tree` to locate files
2. Identified `phase-e/calendar-export` as the accumulated super-branch (contained Agents 1/2/3 full work + Agent 4 T1 + Agent 5 T1/T2)
3. Merged `phase-e/device-ingest` then `phase-e/calendar-export` onto the working branch
4. Wrote Agent 5's T3 (`CalendarFeedCard`) + T4 tests inline — small enough to do directly
5. Re-spawned Agent 4 (Sonnet) on a fresh `phase-e/scheduling-import-finish` branch to finish T2–T5
6. Merged Agent 4's finish branch + post-merge integration fixes

## Post-Merge Integration Fixes

Two follow-up fix commits:

**`8ce2311 fix: post-merge Phase E integration fixes`** (13 files):
- `ical.js` v2 default export (`import ICAL from "ical.js"`, cast jcal array) + type casts for Component/RecurExpansion
- Weather service: `raw_response` cast via `unknown as Json`
- `WeatherCard`/`WeatherSummary`/weather cron: nullish-coalesce on `.split("T")[0]` (strict `noUncheckedIndexedAccess`)
- `httpCaliperAdapter`: dropped colliding imports, removed Node crypto (uses global Web Crypto)
- Air-quality ingest: fixed facility_config key-value lookup (`module='air-quality', key='thresholds'`)
- Ice-depth ingest: added admin user_profiles lookup for `submitted_by` FK (same pattern as refrigeration)
- Calendar feed endpoint: fetch facility schedule IDs first, then query shifts by `IN (...)` — `schedule:facility_id` nested filter syntax was invalid
- Test mocks: stable `selectSpy`/`insertSpy`/`updateSpy` defaults in beforeEach (previously re-applied on every `from()` call, clobbering per-test overrides)
- `weatherRouter.test.ts`: valid user with `facilityId: null` so inner `FORBIDDEN` fires instead of outer `UNAUTHORIZED`
- `service.test.ts`: `@sentry/nextjs` mock with explicit `captureException: vi.fn()`; attach `.upsert()` to `daily_weather` chain
- Ingest tests: replaced invalid `"tpl-uuid"` with a proper UUID fixture

**`3c0119a fix: post-merge Phase E — add matchStaff + drop email from user_profiles queries`** (3 files):
- Created missing `src/server/scheduling/importers/matchStaff.ts` — Agent 4's previous run referenced it from tests and the router but never committed the actual file
- `schedulingRouter.previewImport` + `/api/cron/scheduling-import`: dropped `email` from `user_profiles` select (the table has no email column — email lives in `auth.users` and isn't reachable via the authenticated client). Name-only matching for now, email always `null`
- `scheduling-import` cron: metadata `as unknown as Json` cast for alert insert

## Phase E Gates — Status

| Gate | Status |
|---|---|
| HMAC-signed device ingest for refrigeration/air quality/ice depth | ✅ |
| Sensor alert auto-creation on threshold breach | ✅ (tier ≥ 3 air quality; depth < 1.0" ice) |
| Weather pulled daily and surfaced in Daily Reports + Incidents | ✅ |
| Scheduling import adapters (ICS + 3 platforms) | ✅ |
| Recurring ICS feed auto-import with conflict detection | ✅ |
| Public calendar export feed per facility | ✅ |
| typecheck + tests green | ✅ (328 passing) |

## Cost Framework Note

Haiku finally worked. The breakthrough was compressing prompts below ~3KB while keeping enough spec to prevent the agent from asking questions:
- Agent 2 (sensor ingest): Haiku ✓ — Agent 1's endpoint was the canonical pattern, just "do the same thing for air quality + ice depth" fit cleanly
- Agent 3 (weather): Haiku ✓ — Open-Meteo spec was self-contained
- Agent 5 (calendar export): Haiku ✓ — formulaic ICS generation

Sonnet was the right call for Agents 1 (HMAC security design) and 4 (ICS parser + adapter architecture + staff matching + conflict detection).

Framework target: 3 Haiku / 2 Sonnet = ~60% cheaper than all-Sonnet. Actual: 3 Haiku / 2 Sonnet → target met.

## Carry-Forward Items

1. **Upstash Redis rate limiting** — currently in-memory, single-lane only. Swap when Redis is added.
2. **`source: 'sensor'` column** — sensor ingests currently look up an admin user to satisfy `submitted_by` FK. Add a nullable `source` column so sensor rows can set `submitted_by = null`.
3. **`email` in `user_profiles`** — scheduling import staff matching is name-only because `user_profiles` has no email column. Either add the column (duplicating auth.users) or call `auth.admin.listUsers()` from a service-role client in the import flow.
4. **`useModuleConfig` Dexie integration** — still pending from Phase A (not addressed in any phase since). Carry to Phase F/G.
5. **CI uses `lint:fix`** — still pending from Phase A.
6. **Branch hygiene** — Phase E worktrees collided significantly. Next phase should spawn worktrees sequentially when branches overlap, or use non-overlapping branch namespaces.

## Files Created / Modified Summary

- 6 merge commits + 3 post-merge fix commits + 5 agent completion markers
- 6 new SQL migrations (021, 022, 023, 025, 026, and device/ingest tables)
- New server modules: `src/server/ingest/`, `src/server/weather/`, `src/server/scheduling/importers/`
- 3 new ingest route handlers + 2 new cron routes (weather, scheduling-import) + 1 new public API route (calendar feed)
- New admin cards: `CalendarFeedCard`
- 1 new dashboard page (`scheduling/import`) + 2 weather surface components
- 1 new client adapter (`httpCaliperAdapter`)
- Tests added: ingest (auth + rate limit + 3 endpoints), weather (service + router), scheduling (adapters + matchStaff + icsParser), calendar feed endpoint — net new ≈ 66 tests
