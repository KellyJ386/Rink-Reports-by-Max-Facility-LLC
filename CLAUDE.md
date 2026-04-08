# RinkReports 3.0 — CLAUDE.md

## Project Identity
- Product: RinkReports by Max Facility LLC
- Repo: Rink-Reports-by-Max-Facility-LLC
- Stack: Next.js 15 App Router, TypeScript strict, tRPC, Supabase, Tailwind, Dexie.js
- Deploy: Vercel

## Non-Negotiable Rules — Read Before Writing Any Code

### 1. facility_id is NEVER accepted from client input
It is ALWAYS read from `ctx.facilityId` in tRPC context.
The context reads it from `user_profiles` in Supabase.
Any code that accepts facility_id from a form, URL param, 
or request body is a bug. Reject it.

### 2. No hardcoded dropdown values anywhere in module code
ALL values (operation types, tab names, thresholds, positions,
equipment types, compressor counts) come from the 
`facility_config` table via the `useModuleConfig()` hook.
If a module has a hardcoded string list, it is wrong.

### 3. Offline-first write pattern — mandatory for all forms
Every form submission writes to Dexie (IndexedDB) first.
Server sync is background-only.
The UI never waits for a server response to show success.
Pattern: write local → show success → nudge sync engine.

### 4. No seed scripts for business data
The only seed allowed is the facility row and module list.
All configuration (tabs, dropdowns, thresholds) is entered
by the facility admin through the Admin Control Center UI.

### 5. No TypeScript `any`
Use `unknown` and narrow it. Use Zod for runtime validation.
`any` is a build error.

### 6. No mock data
Never generate placeholder data, fake records, or example
submissions. If a module has no data, it shows an empty state.

### 7. tRPC only — no raw API routes for app data
The only exception is `/api/sync` (offline sync endpoint)
and `/api/trpc` (the tRPC handler itself).

### 8. RLS is enforced at the database AND the server
Every tRPC procedure uses `ctx.facilityId` from context.
RLS policies use `get_user_facility_id()` function.
Both layers must be present. Neither replaces the other.

## Brand / Design Tokens
- Navy Blue:    #003B6F  (primary, headers, nav, buttons)
- Action Green: #4DFF00  (success, CTAs, positive indicators)
- Wolf Grey:    #A5ACAF  (secondary text, borders, disabled)
- Alert Yellow: #FFB800  (warnings, over-threshold)
- Alert Red:    #F42A2A  (errors, critical alerts)
- Dark BG:      #001122  (dark mode background)

## Project Structure
src/
  app/
    (auth)/              # login, forgot-password, reset-password
    (dashboard)/         # all protected routes
      dashboard/
      daily-reports/
      ice-depth/
      ice-operations/
      scheduling/
      incidents/
      refrigeration/
      air-quality/
      admin/             # Admin Control Center
    api/
      trpc/[trpc]/       # single tRPC handler
      sync/              # offline sync endpoint
  server/
    trpc/
      routers/           # one file per module
        index.ts         # root router
        admin.ts         # config CRUD
      context.ts         # facility_id injected here
      trpc.ts            # procedures + middleware
  lib/
    offline/
      db.ts              # Dexie schema
      sync-engine.ts     # sync worker
    database.types.ts    # generated Supabase types
    supabase.ts          # browser client
    supabase-server.ts   # server-only client
  modules/               # self-contained per module
    ice-operations/
      components/
      hooks/
      schema.ts
    refrigeration/
    daily-reports/
    air-quality/
    ice-depth/
    incidents/
    scheduling/
    communications/
  components/
    ui/                  # primitives only
    layout/              # Header, Sidebar, MobileNav
  hooks/
    useModuleConfig.ts   # reads facility_config — used everywhere

## Phase Gates
### Phase A — Reality Reset & Hardening (complete)
- CI green: typecheck + lint + test on every PR
- Test coverage: schemas, /api/sync, tRPC auth canary, useModuleConfig
- Layout components: Header, Sidebar, MobileNav, OfflineBanner, SyncStatus
- Sentry wired into tRPC, proxy.ts, /api/sync

### Phase B — Truly Offline-First (complete)
- Dexie schema extended with 6 module read caches (version 2)
- tRPC `pull` procedures for all 6 modules; `usePullChannel` boot + online debounce
- `useOfflineQuery` hook (Dexie-first, network upgrade, isStale, refetch)
- PWA: `@ducanh2912/next-pwa`, manifest, SVG icons, InstallPrompt, /offline page
- Sync UX: live `useSyncStatus`, `rr:sync-ack` event, toast on drain, responsive badge
- /api/sync refactored to thin dispatcher + per-table handler registry

