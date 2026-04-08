# Phase B — Truly Offline-First — COMPLETE

Date: 2026-04-07
Branch: `claude/rink-reports-assessment-1DBXg`

## Result

- `npm run typecheck` — clean
- `npm run test` — **90 passed** across 15 test files (up from 75 in Phase A)
- All 6 specialist branches merged

## Specialist Branches

| Agent | Branch | Model | Status | Final SHA |
|---|---|---|---|---|
| 1 — Dexie Schema | `phase-b/dexie-schema` | Sonnet (Haiku fallback) | merged | `8fed658` |
| 2 — Pull Channel | `phase-b/pull-channel` | Sonnet | merged (FF) | `525361a` |
| 3 — useOfflineQuery | `phase-b/offline-query` | Sonnet | merged | `1139743` |
| 4 — PWA | `phase-b/pwa` | Sonnet (Haiku fallback) | merged | `97131da` |
| 5 — Sync UX | `phase-b/sync-ux` | Sonnet (Haiku fallback) | merged | `78c2bd2` |
| 6 — Sync Refactor | `phase-b/sync-refactor` | Sonnet | merged | `f7c68b5` |

Merge order executed: dexie-schema → sync-refactor → pull-channel (no-op, already on HEAD) → offline-query → sync-ux → pwa.

## Cost Framework Note

The user specified Haiku for Agents 1, 4, and 5 (mechanical/spec-driven tasks). All three were rejected by the harness with "Prompt is too long" even after aggressive compression. The minimum spec each agent needed exceeded Haiku's per-task input ceiling in this environment. Falling back to Sonnet was the practical call. For Phase C, even more terse pattern-only specs ("do exactly what Agent X did, but for module Y") may fit within Haiku's limit and are worth retrying.

## What Landed

### Agent 1 — Dexie Schema
- `src/lib/offline/types.ts` — 6 `*Cache` interfaces extending a `BaseCacheEntry` (serverId, facilityId, submittedAt, syncedAt). Coexists with Agent 2's server-shaped `Cached*` interfaces in the same file.
- `src/lib/offline/db.ts` — version(2) added (version(1) untouched), 6 new `EntityTable<T, "serverId">` properties on `RinkReportsDB`.
- `src/lib/offline/index.ts` — barrel re-exporting db, types, and existing exports.
- `src/test/helpers/seedDexie.ts` — 6 seed helpers with safe defaults for tests.
- `fake-indexeddb` added to devDeps.

### Agent 2 — Pull Channel
- `pull` query added to all 6 module routers (daily-reports, ice-operations, refrigeration, air-quality, ice-depth, incidents). Each takes `{ since: ISO datetime }`, filters by `ctx.facilityId`, returns raw rows.
- `src/hooks/usePullChannel.ts` — boot-pull on mount, 2000ms-debounced `online`-event pull, AbortController for unmount safety. Six sequential module pulls each isolated in try/catch. Uses a `utils` ref to keep `pullAll` dep array empty.
- `src/context/SyncContext.tsx` + `src/components/layout/SyncProvider.tsx` — context wrapper, wired into DashboardShell.
- 4-test suite for usePullChannel.

### Agent 3 — useOfflineQuery
- Branched from pull-channel so it could consume `SyncContext` and the pull procedures.
- `src/hooks/useOfflineQuery.ts` — Dexie-first via `useLiveQuery`, network upgrade via `bulkPut`, `isStale` derived from `lastFetchedAt`, `isLoading` true only when Dexie is empty AND no first-fetch result, error isolation (never throws to UI), `refetch()` ignores staleTime, AbortController on unmount.
- `src/modules/daily-reports/components/RecentSubmissions.tsx` — proof-of-concept refactor: replaces `useQuery` with `useOfflineQuery`, adds "cached" badge when `isStale`, error banner only when data is empty.
- 5-test suite for useOfflineQuery.

### Agent 4 — PWA
- `@ducanh2912/next-pwa` installed, composed with Sentry: `withSentryConfig(pwa(nextConfig), sentryOptions)` in `next.config.ts`.
- `src/app/manifest.ts` — Next 16 metadata API, brand colors, standalone display, /dashboard start_url.
- `public/icons/icon-192.svg` and `icon-512.svg` — navy + green wordmark.
- iOS meta tags via `appleWebApp` in root layout's metadata export.
- `src/components/ui/InstallPrompt.tsx` — `beforeinstallprompt` capture, dismissible (localStorage), hidden in standalone mode. Wired into DashboardShell.
- `src/app/offline/page.tsx` + `OfflineRetryButton.tsx` — fallback page served when SW catches a navigation request offline.

### Agent 5 — Sync UX
- `src/hooks/useSyncStatus.ts` — `pendingCount` via live `db.queue.where('syncedAt').equals(0).count()`, `lastSyncedAt` from localStorage, listens for `rr:sync-ack` window CustomEvent, fires success toast on `pending > 0 → 0` transition.
- `src/lib/offline/sync-engine.ts` — dispatches `rr:sync-ack` after every successful `bulkPut`.
- `src/lib/toast.ts` — tiny event bus.
- `src/components/ui/ToastHost.tsx` — fixed bottom-right portal, max 3 visible, auto-dismiss with backlog. Wired into DashboardShell.
- `src/components/layout/Header.tsx` — now subscribes to live sync state and renders `SyncStatus` with `triggerPull` from context as `onRetry`.
- `src/components/layout/SyncStatus.tsx` — responsive: dot-only on mobile, full text on `md+`.
- `dexie-react-hooks` added (with a test stub at `src/test/stubs/dexie-react-hooks.ts` aliased in vitest.config to keep jsdom happy).
- 3-test suite for useSyncStatus.

