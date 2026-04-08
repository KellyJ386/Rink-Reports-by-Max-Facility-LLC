# Phase C — Insight Layer — COMPLETE

Date: 2026-04-07
Branch: `claude/rink-reports-assessment-1DBXg`

## Result

- `npm run typecheck` — clean
- `npm run test` — **158 passing** across 24 files (up from 90 in Phase B)
- All 4 specialist branches merged

## Specialist Branches

| Agent | Branch | Model | Status |
|---|---|---|---|
| 1 — Trends Dashboard | `phase-c/trends-dashboard` | Sonnet | merged |
| 2 — Anomaly Detection | `phase-c/anomaly-detection` | Sonnet | merged |
| 3 — Notifications | `phase-c/notifications` | Sonnet | merged |
| 4 — Viewer Role | `phase-c/viewer-role` | Sonnet (Haiku rejected) | merged |

Merge order executed: anomaly-detection → notifications → trends-dashboard → viewer-role.

## What Landed

### Agent 1 — Trends Dashboard
- `src/server/trpc/routers/analytics.ts` — 5 protectedProcedure queries (`airQualityTrend`, `refrigerationBrineDeltaTrend`, `iceDepthHeatmapDelta`, `incidentsFrequencyByLocation`, `dailyReportCompletionRate`). All scope by `ctx.facilityId`.
- `src/components/charts/{LineChart,HeatmapGrid,BarChart,CompletionRing}.tsx` (recharts) + barrel.
- `src/app/(dashboard)/insights/page.tsx` with 7/30/90-day toggle and 5 module sections (skeleton/error/empty states).
- "Insights" added to dashboard nav.
- Tests: 12 router tests + 4 chart tests + recharts stub.

### Agent 2 — Anomaly Detection
- `supabase/migrations/015_alerts.sql` — alerts table with RLS via `get_user_facility_id()`.
- `src/server/anomaly/detectors/` — 4 detector functions (refrigeration drift, missed daily reports, AQ escalation, ice depth thin spots) + orchestrator + types.
- `src/server/anomaly/persist.ts` — dedup + Promise.allSettled batch insert; returns `insertedAlerts: Alert[]` for fan-out chain.
- `src/app/api/cron/anomaly-scan/route.ts` — Bearer-token auth, service-role client, per-facility allSettled loop.
- `vercel.json` — hourly cron schedule.
- `src/server/trpc/routers/alerts.ts` — `list` + `resolve` procedures registered as `alerts`.
- Tests: detector + persist + cron auth.

### Agent 3 — Notifications
- `supabase/migrations/017_notification_prefs.sql` + `018_push_subscriptions.sql` — RLS policies (own rows only).
- `src/server/notifications/{email,sms,push,fanout}.ts` — Resend / Twilio / web-push channels + dispatcher honoring `min_severity` and `alert_types` filters.
- `src/app/api/push/subscribe/route.ts` — Zod-validated POST upserts the subscription.
- `src/hooks/usePushSubscription.ts` — client subscribe/unsubscribe lifecycle.
- `src/server/trpc/routers/notifications.ts` — `getNotificationPrefs` + `upsertNotificationPrefs`.
- `src/app/(dashboard)/admin/_components/NotificationPrefsCard.tsx` — admin UI with email/SMS/push toggles, severity radio, alert-type checklist.
- Cron wired: persistAlerts → fanOutAlert (Promise.allSettled isolation).
- Tests: 6 fan-out filter tests + 4 push subscribe tests.

### Agent 4 — Viewer Role
- `src/lib/auth/roles.ts` — `ROLE_HIERARCHY`, `hasPermission`, `canMutate`, `isViewer`.
- `src/server/trpc/trpc.ts` — `viewerProcedure` blocking mutations for viewer role.
- `src/server/trpc/context.ts` — extended `TRPCContext` with `role` field, fetched alongside facility_id from `user_profiles`.
- `supabase/migrations/016_add_viewer_role.sql` — adds `'viewer'` to user_profiles role CHECK constraint.
- `src/app/(viewer)/{layout,dashboard,alerts}.tsx` — viewer route group with read-only chrome and "Read Only" badge.
- `src/proxy.ts` — viewer↔dashboard route redirects via extracted `viewerRedirectPath()` helper (testable pure function).
- `src/app/(dashboard)/admin/_components/UserManagementCard.tsx` — viewer added to role dropdown.
- Tests: 16 role guard tests + 11 proxy redirect tests.

