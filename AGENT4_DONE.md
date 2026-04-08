# Phase D — Agent 4 (Retention Policy) — Completion Marker

Branch: `phase-d/retention-policy`
Worktree: `/home/user/Rink-Reports-by-Max-Facility-LLC/.claude/worktrees/agent-aef8e7a8`

## Task Statuses

| Task | Description | Status | Commit SHA |
|------|-------------|--------|------------|
| 1 | Migrations 019 + 020 + RetentionPolicies type | DONE (pre-landed) | 3c32b1c |
| 2 | Retention sweep cron + vercel.json | DONE | e3cc2cd |
| 3 | Admin tRPC procedures + RetentionPolicyCard UI | DONE | 335d62f |
| 4 | Tests (cron + admin validation) | DONE | ac522c4 |

## Deliverables

### Migrations
- `supabase/migrations/019_retention_policies.sql` — adds `retention_policies JSONB` to `facility_config`
- `supabase/migrations/020_archived_at_columns.sql` — adds `archived_at TIMESTAMPTZ` to 4 data tables (NOT incidents or air_quality_readings)

### TypeScript types
- `src/lib/offline/types.ts` — `RetentionPolicies` type (pre-landed)
- `src/lib/database.types.ts` — `facility_config` Row/Insert/Update updated with `retention_policies` column

### Cron job
- `src/app/api/cron/retention-sweep/route.ts` — nightly 2am UTC, soft-delete + hard-delete after 30-day grace
- `vercel.json` — retention-sweep entry added to `crons` array

### Admin tRPC
- `src/server/trpc/routers/admin.ts` — `getRetentionPolicies` + `updateRetentionPolicies` procedures appended

### Admin UI
- `src/app/(dashboard)/admin/_components/RetentionPolicyCard.tsx` — 4 configurable fields (min 365), 2 compliance-locked rows
- `src/app/(dashboard)/admin/page.tsx` — RetentionPolicyCard wired in

### Tests
- `src/test/retention/retention.cron.test.ts` — 9 tests
- `src/test/retention/retention.admin.test.ts` — 12 tests
- Total suite: 179 tests passing across 26 files; typecheck clean

## Key Design Decisions
- `incidents` and `air_quality_readings` excluded from `RETENTION_TABLES` in cron — never touched regardless of policy config
- Admin can only set values >= 365 (Zod `min(365)`); compliance fields are `z.null()` — cannot be set to a number
- Soft delete sets `archived_at = NOW()`; hard delete purges when `archived_at < NOW() - 30 days`
- Bearer token auth via `CRON_SECRET` env var (matches Phase C anomaly-scan pattern)
