# Phase G Agent 2 — HubSpot Sync Completion

## Summary
Agent 2 completed comprehensive HubSpot CRM sync infrastructure for RinkReports, delivering one-way facility data synchronization from the billing pipeline to HubSpot without blocking any critical paths.

## Tasks Completed

### T1: Property Mapping + Core Sync Function
- Created `src/server/hubspot/sync.ts` with `syncFacilityToHubSpot()` function
- Property mapping:
  - Company: name, address, rr_plan_status, rr_plan_tier, rr_stripe_customer_id
  - Contact: email, firstname, lastname, company, rr_plan_status, rr_plan_tier, rr_trial_ends_at, rr_seat_count, rr_signup_date
  - Deal: dealname, dealstage (mapped from plan_status: trial→Trial Started, active→Active Customer, past_due→Payment Issue, locked→Payment Issue, cancelled→Churned)
- Search-first pattern: finds by rr_stripe_customer_id (company), email (contact), company association (deal)
- Upsert logic: creates if missing, patches if exists
- All API calls wrapped in try/catch; errors logged to console and Sentry, never thrown
- Best-effort with Sentry isolation: failures don't block the sync process

### T2: Webhook Integration
- Wired `syncFacilityToHubSpot()` into Stripe webhook handler (`src/app/api/stripe/webhook/route.ts`)
- Fire-and-forget dispatch pattern:
  ```ts
  void Promise.resolve().then(() =>
    syncFacilityToHubSpot(facilityId).catch((err) =>
      Sentry.captureException(err, { tags: { context: "hubspot-sync" } }),
    ),
  );
  ```
- Events: customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.payment_succeeded, invoice.payment_failed, checkout.session.completed
- Zero latency added to webhook response time

### T3: New Facility Signup Sync
- Updated `src/server/trpc/routers/onboarding.ts`
- On `createFacility` mutation success, dispatches comprehensive HubSpot sync (company, contact, deal)
- Preserves legacy `createOrUpdateContact()` call for backward compatibility
- Fire-and-forget with Sentry isolation

### T4: Manual Resync Procedure
- Added `resyncHubSpot` tRPC procedure to `src/server/trpc/routers/admin.ts`
- Super-admin role required (more privileged than admin)
- Two modes:
  - `{ facilityId: "uuid" }` — sync one facility, return `{ synced: 1, errors: 0 }`
  - `{}` — sync all facilities, paginated, return `{ synced: N, errors: M }`
- Built for admin debugging and recovery scenarios

### T5: Test Suite
- Created `src/test/hubspot/sync.test.ts` with vitest
- Tests cover:
  1. New facility sync: company create + contact create + deal create
  2. Plan status mapping: active→"Active Customer"
  3. Plan status mapping: cancelled→"Churned"
  4. HubSpot API failure: graceful degradation with Sentry capture
  5. Missing HUBSPOT_API_KEY: early return, no fetch calls
  6. Missing Supabase credentials: early return, no fetch calls

## Commits
1. `feat(hubspot): property mapping + syncFacilityToHubSpot`
2. `feat(hubspot): wire HubSpot sync into Stripe webhook events`
3. `feat(hubspot): sync new facility on signup`
4. `feat(hubspot): manual resync procedure for all facilities`
5. `test: HubSpot sync + webhook integration`

## Design Decisions

### One-Way Sync (RinkReports → HubSpot)
- HubSpot is a marketing/customer success tool, not the source of truth
- Facility config (billing, subscription) lives in Supabase, synced outbound only
- No bi-directional conflict resolution needed

### Fire-and-Forget Pattern
- All HubSpot syncs dispatch asynchronously without awaiting
- Stripe webhook returns 200 immediately; sync runs in background
- Onboarding mutation returns facility_id immediately; sync runs in background
- Failures captured to Sentry but never thrown to caller
- Ensures no latency penalty for the user

### Best-Effort Architecture
- Missing HUBSPOT_API_KEY → silent no-op (dev environments work without HubSpot)
- HubSpot API down → errors logged, Sentry alerted, caller unaffected
- Email lookup failure (auth.users unavailable in service-role context) → skip Contact sync, continue with Company and Deal

### Search-First Upsert
- Company searched by rr_stripe_customer_id (unique identifier from Stripe)
- Contact searched by email (standard HubSpot identifier)
- Deal searched by associated company (prevents duplicate deals)
- If search fails or returns undefined (API down), create new record; if returns null (not found), create; if returns id, patch

## Known Limitations & TODO

1. **Email from auth.users**: Service-role Supabase client cannot directly fetch auth.users email. Currently skips Contact sync if email is unavailable. TODO: add email column to user_profiles or use a separate lookup mechanism.

2. **No timezone/unit preference sync**: Currently syncs facility name and address only. TODO: extend to temperature unit, length unit, timezone if HubSpot custom properties are added.

3. **No custom property discovery**: Assumes rr_* custom properties exist in HubSpot. TODO: add property creation on first sync or provide onboarding documentation.

## Integration Points

### Stripe Webhook (6 events)
- `checkout.session.completed` — initial subscription link
- `customer.subscription.created` — new subscription
- `customer.subscription.updated` — plan/seat changes
- `customer.subscription.deleted` — churn
- `invoice.payment_succeeded` — payment recovery
- `invoice.payment_failed` — payment issue

### Onboarding Flow
- `createFacility` mutation syncs new facility to HubSpot on success

### Admin Control Center
- `admin.resyncHubSpot` procedure allows manual recovery/debugging

## Environment Variables Required
- `HUBSPOT_API_KEY` — HubSpot API key (optional; silent no-op if missing)
- `NEXT_PUBLIC_SUPABASE_URL` — already set
- `SUPABASE_SERVICE_ROLE_KEY` — already set

## Testing
- Vitest suite covers happy path, deal stage mapping, failure handling, and environment variable edge cases
- Mock Supabase client and global fetch for API isolation
- Sentry mocked to verify error capture calls

## Phase G Context
This work completes the HubSpot sync layer for Phase G (Platform & GTM). Facilities are now automatically synchronized to HubSpot whenever:
- A new facility is created (onboarding)
- Stripe subscription state changes (webhook)
- Admins manually trigger resync (recovery)

Next work: Phase F (AI assists) or further Phase G enhancements (Slack integration, webhook outbound, etc.).