## Conflict Resolution Log

1. **`package.json`** — three branches added different deps. Conflict between Agent 3's twilio/web-push additions and Agent 1's recharts. Resolved manually by including all deps alphabetized.
2. **`src/server/trpc/routers/index.ts`** — auto-merged across branches (each agent registered its router on a different line).
3. **`src/lib/database.types.ts`** — auto-merged. Agent 2 hand-added `alerts`; Agent 3 forgot to add `user_notification_prefs` and `push_subscriptions`. Caught in post-merge typecheck — added them by hand.
4. **`vitest.config.ts`** — Agent 1's `recharts` stub alias auto-merged.

## Post-Merge Integration Fixes

Single follow-up commit `b346e21`:

1. **`database.types.ts`** — hand-added `user_notification_prefs` and `push_subscriptions` table types (Row/Insert/Update/Relationships) so that fanout.ts and notifications.ts router stop hitting "table not assignable to never".
2. **`src/test/analytics/analytics.router.test.ts`** — added `role: "staff"` and `role: null` to test contexts after Agent 4 extended `TRPCContext`.
3. **`src/test/notifications/fanout.test.ts`** — typed `vi.fn` spies with explicit `(...args: unknown[]) => Promise<void>` signature for `(...args)` spread compatibility.
4. **`src/app/(dashboard)/insights/page.tsx`** — tightened the refrigeration LineChart `pivoted` data to `PivotRow` with required `date: string`.
5. **`src/hooks/usePushSubscription.ts`** — cast `urlBase64ToUint8Array` result to `BufferSource` for the push manager type.
6. **`src/server/notifications/fanout.ts`** — cast Json `subscription` field via `unknown` to `webpush.PushSubscription`.

## Phase C Gates — Status

| Gate | Status |
|---|---|
| Trends dashboards per module | ✅ (5 charts on /insights page) |
| Server-side anomaly detection + alerts table | ✅ (4 detectors + cron + persistence) |
| Notifications fan-out (email/SMS/web push) | ✅ (channels + dispatcher + cron wire) |
| Read-only owner/GM dashboards | ✅ (viewer role + route group) |
| typecheck + tests green | ✅ (158 passing) |

## Cost Framework Note

Same Phase B finding: Haiku rejected the Agent 4 viewer-role prompt at the harness level despite aggressive compression. Falling back to Sonnet remains the practical choice in this environment. The user-stated framework target was 75% Sonnet for Phase C; in practice we ran 100% Sonnet (4 of 4).

## Carry-Forward Items for Phase D

1. **Deprecation warnings** — Phase C added `twilio` and `resend`, both pulling in deprecated transitive deps. Non-blocking.
2. **VAPID keys not generated** — `usePushSubscription` will no-op until `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set.
3. **`useModuleConfig` Dexie integration** — still pending from Phase A. Should land in Phase E.
4. **CI workflow uses `lint:fix`** — still pending from Phase A.
5. **`/insights` placeholder under viewer route group** — Agent 4's `/(viewer)/dashboard/page.tsx` still has a TODO for wiring real charts.
6. **`fanout.test.ts` Sentry log noise** — tests pass but stderr shows captured exceptions; consider quieting in test setup.

## Files Created / Modified Summary

- 4 merge commits + 1 post-merge fix commit + 4 agent completion markers + scaffolding commit
- 4 new SQL migrations (015, 016, 017, 018) + 1 router (analyticsRouter), 1 router (alertsRouter), 1 router (notificationsRouter), 1 router middleware extension (viewerProcedure)
- 4 new chart components, 5 new server modules under `src/server/{anomaly,notifications}/`, 1 cron route, 1 push subscribe route, 1 web push hook, 1 viewer route group (3 pages + layout), 1 admin notification prefs card
- Tests added: analytics, charts, anomaly (3 files), notifications (2 files), viewer (2 files) — net new ≈ 68 tests
