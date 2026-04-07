# Agent 4 — Sentry & Infra — Completion Report

Branch: `phase-a/sentry-infra`
Feature commit: `4694dcd3a577c0562257a7cc5bd0683b3c255a68`

## Sub-step status

1. **package.json** — modified. Added `"@sentry/nextjs": "^8.40.0"` to dependencies. (Did not run npm install per instructions.)
2. **sentry.client.config.ts** — created at repo root with `Sentry.init({ dsn, tracesSampleRate: 0.2, environment })`.
3. **sentry.server.config.ts** — created at repo root with same init (no browser-only integrations).
4. **sentry.edge.config.ts** — created at repo root with same init.
5. **next.config.ts** — modified. Imported `withSentryConfig`, preserved existing `nextConfig` object, wrapped default export with `withSentryConfig(nextConfig, { silent: true, org, project }, { disableServerWebpackPlugin: false })`.
6. **src/server/trpc/trpc.ts** — modified. Imported `* as Sentry from "@sentry/nextjs"`. Added `errorFormatter` to `initTRPC.create()` that calls `Sentry.captureException(error)` when `shape.data?.code === "INTERNAL_SERVER_ERROR"`. Existing procedures preserved.
7. **src/proxy.ts** — modified. Imported Sentry. Wrapped entire `proxy()` body in try/catch; catch calls `Sentry.captureException(err)` then re-throws. All existing logic preserved inside the try block.
8. **src/app/api/sync/route.ts** — modified. Imported Sentry. Wrapped entire `POST` body in try/catch; catch reports to Sentry and returns `{ ok: false, error: "Internal error" }` with status 500. All existing logic preserved.
9. **.env.example** — modified. Appended Sentry block with `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.

## Notes / skipped items

- `npm install` not run, per instructions — `node_modules` will need a refresh on next install.
- No push, no PR — local commits only.
- Existing `nextConfig` object was minimal (`{}`) but preserved verbatim.
- `initTRPC` builder previously had no `errorFormatter`; one was added without removing other (none) options.
