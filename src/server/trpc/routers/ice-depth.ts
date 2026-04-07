import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc/trpc";
import {
  ResurfacingStatus,
  SessionStatus,
  toMeasurements,
  toPoints,
  type Measurements,
  type Template,
} from "@/modules/ice-depth/schema";

/**
 * Staff-facing sub-router for Ice Depth. Mounted at the top level
 * as `iceDepth`. Reads only — writes go through the offline-first
 * Dexie queue and /api/sync.
 */

export interface RecentIceDepthSession {
  id: string;
  template_id: string;
  submitted_at: string;
  submitted_by: string;
  status: "draft" | "completed";
  resurfacing_status: "pre" | "mid" | "post" | null;
  notes: string | null;
  measurements: Measurements;
  local_id: string | null;
}

export const iceDepthRouter = router({
  // -------------------------------------------------------------------
  // Templates available to the staff form.
  // -------------------------------------------------------------------
  listTemplates: protectedProcedure.query(
    async ({ ctx }): Promise<Template[]> => {
      const { data, error } = await ctx.supabase
        .from("ice_depth_templates")
        .select("id, facility_id, name, position, unit, points")
        .eq("facility_id", ctx.facilityId)
        .order("position", { ascending: true });
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
        unit: row.unit === "mm" ? "mm" : "in",
        points: toPoints(row.points),
      }));
    },
  ),

  // -------------------------------------------------------------------
  // Recent sessions for the read view.
  // -------------------------------------------------------------------
  listRecent: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }): Promise<RecentIceDepthSession[]> => {
      const { data, error } = await ctx.supabase
        .from("ice_depth_sessions")
        .select(
          "id, template_id, submitted_at, submitted_by, status, resurfacing_status, notes, measurements, local_id",
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

      return (data ?? []).map((row) => {
        const status = SessionStatus.safeParse(row.status);
        const resurfacing = row.resurfacing_status
          ? ResurfacingStatus.safeParse(row.resurfacing_status)
          : { success: true as const, data: null };
        return {
          id: row.id,
          template_id: row.template_id,
          submitted_at: row.submitted_at,
          submitted_by: row.submitted_by,
          status: status.success ? status.data : "draft",
          resurfacing_status: resurfacing.success
            ? (resurfacing.data ?? null)
            : null,
          notes: row.notes,
          measurements: toMeasurements(row.measurements),
          local_id: row.local_id,
        };
      });
    }),
});
