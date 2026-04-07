# Phase B — Agent 3: useOfflineQuery

## Branch
`phase-b/offline-query`

## Worktree Path
`/home/user/Rink-Reports-by-Max-Facility-LLC/.claude/worktrees/agent-a722c6f2`

## Commit SHAs

| Task | SHA | Message |
|------|-----|---------|
| Task 1 — hook | `725e7d2` | feat(offline): useOfflineQuery — Dexie-first with network upgrade |
| Task 2 — Daily Reports | `af22e55` | feat(offline): apply useOfflineQuery to Daily Reports history |
| Task 3 — Tests | `2c73ce0` | test: useOfflineQuery — Dexie hit, miss, fresh, offline, refetch |
| Done marker | (this commit) | chore: phase-b agent 3 completion marker |

## Status

| Task | Status | Notes |
|------|--------|-------|
| Merge phase-b/pull-channel | Already merged (branch was already up to date) | No conflicts |
| Task 1: useOfflineQuery hook | DONE | `src/hooks/useOfflineQuery.ts` — committed at `725e7d2` |
| Task 2: Daily Reports refactor | DONE | `src/modules/daily-reports/components/RecentSubmissions.tsx` |
| Task 3: Tests | DONE | `src/test/hooks/useOfflineQuery.test.ts` — all 5 tests pass |

## Task 1 Notes

`useOfflineQuery.ts` was already present and committed at `725e7d2` (carried over from
a prior run). The implementation matches the spec exactly:
- `useLiveQuery` for live Dexie reads
- `filter` + optional `sort` in `useMemo`
- `lastFetchedAt` state drives `isStale`
- `isLoading` = `rawLive === undefined OR (empty AND not fetched AND no error)`
- On mount + refetch: calls fetcher, `bulkPut`s results, captures errors silently
- AbortController prevents stale state updates after unmount
- `reportError` dynamically imports Sentry (fire-and-forget)

`dexie-react-hooks@^1.1.7` was in `package.json` but not yet installed in this
worktree's `node_modules`. `npm install` was run to make the package available
for tests and runtime use.

## Task 2 Notes: Daily Reports Refactor Strategy

### Component examined
`src/modules/daily-reports/components/RecentSubmissions.tsx`

This is a `"use client"` component — no wrapping was needed. It was refactored
in place.

### What changed
- Removed `trpc.dailyReports.listRecent.useQuery()` direct usage.
- Added `useOfflineQuery<RecentSubmission>` with:
  - `table: "dailyReports" as unknown as keyof typeof db` (cast required because
    Agent 1's table additions live on `phase-b/dexie-schema` and are not yet merged
    into this branch's `db.ts`)
  - `filter`: 30-day ISO string cutoff on `submitted_at`
  - `sort`: descending by `submitted_at` using `localeCompare`
  - `fetcher`: calls `utils.dailyReports.pull.fetch({ since })` (same pattern as
    `usePullChannel`) for the last 14 days
  - `staleTime`: 5 minutes (default)
- Added `isStale` badge ("cached" in grey) next to the heading.
- Added error banner (only shown when `error !== null` AND both `data` and `pending`
  are empty — cached data is still rendered otherwise).
- Kept the `isLoading` spinner unchanged.
- Kept the pending queue (Dexie queue polling) entirely unchanged.

### Why the cast is needed
`DexieTable = keyof typeof db` on this branch resolves to `"queue" | "cachedConfig"`.
Agent 1's `dailyReports` table is declared on `phase-b/dexie-schema`. The cast
`"dailyReports" as unknown as keyof typeof db` is safe at runtime because
`useOfflineQuery` already accesses the table via `(db as unknown as Record<...>)[table]`.
Type safety is enforced at the call site through `OfflineQueryOptions<RecentSubmission>`.

## Task 3 Notes: Test Implementation

All 5 tests pass. Key mock strategy:
- `useLiveQuery` is mocked via `vi.mock("dexie-react-hooks")` — the mock calls the
  querier function (to register the subscription) then immediately returns the
  configured data array.
- `db.dailyReports.bulkPut` is spied on to verify upsert calls.
- Test 4 generates expected `console.error` output (the Sentry capture path) — this is
  correct behavior, not a test failure.
- Test 2 uses a manually-resolved Promise to test the pending-fetch loading state.