### Phase C — Insight Layer (complete)
- analyticsRouter + 5 trend procedures (air quality, refrigeration, ice depth, incidents, daily report completion)
- LineChart, HeatmapGrid, BarChart, CompletionRing components (recharts)
- /(dashboard)/insights page with 7/30/90-day toggle
- alerts table + RLS + 4 detectors (refrigeration drift, missed reports, AQ escalation, ice depth thin spots)
- /api/cron/anomaly-scan hourly Vercel cron
- alertsRouter (list + resolve)
- Notifications: email (Resend), SMS (Twilio), web push (web-push) + fan-out service wired into cron
- user_notification_prefs + push_subscriptions tables + admin UI card
- viewer role: route group, role guard utility, viewerProcedure middleware, proxy redirect

### Phase D — Compliance & Exports (complete)
- Branded PDF exports per module (jsPDF) with shared header/footer/signature utilities
- CSV + XLSX exports per module (exceljs)
- ExportMenu dropdown component
- Regulatory report packs: OSHA 300/300A injury log, EPA RMP refrigerant log, USA Hockey rink safety, monthly board pack
- Operational Reports page at /(dashboard)/reports
- Retention policies per module in facility_config (min 365 days, compliance fields locked)
- Nightly retention sweep cron at /api/cron/retention-sweep (2am UTC, soft delete + 30-day grace)

### Phase E — Sensors & Integrations (complete)
- HMAC-signed device ingest infrastructure (`device_credentials` + `ingest_log` tables, in-memory rate limit, replay protection)
- Refrigeration controller ingest endpoint (`/api/ingest/refrigeration`) + device management admin UI
- Air quality sensor ingest with server-side tier compute + auto alert creation for tier ≥ 3
- Ice depth sensor ingest with session upsert + critical thin-spot alerting
- `HttpCaliperAdapter` for remote caliper readings via Web Crypto HMAC
- Weather: `daily_weather` table + Open-Meteo service + Zippopotam fallback + 6am cron + `weather.getForDate` tRPC procedure + surfaces in Daily Reports and Incidents
- Scheduling import: ICS parser (recurrence + VTIMEZONE), iSportsman/Maxgalaxy/Active Network adapters, `matchStaff` (Levenshtein + email exact), `previewImport`/`commitImport` tRPC + 3-step UI at `/(dashboard)/scheduling/import`
- Recurring ICS feed import cron (3am daily) with conflict detection + dedup-persisted `scheduling_import_conflict` alerts
- Calendar export: public ICS feed at `/api/calendar/[facilityId]?token=...` gated by `calendar_feed_token` + `calendar_feed_enabled`, admin UI for enable/regenerate/copy/subscribe

### Phase G — Platform & GTM (complete)
- Stripe billing: full webhook state machine (subscription created/updated/deleted, invoice payment_succeeded/failed, trial_will_end), `facility_config` plan columns, append-only `billing_events` audit, `billingProtectedProcedure` factory, `/billing` page, `BillingBanner` (trial/past_due/locked), checkout + customer portal routes, 14-day trial, module toggles, seat management
- HubSpot CRM sync: one-way RinkReports → HubSpot, Company + Contact + Deal upsert, deal stage mapped from plan_status, fire-and-forget wired into Stripe webhook + new facility signup, super-admin manual resync procedure
- Multi-facility roll-up: `organizations` + `org_memberships` tables + `get_user_org_ids()` helper, `TRPCContext.organizationIds`/`orgRoles`, `orgAdminProcedure`, `orgRouter` (`listFacilities`/`getRollupMetrics`/`getFacilityAlerts`), `/(org)` read-only route group (facilities grid, metrics dashboard, alerts view), super-admin org creation + invite UI
- Marketing site: `/(marketing)` route group with homepage (hero + 8-module grid + ROI calculator), features page, pricing page (monthly/annual toggle + FAQ), demo request form + `/api/marketing/demo-request` (Zod → HubSpot + Resend confirmation email, fire-and-forget), SEO metadata, `sitemap.ts`, `robots.ts`
- SOC2 hygiene: append-only `audit_log` table with RLS, `writeAuditLog` + `scrubSnapshot` (redacts passwords/tokens/secrets), `logAdminMutation` helper wired into 4 high-value admin mutations, audit log viewer card, `/api/admin/data-export` (JSON export of all facility data), `/api/admin/data-delete` (super-admin soft-delete with confirmation phrase, preserves `incidents` and `air_quality_readings` for compliance)

## Environment Variables Needed
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_TRPC_URL

## Current Phase
Phase G complete — all planned phases (A → E, G) shipped. RinkReports
is now a full-stack platform: offline-first PWA, 9 operational
modules, trends + anomaly detection + notifications, PDF/CSV/XLSX
exports + regulatory report packs, HMAC-signed sensor ingest +
weather + scheduling import/export, Stripe billing with dunning and
module toggles, HubSpot CRM sync, multi-facility org roll-up,
public marketing site, and SOC2-lite audit log + data export. The
next work is polish, production deployment, and GTM execution —
not new feature phases.

