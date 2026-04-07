# RinkReports by Max Facility

RinkReports is the operations platform for ice rinks built by Max Facility LLC.
It replaces paper logs and spreadsheets with offline-first daily reports, ice
depth tracking, ice operations, refrigeration and air-quality monitoring,
incidents, scheduling, and communications — all configured per facility through
an Admin Control Center, with strict per-facility data isolation enforced both
in tRPC and in Supabase RLS.

## Getting Started

```bash
git clone https://github.com/Max-Facility-LLC/Rink-Reports-by-Max-Facility-LLC.git
cd Rink-Reports-by-Max-Facility-LLC
cp .env.example .env.local   # then fill in real Supabase values
npm install
npm run dev
```

The dev server runs on http://localhost:3000. Node 20 is the supported runtime.

You will need a Supabase project and the four environment variables listed in
`.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only — never import from client code)
- `NEXT_PUBLIC_TRPC_URL` (optional override)

## Architecture Overview

- **Next.js 16, App Router, TypeScript strict.** Routes live under `src/app`,
  split into `(auth)` and `(dashboard)` route groups. The middleware lives in
  `src/proxy.ts`.
- **tRPC at `src/server/trpc`.** A single handler is mounted at
  `/api/trpc/[trpc]`. Routers live in `src/server/trpc/routers`, the request
  context is built in `src/server/trpc/context.ts`, and procedures /
  middleware live in `src/server/trpc/trpc.ts`. Every request resolves the
  caller's `facility_id` from `user_profiles` and exposes it as
  `ctx.facilityId`. Procedures must read `facility_id` from context — never
  from client input.
- **Supabase with Row Level Security.** Schema and policies live under
  `supabase/`. RLS policies use the `get_user_facility_id()` SQL function so
  the database enforces facility isolation independently of the application
  layer. Generated types live in `src/lib/database.types.ts`; browser and
  server clients live in `src/lib/supabase.ts` and `src/lib/supabase-server.ts`.
- **Offline-first writes via Dexie.** Forms write to IndexedDB through the
  Dexie schema in `src/lib/offline/db.ts` and show success immediately. The
  background sync engine in `src/lib/offline/sync-engine.ts` posts queued
  records to the `/api/sync` route, which is the only non-tRPC application
  route allowed in this codebase.
- **Modules are self-contained.** Each module under `src/modules/<name>` owns
  its components, hooks, and Zod schema. Tab names, dropdown values,
  thresholds, and other configuration are read at runtime from the
  `facility_config` table via the `useModuleConfig()` hook in
  `src/hooks/useModuleConfig.ts` — never hardcoded.

## Non-Negotiables

These rules come from `CLAUDE.md` and are enforced in code review:

1. **`facility_id` is never accepted from client input.** It is always read
   from `ctx.facilityId` in the tRPC context.
2. **No hardcoded dropdown values in module code.** All tabs, options, and
   thresholds come from `facility_config` via `useModuleConfig()`.
3. **Offline-first writes are mandatory.** Every form writes to Dexie first
   and shows success immediately; the server sync runs in the background.
4. **No seed scripts for business data.** Only the facility row and module
   list may be seeded; everything else is configured by facility admins
   through the Admin Control Center UI.
5. **No TypeScript `any`.** Use `unknown` and narrow with Zod.
6. **No mock data.** Empty modules show an empty state, never placeholders.
7. **tRPC only for app data.** The only non-tRPC routes allowed are
   `/api/trpc` (the handler) and `/api/sync` (the offline sync endpoint).
8. **RLS is enforced at the database AND the server.** Both layers must be
   present; neither replaces the other.

## Available Scripts

- `npm run dev` — start the Next.js dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — run ESLint
- `npm run lint:fix` — run ESLint with `--fix`
- `npm run typecheck` — run `tsc --noEmit`
- `npm run test` — run the Vitest suite once
- `npm run test:watch` — run Vitest in watch mode
- `npm run test:coverage` — run Vitest with coverage reporting