### Agent 6 — Sync Refactor
- `src/server/sync/types.ts` — `SyncRecord`, `SyncContext`, `SyncResultRow`, `SyncHandler`.
- `src/server/sync/handlers/` — 6 per-table handler files (daily-reports, ice-operations, air-quality, ice-depth, incidents, refrigeration), each preserving the EXACT logic from the original route — including air-quality threshold lookup + tier compute, ice-depth completed-status freeze + racing-replay catch, incidents JSONB write, every dup-key replay path.
- `src/server/sync/registry.ts` — `Map<string, SyncHandler>` keyed by table name.
- `src/app/api/sync/route.ts` — rewritten as a 55-line dispatcher (down from ~430 lines). Auth + facility check + per-record dispatch + Sentry catch.
- `src/test/sync/registry.test.ts` — 3 tests confirming all 6 tables registered, unknown returns undefined, smoke checks.
- All 4 pre-existing sync tests still pass — zero behavior change.

## Conflict Resolution Log

1. **`src/lib/offline/types.ts`** — both Agent 1 and Agent 2 created the file with completely different (but complementary) interface sets. Resolution: keep BOTH sets in the file. Agent 2's `Cached*` (snake_case, server-shaped) feed `usePullChannel`; Agent 1's `*Cache` (camelCase, client-shaped) feed `db.ts` and `useOfflineQuery`. Documented both blocks with header comments explaining the split.

2. **`src/app/(dashboard)/_components/DashboardShell.tsx`** — Agent 4 added `import InstallPrompt`, Agent 5 added `import ToastHost`. Agent 5's earlier merge brought in ToastHost, then Agent 4's merge conflicted on the import line. Resolution: keep both imports; the merged JSX already had both `<InstallPrompt />` and `<ToastHost />` rendered.

3. **`package.json`** — auto-merged across all six branches. Multiple devDeps added (`fake-indexeddb`, `dexie-react-hooks`, `@ducanh2912/next-pwa`).

4. **`vitest.config.ts`** — Agent 5 added a `dexie-react-hooks` alias to a test stub. Auto-merged cleanly.

## Post-Merge Integration Fixes

Single follow-up commit `f7cb64e fix: post-merge integration — Phase B strict-mode + lockfile`:

1. **`ToastHost.tsx`** — 3 `noUncheckedIndexedAccess` violations: backlog destructure, visible array tail access. Added explicit `if (!last) return;` and `if (next === undefined) return bl;` guards.
2. **`useOfflineQuery.ts`** — 2 `noUncheckedIndexedAccess` violations on the `(db as any)[table]` indexed lookups. Added narrow guards before `.toArray()` / `.bulkPut()`.
3. **`package-lock.json`** refreshed after `npm install` of Phase B deps.

## Phase B Gates — Status

| Gate | Status |
|---|---|
| Dexie schema extended (6 module read caches) | ✅ |
| Pull channel (boot + online debounce) wired into layout | ✅ |
| `useOfflineQuery` hook + 1 page proof-of-concept | ✅ (Daily Reports `RecentSubmissions`) |
| PWA: manifest, icons, install prompt, offline page, service worker | ✅ |
| Live `pendingCount` + `lastSyncedAt` in header, retry button | ✅ |
| `/api/sync` refactored to handler registry | ✅ |
| typecheck + tests green | ✅ (90 passing) |

## Carry-Forward Items for Phase C

1. **`useModuleConfig` Dexie integration is still pending.** Phase A flagged this — the hook is still a thin tRPC wrapper. Phase C should migrate it to use `useOfflineQuery` so config reads survive offline.
2. **Only Daily Reports `RecentSubmissions` was migrated to `useOfflineQuery`.** The other 5 modules' read components still use raw `useQuery`. Phase C should sweep them.
3. **`pendingCount` in `SyncContext` is still stubbed at 0.** `useSyncStatus` exists and computes it correctly — Phase C should plumb the live value into the context provider.
4. **6 → 11 npm vulnerabilities** after Phase B installs (next-pwa pulled in `glob`, `whatwg-encoding`, etc.). Triage in Phase C.
5. **Sentry deprecation warnings** persist. Non-blocking.
6. **Lint check tightening**: CI still uses `lint:fix` instead of `lint`. Remains a Phase A carry-forward.

## Files Created / Modified Summary

- 6 merge commits + 1 post-merge fix commit + 6 agent completion markers
- New files: 6 sync handler files, registry, types; useOfflineQuery + tests; usePullChannel + tests; useSyncStatus + tests + stub; SyncContext + SyncProvider; toast + ToastHost; InstallPrompt; offline page + retry button; manifest; 2 PWA SVG icons; 6 seed helpers; offline types extension; Dexie version(2)
- Modified: CLAUDE.md, next.config.ts, package.json, package-lock.json, vitest.config.ts, sync-engine.ts, /api/sync/route.ts, Header.tsx, SyncStatus.tsx, DashboardShell.tsx, RecentSubmissions.tsx, src/app/layout.tsx, all 6 module router files (added pull procedure)