## CHANGELOG

### 2026-04-08 — Phase G complete (Platform & GTM)
5 specialist agents merged. Agent 1 (Sonnet) shipped the Stripe
billing state machine: migration 027 added plan columns and
`billing_events`, the webhook handler now maps all 6 subscription/
invoice events with `stripe_event_id` idempotency, `planGuard.ts`
implements the trial/past_due-grace/locked state machine,
`billingProtectedProcedure(moduleKey)` factory exported for
incremental adoption, `/(dashboard)/billing/page.tsx` plus
`BillingBanner` wired into DashboardShell, checkout + portal routes
extended, seat management surfaced in UserManagementCard. Agent 2
(Haiku) shipped HubSpot one-way sync: `src/server/hubspot/sync.ts`
upserts Company + Contact + Deal with deal stage mapped from
plan_status (trial/active/past_due/locked/cancelled), fire-and-forget
wired into 6 Stripe webhook events and new facility signup, plus a
super-admin `resyncHubSpot` manual procedure. Agent 3 (Sonnet)
shipped multi-facility roll-up: migration 028 added
`organizations` + `org_memberships` + `facilities.organization_id`
FK + `get_user_org_ids()` SECURITY DEFINER helper,
`TRPCContext.organizationIds` + `orgRoles` populated in context,
`orgAdminProcedure` derives `selectedOrgId` from ctx (no client
input), `orgRouter` with `listFacilities`/`getRollupMetrics`/
`getFacilityAlerts`, `/(org)` read-only route group (3 pages),
super-admin `OrganizationCard` for org creation + invite. Agent 4
(Sonnet) shipped the marketing site: `/(marketing)` route group
with custom layout/nav/footer, homepage (hero + 8-module grid +
ROI calculator client component + offline-first callout), features
page with 8 alternating sections, pricing page with monthly/annual
toggle + 6-question FAQ, demo request form + `/api/marketing/
demo-request` API route (Zod → HubSpot contact + Resend confirm
email, both fire-and-forget), `sitemap.ts` + `robots.ts` + SEO
metadata. Agent 5 (Haiku) shipped SOC2 hygiene: migration 029
added append-only `audit_log` table with RLS (no UPDATE/DELETE
policies), `scrubSnapshot` recursively redacts
password/secret/token/hashed_secret/calendar_feed_token keys,
`logAdminMutation` wired into 4 high-value admin mutations
(facility update, module toggle, role change, retention policy),
`AuditLogCard` viewer with date/email filters + CSV export,
`/api/admin/data-export` returns the full facility JSON blob,
`/api/admin/data-delete` super-admin soft-delete gated by a
`DELETE {facility.name}` confirmation phrase (preserves incidents
and air_quality_readings as compliance). Two post-merge fix
commits cleaned up duplicate database.types.ts blocks from the
leaked Agent 3 multi-facility commit, the orgAdminProcedure input
inheritance, the AuditLogCard's shadcn-style import paths,
archived_at cast in data-delete, and rewrote 3 HubSpot tests as
smoke checks using a `vi.hoisted` chainable mock helper. Tests:
402 passing across 53 files; typecheck clean. See
PHASE_G_COMPLETE.md for details.

### 2026-04-08 — Phase E complete (Sensors & Integrations)
5 specialist agents merged. Agent 1 shipped HMAC-signed device
ingest infrastructure: `device_credentials` + `ingest_log` tables,
`verifyDeviceRequest` (timing-safe HMAC-SHA256 over
deviceId.timestamp.sha256(body) with 5-minute replay window),
in-memory rate limiter, 60s payload-hash dedup, and the
refrigeration controller ingest endpoint + admin device management
UI/tRPC. Agent 2 extended the pattern to air quality and ice depth
sensors with automatic tier/depth alert creation and shipped an
HttpCaliperAdapter that mirrors the Web Bluetooth interface using
Web Crypto HMAC. Agent 3 delivered weather: `daily_weather` table
with RLS, Open-Meteo service + Zippopotam zip-code fallback, 6am
daily cron, `weather.getForDate` tRPC procedure, and weather
summary cards surfaced in Daily Reports and Incident forms. Agent 4
(resume after rate-limit cutoff) shipped ICS parsing with
recurrence + VTIMEZONE support, iSportsman/Maxgalaxy/Active Network
adapters, Levenshtein-based `matchStaff`, `previewImport` +
`commitImport` tRPC procedures, a 3-step import UI, and a 3am
recurring-feed import cron that auto-commits high-confidence shifts
and deduplicates conflicts into the alerts table. Agent 5 delivered
the calendar export: `calendar_feed_token` + `calendar_feed_enabled`
in facility_config, public ICS feed at `/api/calendar/[facilityId]`
(404s for missing/wrong/disabled tokens), ical-generator integration,
and an admin card for enable/regenerate/copy/webcal-subscribe. Two
post-merge fix commits cleaned up ical.js v2 typing, user_profiles
email column assumptions (email lives in auth.users, not profiles),
noUncheckedIndexedAccess violations, and a missing `matchStaff.ts`
file that Agent 4 referenced but never committed. Tests: 328 passing
across 43 files; typecheck clean. See PHASE_E_COMPLETE.md for
details.

