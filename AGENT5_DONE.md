# Phase G Agent 5 — SOC2 Hygiene (Complete)

**Date:** 2026-04-08
**Agent:** Phase G Agent 5
**Status:** COMPLETE
**Branch:** `phase-g/soc2-hygiene`
**Commits:** 4 new + existing audit logger/migration

## Completed Tasks

### T1: Migration — `029_audit_log.sql` ✓
- Append-only audit_log table with JSONB before/after snapshots
- RLS policy: admin+ can select from their facility
- Indexes on (facility_id, created_at DESC) and (user_id, created_at DESC)
- No UPDATE or DELETE policies (append-only by design)
- **Status:** Already merged in prior commits

### T2: Logger — `src/server/audit/logger.ts` ✓
- `scrubSnapshot()`: Recursively redacts sensitive keys (password, secret, token, api_key, stripe, hashed_secret, calendar_feed_token, signing_secret)
- `writeAuditLog()`: Async write to audit_log table via service-role client; errors logged but not thrown
- `logAdminMutation()`: Helper for admin procedures to call after success with before/after snapshots
- **Status:** Already merged in prior commits

### T3: Audited Procedure Helper ✓
- `logAdminMutation()` exported from `src/server/audit/logger.ts`
- Signature: `logAdminMutation(ctx, { action, resourceType, resourceId, before, after })`
- Called manually after mutations complete (no middleware complexity)
- **Status:** Ready to use across routers

### T4: Wire into Priority Admin Actions ✓
**Mutations wired in `src/server/trpc/routers/admin.ts`:**
1. `updateFacility` — logs facility profile changes
2. `setModuleEnabled` — logs module toggles
3. `updateUserRole` — logs staff role assignments
4. `updateRetentionPolicies` — logs retention policy changes
5. `getAuditLog` — NEW query to retrieve audit entries (30/90/365 days, optional email filter)

**Commit:** `feat(soc2): audit logging on high-value admin mutations`

### T5: Viewer + Data Export ✓

**A. `getAuditLog` tRPC Query** — Admin only, paginated, 30/90/365 days, optional email filter

**B. `AuditLogCard.tsx`** — Date range filter, email filter, CSV export, expandable rows with before/after JSON

**C. `/api/admin/data-export/route.ts`** — Exports all 10 facility data tables as JSON

**D. `/api/admin/data-delete/route.ts`** — Soft-deletes 4 retention-capable tables (super_admin only, requires confirmation phrase)

**Commit:** `feat(soc2): audit log viewer + data export/delete routes`

### T6: Tests ✓

**`auditLogger.test.ts`** — Scrubbing logic (recursive, case-insensitive, handles null)

**`dataExport.test.ts`** — Auth checks (401/403), JSON structure, headers, audit logging

**`dataDelete.test.ts`** — Auth checks, confirmation validation, soft-delete scope (preserves compliance), audit logging

**Commit:** `test: audit logger + data export + data delete`

## Key Implementation Details

- **All mutations capture before/after snapshots** for audit trail
- **Sensitive keys automatically redacted** (passwords, tokens, API keys, calendar feed tokens)
- **Service-role client used** for authenticated exports/deletes to bypass RLS
- **Super admin only for data deletion** (not just admin)
- **Compliance tables preserved:** incidents and air_quality_readings never soft-deleted
- **Audit log immutable:** cannot be deleted or modified (append-only)
- **Facility row preserved:** allows facility admins to understand history even after data deletion

## Files Created/Modified

**Modified:**
- `src/server/trpc/routers/admin.ts` — Added audit logging + getAuditLog procedure

**Created:**
- `src/app/(dashboard)/admin/_components/AuditLogCard.tsx` — Audit log viewer UI
- `src/app/api/admin/data-export/route.ts` — Data export endpoint
- `src/app/api/admin/data-delete/route.ts` — Data delete endpoint
- `src/test/soc2/auditLogger.test.ts` — Unit tests for scrubbing
- `src/test/soc2/dataExport.test.ts` — Tests for export endpoint
- `src/test/soc2/dataDelete.test.ts` — Tests for delete endpoint

## Session Info

**Worktree:** `/home/user/Rink-Reports-by-Max-Facility-LLC/.claude/worktrees/agent-a362fe1d`
**Branch:** `phase-g/soc2-hygiene`
**Latest Commits:**
- 2d01915: feat(soc2): audit logging on high-value admin mutations
- 275175a: feat(soc2): audit log viewer + data export/delete routes
- a59037b: test: audit logger + data export + data delete

**Ready for:** Code review + merge to main
