# Phase B — Agent 2 (Pull Channel) Completion Marker

## Branch
`phase-b/pull-channel`

## Worktree path
`/home/user/Rink-Reports-by-Max-Facility-LLC/.claude/worktrees/agent-aa2b2db9`

## Task Status

### Task 1 — tRPC pull procedures for all 6 modules
**STATUS: COMPLETE**
Commit: `47ba327`

All 6 routers have a `pull` query:
- `src/server/trpc/routers/daily-reports.ts` — `submitted_at >= since`
- `src/server/trpc/routers/ice-operations.ts` — `submitted_at >= since`
- `src/server/trpc/routers/refrigeration.ts` — `submitted_at >= since`
- `src/server/trpc/routers/air-quality.ts` — `submitted_at >= since`
- `src/server/trpc/routers/ice-depth.ts` — `submitted_at >= since`
- `src/server/trpc/routers/incidents.ts` — `submitted_at >= since`

Each uses `protectedProcedure`, filters by `ctx.facilityId` (Rule 1 + 8),
and returns raw rows without reshaping. All tables exist in Supabase (no
stubs needed).

### Task 2 — usePullChannel hook
**STATUS: COMPLETE**
Commit: `84f653b`

Files:
- `src/lib/offline/types.ts` — six cached-read interfaces
  (`CachedDailyReport`, `CachedIceOperation`, `CachedRefrigerationReading`,
  `CachedAirQualityReading`, `CachedIceDepthSession`, `CachedIncident`)
- `src/hooks/usePullChannel.ts` — the hook itself

Key design decisions:
- `trpc.useUtils()` is stored in a ref (`utilsRef`) so `pullAll` has an
  empty dependency array — avoids infinite re-render loop from the
  `useCallback` + `useEffect` dependency chain.
- Six sequential module pulls each in their own try/catch.
- AbortController wired to mount/unmount effect.
- Online event debounced 2000ms via `setTimeout` ref.
- db table casts through `unknown` since Agent 1's Dexie migration adds
  the module tables in parallel; the runtime will error if tables are
  missing, which is correct behaviour.

### Task 3 — SyncContext + wire into layout
**STATUS: COMPLETE**
Commit: `8fcee83`

Files:
- `src/context/SyncContext.tsx` — `SyncContext` + `useSyncContext()` helper
- `src/components/layout/SyncProvider.tsx` — calls `usePullChannel()`,
  provides values; `pendingCount` defaults to 0 (Agent 5 replaces)
- `src/components/layout/index.ts` — `SyncProvider` exported
- `src/app/(dashboard)/_components/DashboardShell.tsx` — children wrapped
  in `<SyncProvider>`

### Task 4 — Tests
**STATUS: COMPLETE — all 4 tests pass (79 total, 0 failures)**
Commit: `2fe6ce5`

File: `src/test/hooks/usePullChannel.test.ts`

Tests:
1. Mount: all 6 pull.fetch called with since ~14 days ago (within 5s)
2. Online event: after 2000ms debounce, pull fires again
3. Upsert: pull results flow through adapters into db.<table>.bulkPut
4. Failure isolation: one module throwing resets isPulling, sets error,
   but the other 5 modules still complete their pulls

Mocking strategy:
- `@/lib/offline/db` mocked with per-table `bulkPut` vi.fn() spies
- `@/lib/trpc` mocked with `useUtils()` returning per-module `pull.fetch`
  vi.fn() stubs

SKIPPED:
- Sentry dynamic import path is not tested — fire-and-forget side effect
  that would require complex async module import mocking. Covered by
  existing Phase A Sentry tRPC formatter tests.

## Commit SHAs (in order)
1. `47ba327` — feat(pull): tRPC pull procedures for all 6 modules
2. `84f653b` — feat(pull): usePullChannel hook — boot + online event pull
3. `8fcee83` — feat(pull): wire usePullChannel into app layout via SyncProvider
4. `2fe6ce5` — test: usePullChannel — mount, online event, upsert, failure isolation
5. (this file) — chore: phase-b agent 2 completion marker

## Notes for downstream agents
- `useSyncContext()` is available throughout the dashboard tree.
  Import from `@/context/SyncContext`.
- `pendingCount` in SyncContext is hardcoded to 0. Agent 5 should
  replace this with a `useLiveQuery` on `db.queue.where('syncedAt').equals(0).count()`.
- The six module Dexie tables are NOT yet in `src/lib/offline/db.ts`.
  Agent 1 owns that migration. The hook casts through `unknown` at runtime.
- `triggerPull()` is stable and safe to call from anywhere in the tree.
