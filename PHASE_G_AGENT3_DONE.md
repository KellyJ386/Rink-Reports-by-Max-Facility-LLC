# Phase G Agent 3 — Multi-Facility Roll-up: DONE

## Branch
`phase-g/multi-facility`

## Final SHA
`fd05b55` (test: org roll-up procedures + RLS isolation)

## Worktree Path
`/home/user/Rink-Reports-by-Max-Facility-LLC/.claude/worktrees/agent-a1858bc8`

## Task Statuses

### Task 1 — Migrations ✅
Commit: `ef295a9` feat(multi): organizations + org_memberships schema + RLS helper

- `supabase/migrations/028_org_roll_up.sql` — organizations table, org_memberships table,
  facilities.organization_id FK column, get_user_org_ids() + get_user_org_role() SECURITY
  DEFINER helper functions, RLS policies on organizations + org_memberships + facilities
- `src/lib/database.types.ts` — hand-added organizations, org_memberships rows/inserts/updates,
  facilities.organization_id column, get_user_org_ids + get_user_org_role function signatures

### Task 2 — Role + Context Extension ✅
Commit: `b0902d0` feat(multi): org membership in TRPCContext + orgAdminProcedure

- `src/lib/auth/roles.ts` — added OrgRole type + isOrgAdmin() utility
- `src/server/trpc/context.ts` — extended TRPCContext with organizationIds[] + orgRoles{},
  populated from org_memberships query in createTRPCContext
- `src/server/trpc/trpc.ts` — added orgAdminProcedure (uses getRawInput() async API to peek at
  organizationId without imposing schema conflicts), resolves selectedOrgId in ctx

### Task 3 — orgRouter ✅
Commit: `fed3b54` feat(multi): org roll-up tRPC procedures

- `src/server/trpc/routers/org.ts` — listFacilities, getRollupMetrics, getFacilityAlerts
  (all gated by orgAdminProcedure)
- `src/server/trpc/routers/super-admin.ts` — createOrganization, addFacilityToOrg,
  inviteOrgAdmin (super_admin only), listOrganizations
- `src/server/trpc/routers/index.ts` — org + superAdmin registered in appRouter

### Task 4 — Org Roll-up Dashboard ✅
Commit: `0441520` feat(multi): org roll-up dashboard — facilities, metrics, alerts

- `src/app/(org)/layout.tsx` — server auth gate: org_admin membership required, redirects
  to /dashboard if not; shows Org Admin + Read Only badges
- `src/app/(org)/facilities/page.tsx` — card grid with plan badge, alert count, last
  report date, staff count, text filter; click → /dashboard (TODO: impersonation)
- `src/app/(org)/metrics/page.tsx` — 7/30/90d toggle + 7 stat cards + facilities table
  + client-side CSV export via Blob + URL.createObjectURL
- `src/app/(org)/alerts/page.tsx` — all unresolved alerts grouped by facility, collapsible
  sections, severity + module filter; read-only (no resolve button)

### Task 5 — Super Admin Org Creation + Invite ✅
Commit: `fed3b54` (included with Task 3 — superAdminRouter) + `0441520` (OrganizationCard)

- `src/server/trpc/routers/super-admin.ts` — createOrganization, addFacilityToOrg,
  inviteOrgAdmin (best-effort, email invite is TODO), listOrganizations
- `src/app/(dashboard)/admin/_components/OrganizationCard.tsx` — super_admin-only card
  with create org, add facility to org, invite org admin forms; auto-hides for non-admins
- `src/app/(dashboard)/admin/page.tsx` — OrganizationCard mounted above Devices section

### Task 6 — Tests ✅
Commit: `fd05b55` test: org roll-up procedures + RLS isolation

- `src/test/org/orgRouter.test.ts` — 10 tests covering orgAdminProcedure guard (pass/FORBIDDEN),
  listFacilities scope assertions, getRollupMetrics empty/aggregate cases, getFacilityAlerts
  facilityName join + severity sort
- `src/test/org/rollupRLS.test.ts` — 4 tests: org-a scope, org-b scope, getRollupMetrics scope,
  cross-org escalation rejection (FORBIDDEN)
- Updated 4 existing test files to include organizationIds/orgRoles in TRPCContext

## Test Results
342 tests passing across 45 files (up from 328). Typecheck clean.

## Key Design Decisions
1. `orgAdminProcedure` uses `getRawInput()` (async tRPC v11 API) to peek at
   `organizationId` from raw input before schema validation — avoids multi-input
   merge conflicts that occur when chaining `.input()` in middleware.
2. Org roles (org_admin/org_viewer) are orthogonal to facility roles — stored in
   org_memberships, NOT in user_profiles.role. ROLE_HIERARCHY is unchanged.
3. The (org) route group mirrors Phase C (viewer) pattern exactly.
4. All roll-up queries are READ-ONLY. No data entry from org scope ever.
5. facilityId scoping still applies to underlying queries; the roll-up is server-side
   aggregation iterating org facilities, never a client-side join.
6. inviteOrgAdmin is best-effort — requires Supabase admin.auth for email lookup,
   has a clear TODO comment for Phase G+ implementation.
