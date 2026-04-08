# Phase D — Compliance & Exports — COMPLETE

Date: 2026-04-08
Branch: `claude/rink-reports-assessment-1DBXg`

## Result

- `npm run typecheck` — clean
- `npm run test` — **245 passing** across 32 files (up from 158 in Phase C)
- All 4 specialist branches merged
- 68 new tests added across PDF, exports, formatters, retention, and report packs

## Specialist Branches

| Agent | Branch | Model | Status |
|---|---|---|---|
| 1 — PDF Exports | `phase-d/pdf-exports` | Sonnet | merged (resumed once after session boundary killed initial run) |
| 2 — CSV/XLSX Exports | `phase-d/csv-xlsx-exports` | Sonnet (Haiku rejected) | merged (resumed once) |
| 3 — Report Packs | `phase-d/report-packs` | Sonnet | merged |
| 4 — Retention Policy | `phase-d/retention-policy` | Sonnet (Haiku rejected) | merged |

Merge order executed: retention-policy → csv-xlsx-exports → pdf-exports → report-packs.

## Resume Cycle Note

Phase D Agents 1 and 2 were initially spawned in a session that ended before they completed. Their background Claude processes were terminated when the harness switched sessions. Both had only landed Task 1 of 5 on their branches before being killed. I re-spawned both agents in fresh worktrees with instructions to check out the existing partial branch and resume from Task 2. Both resumed cleanly and completed all remaining tasks.

This is a real limitation of async-background agents in the current harness: if the parent session is compressed or the process restarts before a background agent completes, that agent is orphaned and must be manually resumed.

## What Landed

### Agent 1 — PDF Exports
- `src/server/pdf/utils.ts` — shared `addHeader`, `addFooter`, `addSignaturePage`, `addSectionTitle`, `newPageIfNeeded`, `docToBase64`, `PAGE` constants. Navy header bar + green accent line, brand palette.
- `src/server/pdf/generators/` — 5 per-module generators: `dailyReport.ts`, `iceOperations.ts`, `refrigeration.ts`, `airQuality.ts`, `incidents.ts`. Each returns base64.
- tRPC `exports.dailyReportPdf`, `iceOperationsPdf`, `refrigerationPdf`, `airQualityPdf`, `incidentsPdf` — all scope by `ctx.facilityId`, all return `{ base64, filename }`.
- `src/hooks/usePdfExport.ts` — client hook with `downloadPdf(opts)` anchor-click.
- History component wiring: daily-reports `RecentSubmissions` and refrigeration `RecentRefrigerationReadings` got the Export PDF button. Other modules get ExportMenu via Agent 2's work.
- Tests: PDF utils + exports router (17 router tests).

### Agent 2 — CSV/XLSX Exports
- `src/server/exports/csv.ts` — native `arrayToCsv` with RFC-compliant escaping and UTF-8 BOM for Excel.
- `src/server/exports/xlsx.ts` — exceljs wrapper: `createWorkbook`, `addWorksheet` (bold navy headers, frozen top row, alternating row shading), `workbookToBase64`.
- `src/server/exports/formatters/` — 5 formatters handling JSONB fan-out (refrigeration compressor_readings → N rows, daily_reports answers → tab × field rows) and null coercion.
- tRPC `*Csv` + `*Xlsx` procedures for all 5 modules (10 procedures total).
- `src/components/ui/ExportMenu.tsx` — dropdown with Download PDF (optional), Download CSV, Download Excel. Click-outside close via ref + document listener. Spinner when exporting.
- Tests: 8 CSV tests + 25 formatter tests.

