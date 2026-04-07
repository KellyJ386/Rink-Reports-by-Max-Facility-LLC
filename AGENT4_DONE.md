# Phase C Agent 4 — Viewer Role — Completion Marker

Branch: `phase-c/viewer-role`
Worktree: `/home/user/Rink-Reports-by-Max-Facility-LLC/.claude/worktrees/agent-abacb1fd`

## Task Statuses

| Task | Description | Status | Commit SHA |
|------|-------------|--------|------------|
| 1 | Add viewer to role types + DB migration | DONE | 92aa9e3 |
| 2 | Role guard utility + viewerProcedure + role in ctx | DONE | 66c5a0f |
| 3 | Viewer route group (layout + dashboard + alerts pages) | DONE | 3db52f7 |
| 4 | Proxy role-based route redirect | DONE | e834f44 |
| 5 | Admin: viewer role option in staff roster | DONE | 82cd1dc |
| 6 | Tests: role guards + proxy redirect | DONE | 0271f32 |

## Notes

### Task 1
`supabase/migrations/016_add_viewer_role.sql` extends the `public.user_role`
enum in-place (the foundation SQL used an enum type, not a CHECK constraint).
`database.types.ts` already included `viewer`; `Constants.public.Enums.user_role`
is `["super_admin","admin","manager","staff","viewer"]`.

### Task 2
`src/lib/auth/roles.ts` includes `super_admin: 5` since that role exists in the
existing DB enum. `viewerProcedure` blocks mutations only; queries are allowed.

### Task 3
`(viewer)/alerts/page.tsx` stubs `trpc.alerts.list.useQuery` pending Agent 2
(phase-c/anomaly-detection). `(viewer)/dashboard/page.tsx` renders a placeholder
pending Agent 1's insights charts. Both have clear TODO comments.

### Task 4
`viewerRedirectPath` is a pure exported helper in `proxy.ts` for testability.
The proxy does one extra DB query on `/dashboard` and `/viewer` paths when the
user is authenticated — acceptable for now.

### Task 5
`UserManagementCard.tsx` uses `Constants.public.Enums.user_role` which already
includes `viewer`. Added label capitalization so options render as "Viewer",
"Admin", "Super admin", etc.

### Task 6
Full test suite: **117 tests passing** across 17 files; `tsc --noEmit` clean.
`proxy.test.ts` tests the pure `viewerRedirectPath` helper rather than the full
Next.js middleware (which requires Next.js server environment to mock).
