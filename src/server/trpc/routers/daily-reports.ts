import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import {
  toChecklistItem,
  type Checklist,
  type DailyReportAnswers,
} from "@/modules/daily-reports/schema";

/**
 * Staff-facing sub-router for the Daily Reports module. Mounted at the
 * top level as `dailyReports` so the staff page can call it without
 * pulling in the admin namespace.
 *
 * Reads only — writes go through the offline-first Dexie queue and
 * /api/sync per CLAUDE.md Rule 3.
 *
 * Every procedure relies on `protectedProcedure` to guarantee a
 * resolved `ctx.facilityId`. RLS at the database is the second line of
 * defense (Rule 8).
 */

export interface RecentSubmission {
  id: string;
  checklist_id: string;
  submitted_at: string;
  submitted_by: string;
  answers: DailyReportAnswers;
  local_id: string | null;
}

function toAnswers(value: unknown): DailyReportAnswers {
  // The SQL column is `jsonb not null`, but TypeScript sees `Json`.
  // We trust the writer (our /api/sync handler validates with Zod
  // before insert) but still narrow defensively here.
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as DailyReportAnswers;
  }
  return {};
}

export const dailyReportsRouter = router({
  // -------------------------------------------------------------------
  // Pull: sync recent submissions to the client's Dexie cache.
  // Returns all rows updated since `input.since` for offline replay.
  // -------------------------------------------------------------------
  pull: protectedProcedure
    .input(z.object({ since: z.string().datetime() }))
    .query(async ({ ctx, input }): Promise<RecentSubmission[]> => {
      const { data, error } = await ctx.supabase
        .from("daily_reports")
        .select(
          "id, checklist_id, submitted_at, submitted_by, answers, local_id",
        )
        .eq("facility_id", ctx.facilityId)
        .gte("submitted_at", input.since)
        .order("submitted_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return (data ?? []).map((row) => ({
        id: row.id,
        checklist_id: row.checklist_id,
        submitted_at: row.submitted_at,
        submitted_by: row.submitted_by,
        answers: toAnswers(row.answers),
        local_id: row.local_id,
      }));
    }),


  // -------------------------------------------------------------------
  // Read: all checklists for the caller's facility, with items nested.
  // Same query the admin sub-router uses, exposed under a non-admin
  // namespace so module code does not have to reach into `admin.*`.
  // -------------------------------------------------------------------
  listChecklists: protectedProcedure.query(async ({ ctx }): Promise<Checklist[]> => {
    const { data, error } = await ctx.supabase
      .from("daily_report_checklists")
      .select(
        "id, facility_id, name, position, items:daily_report_items(id, checklist_id, position, label, type, required, options)",
      )
      .eq("facility_id", ctx.facilityId)
      .order("position", { ascending: true })
      .order("position", {
        ascending: true,
        referencedTable: "daily_report_items",
      });

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      facility_id: row.facility_id,
      name: row.name,
      position: row.position,
      items: (row.items ?? []).map(toChecklistItem),
    }));
  }),

  // -------------------------------------------------------------------
  // Read: most recent submissions for this facility.
  // -------------------------------------------------------------------
  listRecent: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }): Promise<RecentSubmission[]> => {
      const { data, error } = await ctx.supabase
        .from("daily_reports")
        .select(
          "id, checklist_id, submitted_at, submitted_by, answers, local_id",
        )
        .eq("facility_id", ctx.facilityId)
        .order("submitted_at", { ascending: false })
        .limit(input.limit);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return (data ?? []).map((row) => ({
        id: row.id,
        checklist_id: row.checklist_id,
        submitted_at: row.submitted_at,
        submitted_by: row.submitted_by,
        answers: toAnswers(row.answers),
        local_id: row.local_id,
      }));
    }),
});
