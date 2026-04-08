# Phase G Agent 1 — Stripe Billing — Complete

**Branch:** `phase-g/stripe-billing`
**Worktree:** `/home/user/Rink-Reports-by-Max-Facility-LLC/.claude/worktrees/agent-ace1a7c6`
**Final SHA:** `86b27c5`

## Task Statuses

| Task | Status | SHA |
|------|--------|-----|
| Task 1 — DB migration (027_billing.sql + types + .env) | DONE | `a9df908` |
| Task 2 — Stripe webhook handler | DONE | `8f5c474` |
| Task 3 — Plan guard middleware | DONE | `5f4fdc3` |
| Task 4 — Billing UI (page + banner + checkout/portal routes) | DONE | `b7fa242` |
| Task 5 — Seat management | DONE | `a66427c` |
| Task 6 — Tests | DONE | `86b27c5` |

## Final SHA
`86b27c5`

## Files Created

- `supabase/migrations/027_billing.sql`
- `src/server/billing/planGuard.ts`
- `src/app/(dashboard)/billing/page.tsx`
- `src/components/ui/BillingBanner.tsx`
- `src/test/billing/planGuard.test.ts`
- `src/test/billing/webhook.test.ts`

## Files Modified

- `src/lib/database.types.ts` — billing_events + facility_config billing columns
- `.env.example` — STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID
- `src/app/api/stripe/webhook/route.ts` — full event handling rewrite
- `src/app/api/stripe/checkout/route.ts` — STRIPE_PRICE_ID fallback, 14-day trial
- `src/app/api/stripe/portal/route.ts` — facility_config lookup, return_url=/billing
- `src/server/trpc/routers/billing.ts` — getStatus + getSeatUsage procedures
- `src/server/trpc/trpc.ts` — billingProtectedProcedure factory
- `src/app/(dashboard)/_components/DashboardShell.tsx` — BillingBanner wired in
- `src/app/(dashboard)/layout.tsx` — Billing nav item
- `src/app/(dashboard)/admin/_components/UserManagementCard.tsx` — seat usage UI

## Test Results
346 tests passing across 45 files (up from 328/43)

## Design Decisions

1. Stripe is billing source of truth. facility_config fields are mirrors updated only by webhook (service-role client).
2. billing_events is the idempotency gate. UNIQUE on stripe_event_id: unique violation = already processed, return 200.
3. plan_status is our own state machine, not Stripe's enum. Allows 'locked' (past_due > 7 days) without Stripe string coupling.
4. billingProtectedProcedure factory exported but existing routers NOT modified — incremental adoption.
5. checkout uses STRIPE_PRICE_ID env var as single-facility price fallback, trial_period_days=14 only if no prior subscription.
6. CLAUDE.md Rule 1 enforced: facility_id always from session/ctx, never from client input.
7. CLAUDE.md Rule 8: webhook uses service-role client (Stripe signature is the auth). tRPC uses ctx.facilityId.