### Agent 3 — Report Packs
- `src/server/pdf/packs/oshaInjuryLog.ts` — OSHA 300 log (case-by-case table matching 29 CFR 1904 columns) + 300A summary. Annotated with field-level regulatory references and TODO comments for recordability determination and peak-employment/hours-worked inputs.
- `src/server/pdf/packs/epaRmpLog.ts` — Facility header, refrigerant inventory summary, operating log. `// 40 CFR Part 68` and PHA-scope TODO comments.
- `src/server/pdf/packs/usaHockeyRinkSafety.ts` — 5 sections: ice surface conditions (thin spots flagged red), air quality tier escalations, incident summary (high-frequency locations flagged), daily checklist completion, certification.
- `src/server/pdf/packs/monthlyBoardPack.ts` — 6 sections including auto-generated executive summary and ASCII `█░` bar charts (jsPDF can't embed recharts).
- tRPC `exports.oshaLog`, `epaRmpLog`, `usaHockeySafety`, `monthlyBoardPack` with year/date/month pickers.
- `src/app/(dashboard)/reports/page.tsx` — Report Packs page with 4 cards, localStorage "last generated" timestamps, per-card inline download.
- Reports nav item added to dashboard sidebar.
- Tests: 4 OSHA + 7 monthly board pack.

### Agent 4 — Retention Policy
- `supabase/migrations/019_retention_policies.sql` — `retention_policies` JSONB column on `facility_config` with defaults 365/365/730/1825/365 days and `incidents: null` (compliance record, never delete).
- `supabase/migrations/020_archived_at_columns.sql` — `archived_at TIMESTAMPTZ` on daily_reports, ice_operations, refrigeration_readings, ice_depth_sessions with partial indexes. NOT added to incidents or air_quality_readings.
- `src/app/api/cron/retention-sweep/route.ts` — Bearer-token auth, service-role client, per-facility loop with Promise.allSettled. Per-table: soft delete rows older than policy (UPDATE archived_at = now()), then hard delete rows where archived_at is older than 30 days. `incidents` and `air_quality_readings` table names do not appear in the code.
- `vercel.json` — `{ path: "/api/cron/retention-sweep", schedule: "0 2 * * *" }` appended.
- `src/app/(dashboard)/admin/_components/RetentionPolicyCard.tsx` — 4 number inputs (min 365), 2 locked "Never — compliance record" rows, warning banner about 30-day grace period.
- tRPC `admin.getRetentionPolicies` / `updateRetentionPolicies` with Zod `.min(365)` guards on editable fields and `z.null()` forced on incidents and airQualityReadings.
- Tests: 9 cron tests + 12 admin tests.

## Conflict Resolution Log

**`src/server/trpc/routers/exports.ts`** was the big one. Three agents (1, 2, 3) each created this file fresh on their own branches with different procedure sets:

- Agent 2 (csv-xlsx): 10 procedures (`*Csv`, `*Xlsx` for 5 modules)
- Agent 1 (pdf-exports): 5 procedures (`*Pdf` for 5 modules)
- Agent 3 (report-packs): 4 procedures (`oshaLog`, `epaRmpLog`, `usaHockeySafety`, `monthlyBoardPack`)

Each merge triggered an add/add conflict. I resolved by manually combining:

1. **csv-xlsx merge** — auto-merged (base branch already had Agent 2's Task 1 utils, so Task 1 was a no-op, and Tasks 2-5 content was all non-conflicting).
2. **pdf-exports merge** — conflict on exports.ts. Extracted both sides from the git index (stage 2 HEAD + stage 3 incoming), merged imports and both procedure sets into a single 756-line file with all 15 procedures.
3. **report-packs merge** — conflict on exports.ts again. Extracted the packs version, appended its 4 procedures and 2 helper functions (`yearRange`, `monthRange`) plus its imports into the growing file. Final: 19 procedures, 1321 lines.

Other merges auto-merged cleanly:
- `package.json` — exceljs added alongside existing deps
- `src/app/(dashboard)/admin/page.tsx` — RetentionPolicyCard + NotificationPrefsCard additive
- `src/lib/database.types.ts` — retention_policies column added alongside existing schema
- `vercel.json` — cron entry added to existing array

## Post-Merge Integration Fix

Single follow-up commit `e41a415 fix: post-merge Phase D — loosen retention mock type`:

- `src/test/retention/retention.cron.test.ts` — the default `makeQueryBuilder` mock's `maybeSingle` was typed with a specific `retention_policies` shape that conflicted when later tests overrode the mock with a subset of fields. Changed to `vi.fn((): Promise<any> => ...)` with an eslint-disable for the test infrastructure only. This is the conventional Vitest pattern when the mock is intentionally polymorphic.

## Phase D Gates — Status

| Gate | Status |
|---|---|
| Branded PDF exports per module | ✅ (5 generators + utils + download hook) |
| CSV / XLSX exports per module | ✅ (10 procedures + formatters + ExportMenu) |
| Predefined regulatory report packs | ✅ (OSHA 300/300A, EPA RMP, USA Hockey, monthly board) |
| Retention policy + nightly sweep | ✅ (migrations + admin UI + cron, compliance-safe) |
| typecheck + tests green | ✅ (245 passing) |

## Cost Framework Outcome

Framework called for 2 Sonnet + 2 Haiku. Actual: 4 Sonnet + 0 Haiku.

Haiku rejected both Haiku-targeted prompts at the harness level (same as Phases B and C). Every Phase D prompt needed enough context (schema references, migration file names, existing patterns) to exceed Haiku's per-task input ceiling. This appears to be a structural limit of the Agent tool in this environment, not solvable by further prompt compression. For Phase E onwards, Haiku should probably only be considered for tasks that are pure "do exactly what Agent X did, but for module Y" repetition — and even then, verification is needed.

## Carry-Forward Items for Phase E

1. **PDF export buttons** — only 2 of 5 module history pages got their Export PDF buttons wired (daily-reports, refrigeration). The other 3 modules still need ExportMenu integration. Small sweep task.
2. **`useModuleConfig` Dexie integration** — still pending from Phase A. The hook is still a thin tRPC wrapper.
3. **11 npm vulnerabilities** — unchanged since Phase B. Triage.
4. **CI workflow uses `lint:fix`** — still a Phase A carry-forward.
5. **Session-boundary agent orphaning** — if Phase E is run in a long session, background agents should be checked for completion before the session ends, or the orchestrator should be configured to wait on all agents before yielding. This bit Phase D twice (Agents 1 and 2 both orphaned).
6. **Async agent prompt-size limit on Haiku** — the spec's 2 Haiku / 2 Sonnet budget for Phase D wasn't achievable. Framework needs updating or prompt templates need to be dramatically more terse.

## Files Created / Modified Summary

- 4 merge commits + 1 post-merge fix commit + agent completion markers (per branch)
- New files: 1 shared PDF utils module, 5 per-module PDF generators, 4 regulatory pack generators, CSV + XLSX utilities, 5 formatters, 1 ExportMenu component, 1 usePdfExport hook, 1 retention sweep route, 1 retention admin card, Reports page + layout, 2 migrations (retention + archived_at), 17 PDF router tests + 33 CSV/formatter tests + 11 pack tests + 21 retention tests
- Modified: exports.ts (manually merged to 1321 lines with 19 procedures), CLAUDE.md, database.types.ts, admin router + page, dashboard layout (Reports nav), package.json (exceljs), vercel.json (retention cron), 2 module history components (Export PDF buttons)
