# Phase C — Agent 3 Completion Marker

## Branch
`phase-c/notifications`

## Final SHA
`91b8c36`

## Worktree
`/home/user/Rink-Reports-by-Max-Facility-LLC/.claude/worktrees/agent-a189b649`

## Task Statuses

| Task | Status | SHA |
|------|--------|-----|
| Task 1 — user_notification_prefs table + RLS | COMPLETE (by prior commit) | 27cb4ca |
| Task 2 — Email / SMS / Push channel implementations | COMPLETE (by prior commit) | 6b30f40 |
| Task 3 — Web push subscription endpoint + hook | COMPLETE | 14b3253 |
| Task 4 — Fan-out service wired into anomaly cron | COMPLETE | af97310 |
| Task 5 — Admin notification preferences UI | COMPLETE | f638248 |
| Task 6 — Tests (fan-out + push subscribe) | COMPLETE | 91b8c36 |

## Files Created / Modified

### Migrations
- `supabase/migrations/017_notification_prefs.sql` — user_notification_prefs table + RLS
- `supabase/migrations/018_push_subscriptions.sql` — push_subscriptions table + RLS

### Server — notification channels
- `src/server/notifications/email.ts` — Resend email with branded HTML template
- `src/server/notifications/sms.ts` — Twilio SMS
- `src/server/notifications/push.ts` — web-push with VAPID
- `src/server/notifications/fanout.ts` — fan-out dispatcher (fire-and-forget, allSettled)

### Server — tRPC
- `src/server/trpc/routers/notifications.ts` — getNotificationPrefs + upsertNotificationPrefs
- `src/server/trpc/routers/index.ts` — registered notificationsRouter

### Server — anomaly
- `src/server/anomaly/persist.ts` — extended PersistResult with insertedAlerts

### Cron
- `src/app/api/cron/anomaly-scan/route.ts` — wired fanOutAlert per new alert

### Push subscription API
- `src/app/api/push/subscribe/route.ts` — POST handler; validates, resolves facilityId, upserts

### Hooks
- `src/hooks/usePushSubscription.ts` — subscribe/unsubscribe with VAPID + SW registration

### UI
- `src/app/(dashboard)/admin/_components/NotificationPrefsCard.tsx` — full preferences card
- `src/app/(dashboard)/admin/page.tsx` — NotificationPrefsCard wired in

### Types
- `src/lib/offline/types.ts` — NotificationPrefs type (already present from prior commit)

### Tests
- `src/test/notifications/fanout.test.ts` — 6 tests
- `src/test/notifications/push.subscribe.test.ts` — 4 tests
- `src/test/anomaly/persist.test.ts` — updated for insertedAlerts shape
- `src/test/anomaly/cron.route.test.ts` — updated mocks (insertedAlerts, fanout mock)

## Test Results
115 tests passing across 20 test files. No regressions.

## Key Design Decisions
- `fanOutAlert` returns early for info severity (UI-only per spec)
- `Promise.allSettled` used for both per-channel and per-facility isolation
- facility_id always resolved server-side from user_profiles (CLAUDE.md Rule 1)
- Push subscribe endpoint uses service-role client for the UPSERT to handle
  the ON CONFLICT path without requiring the user to have UPDATE permission
- VAPID key generation instructions are code comments only — never hardcoded
