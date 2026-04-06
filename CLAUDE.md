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
### Phase 0 — Foundation (current)
Supabase schema, tRPC, Auth, Dexie, Admin config API

### Phase 1 — Admin Control Center UI
Facility settings, module toggles, per-module config panels,
user management

### Phase 2 — Daily Reports + Ice Operations
### Phase 3 — Refrigeration + Air Quality
### Phase 4 — Ice Depth + Incidents
### Phase 5 — Scheduling + Communications
### Phase 6 — Platform (Stripe, HubSpot, multi-facility)

## Environment Variables Needed
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_TRPC_URL

## Current Phase
PHASE 0 — Do not build module UI until Phase 0 exit gate passes.
