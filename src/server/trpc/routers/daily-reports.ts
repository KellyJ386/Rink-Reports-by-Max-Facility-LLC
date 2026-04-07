import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import {
  ChecklistItemSchema,
  type Checklist,
  type ChecklistItem,
} from "@/modules/daily-reports/schema";

/**
 * Staff-facing Daily Reports router.
 *
 * Reads only — submissions go through Dexie + /api/sync (CLAUDE.md
 * Rule 3 + Rule 7). The page calls these queries to render tabs and
 * a recent-activity list.
 *
 * facility_id always comes from ctx.facilityId; the row-level RLS
 * policies in migration 005 also enforce the scope at the database.
 */

function toChecklistItem(row: {
  id: string;
  checklist_id: string;
  position: number;
  label: string;
  type: string;
  required: boolean;
  options: unknown;
}): ChecklistItem {
  let options: string[] | null = null;
  if (Array.isArray(row.options)) {
    options = row.options.filter((v): v is string => typeof v === "string");
  }
  return ChecklistItemSchema.parse({
    id: row.id,
    checklist_id: row.checklist_id,
    position: row.position,
    label: row.label,
    type: row.type,
    required: row.required,
    options,
  });
}

export const dailyReportsRouter = router({
  /**
   * All checklists for the caller's facility, with their items
   * nested. Identical shape to admin.dailyReports.listChecklists,
   * but lives on the public router so non-admin staff can render
   * the form without needing the admin sub-router.
   */
  listChecklists: protectedProcedure.query(
    async ({ ctx }): Promise<Checklist[]> => {
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
    },
  ),

  /**
   * Most recent submissions for the caller's facility. Defaults to
   * 25; the page caps at 100. Used by the "Recent" panel under the
   * tabs. RLS scopes the rows to the caller's facility.
   */
  listRecent: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(25),
          checklist_id: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 25;
      let query = ctx.supabase
        .from("daily_reports")
        .select("id, checklist_id, submitted_at, submitted_by, answers")
        .eq("facility_id", ctx.facilityId)
        .order("submitted_at", { ascending: false })
        .limit(limit);

      if (input?.checklist_id) {
        query = query.eq("checklist_id", input.checklist_id);
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return data ?? [];
    }),
});