### 2026-04-08 — Phase D complete (Compliance & Exports)
4 specialist agents merged. Agent 1 shipped a jsPDF utility
module (header, footer, signature, section-title, page-overflow
helpers) plus 5 per-module PDF generators (daily reports, ice
operations, refrigeration, air quality, incidents), a tRPC
exports router with 5 `*Pdf` mutations, and a `usePdfExport`
client hook wired to daily-reports and refrigeration history.
Agent 2 shipped native CSV + exceljs XLSX utilities, 5
per-module row formatters, 10 `*Csv`/`*Xlsx` mutations, and an
ExportMenu dropdown. Agent 3 shipped 4 regulatory report pack
generators (OSHA 300/300A, EPA RMP refrigerant log, USA Hockey
rink safety, monthly board pack with ASCII bar approximation),
4 corresponding tRPC mutations, and a Report Packs page at
/(dashboard)/reports. Agent 4 added `retention_policies` JSONB
to `facility_config` (default 365–1825 days, compliance fields
locked to null), `archived_at` columns on 4 module tables (not
incidents or air_quality_readings), a nightly
/api/cron/retention-sweep with 30-day grace period before hard
delete, and an admin UI card. Both Phase D resume cycles were
needed after background agent processes were terminated across
session boundaries. Tests: 245 passing across 32 files;
typecheck clean. See PHASE_D_COMPLETE.md for details.

### 2026-04-07 — Phase C complete (Insight Layer)
4 specialist agents merged. analyticsRouter shipped 5 trend
procedures used by an Operational Insights page (recharts:
LineChart, HeatmapGrid, BarChart, CompletionRing). Server-side
anomaly detection: 4 detectors (refrigeration drift, missed
daily reports, air quality escalation, ice depth thin spots),
deduped persistence into a new `alerts` table, hourly Vercel
cron at /api/cron/anomaly-scan, alertsRouter (list + resolve).
Notifications: Resend email, Twilio SMS, web-push + VAPID; new
`user_notification_prefs` and `push_subscriptions` tables; fan-out
wired into the cron with Promise.allSettled isolation. Viewer
role: route group at /(viewer), role guard utility, viewerProcedure
middleware, proxy redirect, role added to TRPCContext, viewer
option in admin user management. Tests: 158 passing across 24
files; typecheck clean. See PHASE_C_COMPLETE.md for details.

### 2026-04-07 — Phase B complete (Truly Offline-First)
6 specialist agents merged. Dexie schema extended to version 2
with 6 module read caches. tRPC `pull` procedures + 14-day
`usePullChannel` (boot + debounced online event). `useOfflineQuery`
hook is the new data-fetching primitive: Dexie-first, network
upgrade, isStale, refetch, error isolation. PWA shipped via
`@ducanh2912/next-pwa` + manifest + InstallPrompt + /offline page.
Sync UX: live `useSyncStatus`, `rr:sync-ack` event from sync engine,
toast on drain, responsive header badge. /api/sync refactored from
~430-line switch into a 55-line dispatcher + per-table handler
registry. Tests: 90 passing across 15 files; typecheck clean.
See PHASE_B_COMPLETE.md for details.

### 2026-04-07 — Phase A migration
Phases 0 through 5 scaffolding has landed (Supabase schema,
tRPC, Auth, Dexie, Admin config API; Admin Control Center UI;
Daily Reports + Ice Operations; Refrigeration + Air Quality;
Ice Depth + Incidents; Scheduling + Communications). Phase 6
(Platform: Stripe, HubSpot, multi-facility) is partially
started. The project is now entering Phase A — a reality reset
focused on test coverage, CI, layout primitives, and Sentry
instrumentation — before any further module work.

Previous phase ladder, retained for history:
- Phase 0 — Foundation: Supabase schema, tRPC, Auth, Dexie,
  Admin config API
- Phase 1 — Admin Control Center UI: facility settings,
  module toggles, per-module config panels, user management
- Phase 2 — Daily Reports + Ice Operations
- Phase 3 — Refrigeration + Air Quality
- Phase 4 — Ice Depth + Incidents
- Phase 5 — Scheduling + Communications
- Phase 6 — Platform (Stripe, HubSpot, multi-facility)
