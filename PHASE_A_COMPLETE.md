# Phase A — Reality Reset & Hardening — COMPLETE

Date: 2026-04-07
Branch: `claude/rink-reports-assessment-1DBXg`

## Result

- `npm run typecheck` — ✅ clean
- `npm run test` — ✅ **75 passed** across 11 test files
- All 4 specialist branches merged

## Specialist Branches

| Agent | Branch | Status | Final SHA |
|---|---|---|---|
| 1 — Docs & Config | `phase-a/docs-config` | merged | `524d1a1` |
| 2 — Test Scaffolding | `phase-a/tests` | merged | `be9b622` |
| 3 — Components | `phase-a/components` | merged | `9127581` |
| 4 — Sentry & Infra | `phase-a/sentry-infra` | merged | `c4483fa` |

Merge order executed: docs-config → sentry-infra → tests → components.
One expected `package.json` conflict (Agent 2 vs Agent 4 scripts) — resolved by keeping additions from both sides.

## What Landed

### Agent 1 — Docs & Config
- `CLAUDE.md` rewritten: Current Phase = Phase A; old phase claims moved to `## CHANGELOG`; Phase Gates rescoped to Phase A only.
- `README.md` replaced with real getting-started + architecture overview + non-negotiables digest.
- `npm` scripts added: `typecheck`, `lint:fix`, `test`, `test:watch`, `test:coverage`.
- `.github/workflows/ci.yml` — runs typecheck → lint:fix → test on PR and push to main (Node 20).
- `DEPENDENCY_AUDIT.md` — `lucide-react` corrected from `^1.7.0` to `^0.460.0`; remaining suspect pins flagged for human review.

### Agent 2 — Test Scaffolding
- Vitest + Testing Library + jsdom + coverage-v8 + plugin-react installed.
- `vitest.config.ts` + `src/test/setup.ts` scaffolded.
- **Schema tests** (Task 5): all 8 module schemas covered — daily-reports, ice-operations, refrigeration, air-quality, ice-depth, incidents, scheduling, communications.
- **Sync route tests** (Task 6): 401 unauth, 403 no facility, dup-key idempotent replay, unknown table.
- **tRPC canary** (Task 7): single iterating file `auth-canary.test.ts` covers all 11 routers — admin, dailyReports, iceOperations, refrigeration, airQuality, iceDepth, incidents, scheduling, communications, onboarding, billing.
- **useModuleConfig tests** (Task 8): 3 tests against the real shape (row-flattening, empty data, error propagation). Cache-hit/miss/offline-fallback sub-tests **deferred** — the current hook is a thin tRPC wrapper with **no Dexie/offline logic yet**, contradicting CLAUDE.md Rule 3. Flagged in `AGENT2_DONE.md` and below.

### Agent 3 — Components
- `src/components/layout/` created with: `Header`, `Sidebar`, `MobileNav`, `OfflineBanner`, `SyncStatus`, plus a barrel `index.ts`.
- `src/components/ui/index.ts` empty barrel for the future ui primitives.
- `--color-brand-*` tokens added to `globals.css`.
- `src/app/(dashboard)/_components/DashboardShell.tsx` — client wrapper owning mobile-menu state.
- `src/app/(dashboard)/layout.tsx` — refactored to feed user/facility/navItems into `DashboardShell`. Auth gate preserved. No page files touched.

### Agent 4 — Sentry & Infra
- `@sentry/nextjs ^10.47.0` (bumped post-merge from agent's `^8.40.0` after install conflict — see post-merge fixes below).
- `sentry.{client,server,edge}.config.ts` at repo root.
- `next.config.ts` wrapped with `withSentryConfig` (preserved original `nextConfig`).
- `src/server/trpc/trpc.ts` — `errorFormatter` captures `INTERNAL_SERVER_ERROR` to Sentry.
- `src/proxy.ts` — try/catch wraps the proxy, Sentry captures and re-throws.
- `src/app/api/sync/route.ts` — try/catch wraps `POST`, returns 500 on uncaught.
- `.env.example` — Sentry env vars appended.

## Post-Merge Integration Fixes

Single follow-up commit `1d76b25 fix: post-merge integration — Sentry v10 + strict-mode test fixes`:

1. **Sentry version bump**: Agent 4 pinned `^8.40.0`, but Sentry 8 and 9 do not support Next 16. Bumped to `^10.47.0` (peer range `^16.0.0-0`).
2. **Sentry 10 API change**: `withSentryConfig` no longer accepts a 3rd `sentryWebpackPluginOptions` argument. Collapsed to the 2-arg form.
3. **`noUncheckedIndexedAccess` strict-mode hits**: 5 violations across two test files — added non-null assertions on indexed access where the test had already asserted length.
4. **`DailyReportSubmissionInput` fixture mismatch**: the dup-key test passed `answers: []` but the schema requires `z.record(...)` (an object). Fixed to `answers: {}`. This was causing the test to silently take the "invalid payload" branch instead of the dup-key branch.
5. **Vitest discovery**: excluded `**/.claude/**` so the agent worktree directories (gitignored but present on disk) don't double-run every test.

## Phase A Gates — Status

| Gate | Status |
|---|---|
| CI green (typecheck + lint:fix + test) | typecheck ✅ test ✅ — CI workflow exists, will run on next push |
| Test coverage: schemas, /api/sync, tRPC auth canary, useModuleConfig | ✅ (with one partial — see below) |
| Layout components exist (Header, Sidebar, MobileNav, OfflineBanner, SyncStatus) | ✅ |
| Sentry wired into tRPC, proxy, /api/sync | ✅ |

## Carry-Forward Items for Phase B

These came out of Phase A but belong in the next phase:

1. **`useModuleConfig` does not implement the Dexie offline pattern** that CLAUDE.md Rule 3 mandates. It is currently a thin `trpc.admin.getConfig.useQuery` wrapper. Phase B's "truly offline-first" work needs to introduce: read from `db.cachedConfig` first → upgrade from network → write back to cache.
2. **`@sentry/nextjs` deprecation warnings** during install (whatwg-encoding, glob). Non-blocking but worth a follow-up.
3. **`DEPENDENCY_AUDIT.md`** lists several pins flagged for human review (jspdf, stripe, @supabase/ssr, next/react/zod/@trpc/*). None blocking.
4. **6 moderate severity npm vulnerabilities** reported by `npm install`. Run `npm audit` and triage in Phase B.
5. **CI workflow uses `lint:fix`** which auto-modifies files. CI typically uses `lint` (check-only). Worth tightening so PRs fail loudly instead of silently fixing.

## Files Created / Modified Summary

- 4 merge commits + 1 post-merge fix commit + 4 agent completion markers
- New: `.github/workflows/ci.yml`, `DEPENDENCY_AUDIT.md`, `vitest.config.ts`, `src/test/setup.ts`, `src/test/stubs/server-only.ts`, 11 test files, 5 layout components + 2 barrels, `DashboardShell.tsx`, 3 sentry config files, 4 `AGENT*_DONE.md` markers.
- Modified: `CLAUDE.md`, `README.md`, `package.json`, `package-lock.json`, `next.config.ts`, `.env.example`, `src/app/globals.css`, `src/app/(dashboard)/layout.tsx`, `src/server/trpc/trpc.ts`, `src/proxy.ts`, `src/app/api/sync/route.ts`.
